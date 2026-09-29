-- ============================================================
-- Fase 2 — Pagamento, fiado e financeiro.
--
-- Entrada + segunda forma de pagamento no PDV, taxa de maquineta no cartão, parcelas de
-- fiado com limite de crédito por cliente. Idempotente: pode ser colada e rodada mais de
-- uma vez sem erro (o SQL Editor do Supabase não envolve o script numa transação).
-- ============================================================

-- ============================================================
-- 1) formas_pagamento ganha `tipo` — é o que o PDV usa pra saber quando mostrar entrada,
--    vezes/taxa de maquineta ou parcelamento de fiado.
-- ============================================================

alter table formas_pagamento
  add column if not exists tipo text not null default 'outro'
    check (tipo in ('dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'fiado', 'outro'));

-- Backfill por nome, idempotente: só reclassifica quem ainda está em 'outro', então rodar
-- de novo não desfaz uma correção manual que o dono tenha feito depois.
update formas_pagamento set tipo = 'dinheiro'       where tipo = 'outro' and nome ~* 'dinheiro|esp[eé]cie';
update formas_pagamento set tipo = 'pix'            where tipo = 'outro' and nome ~* 'pix';
update formas_pagamento set tipo = 'cartao_credito' where tipo = 'outro' and nome ~* 'cr[eé]dito';
update formas_pagamento set tipo = 'cartao_debito'  where tipo = 'outro' and nome ~* 'd[eé]bito';
update formas_pagamento set tipo = 'fiado'          where tipo = 'outro' and nome ~* 'fiado';

-- ============================================================
-- 2) Limite de fiado por cliente. Padrão 0, não null: cliente com fiado liberado e sem
--    limite definido tem crédito disponível zero até o dono decidir um valor.
-- ============================================================

alter table clientes add column if not exists limite_fiado numeric not null default 0;

-- ============================================================
-- 3) vendas ganha as colunas do pagamento composto.
-- ============================================================

alter table vendas
  add column if not exists entrada_valor numeric not null default 0,
  add column if not exists entrada_forma text,
  add column if not exists forma_pagamento_2 text,
  add column if not exists parcelas_cartao integer,
  add column if not exists taxa_maquineta_pct numeric not null default 0,
  add column if not exists taxa_maquineta_valor numeric not null default 0,
  add column if not exists total_parcelas_fiado integer,
  add column if not exists status_envio text
    check (status_envio is null or status_envio in ('separacao', 'enviado', 'concluido'));

-- ============================================================
-- 4) venda_parcelas — só existe quando um fiado é parcelado. Fiado sem parcelamento
--    continua exatamente como sempre foi: uma linha em contas_a_pagar_receber, sem tabela
--    nova nenhuma envolvida.
-- ============================================================

create table if not exists venda_parcelas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  numero integer not null,
  total_parcelas integer not null,
  valor numeric not null,
  data_vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente', 'paga')),
  data_pagamento date,
  valor_pago numeric,
  conta_id uuid references contas(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (venda_id, numero)
);

alter table venda_parcelas enable row level security;

drop policy if exists "own_rows_venda_parcelas" on venda_parcelas;
create policy "own_rows_venda_parcelas" on venda_parcelas for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

create index if not exists venda_parcelas_venda_id_idx on venda_parcelas (venda_id);
create index if not exists venda_parcelas_user_status_idx on venda_parcelas (user_id, status, data_vencimento);

-- Mesmo trigger genérico que já protege as outras tabelas filhas (0026, 0029).
drop trigger if exists trg_valida_vinculo_venda_parcelas on venda_parcelas;
create trigger trg_valida_vinculo_venda_parcelas
before insert or update of venda_id on venda_parcelas
for each row execute function validar_vinculo_do_dono('venda_id', 'vendas');

-- ============================================================
-- 5) fiado_em_uso_cliente() — soma o que está pendente por duas fontes distintas: parcela
--    de fiado parcelado, e o fiado "de sempre" (linha única em contas_a_pagar_receber,
--    quando a venda não tem nenhuma linha em venda_parcelas). Definida antes de
--    registrar_venda porque ela é chamada de lá para checar o limite.
-- ============================================================

create or replace function fiado_em_uso_cliente(p_cliente_id uuid)
returns numeric
language sql
security invoker
stable
set search_path = public
as $$
  select coalesce(sum(valor), 0) from (
    select vp.valor as valor
    from venda_parcelas vp
    join vendas v on v.id = vp.venda_id
    where v.cliente_id = p_cliente_id and v.user_id = auth.uid() and vp.status = 'pendente'
    union all
    select cpr.valor
    from contas_a_pagar_receber cpr
    join vendas v on v.id = cpr.referencia_venda_id
    where v.cliente_id = p_cliente_id and v.user_id = auth.uid()
      and cpr.tipo = 'receber' and cpr.status = 'pendente'
      and not exists (select 1 from venda_parcelas vp2 where vp2.venda_id = v.id)
  ) t;
$$;

grant execute on function fiado_em_uso_cliente(uuid) to authenticated;

-- ============================================================
-- 6) registrar_venda — só parâmetros novos no FINAL, todos com padrão. A lista de retorno
--    não muda (venda_id, venda_numero, venda_total, venda_lucro), então CREATE OR REPLACE
--    é seguro sem DROP FUNCTION explícito (a armadilha do 0017 é só quando a lista de
--    RETURN muda).
-- ============================================================

create or replace function registrar_venda(
  p_itens jsonb,
  p_status text default 'paga',
  p_cliente_id uuid default null,
  p_conta_id uuid default null,
  p_forma_pagamento text default null,
  p_desconto numeric default 0,
  p_valor_entrega numeric default 0,
  p_observacao text default null,
  p_data_vencimento date default null,
  p_entrada_valor numeric default 0,
  p_entrada_forma text default null,
  p_forma_pagamento_2 text default null,
  p_parcelas_cartao integer default null,
  p_taxa_maquineta_pct numeric default 0,
  p_parcelas_fiado integer default 1,
  p_dias_entre_parcelas integer default 30
)
returns table (venda_id uuid, venda_numero text, venda_total numeric, venda_lucro numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user             uuid := auth.uid();
  v_venda            vendas%rowtype;
  v_subtotal         numeric := 0;
  v_custo_total      numeric := 0;
  v_desconto         numeric := round(coalesce(p_desconto, 0), 2);
  v_entrega          numeric := round(coalesce(p_valor_entrega, 0), 2);
  v_total            numeric;
  v_lucro            numeric;
  v_aliquota         numeric;
  v_imposto          numeric;
  v_cliente_nome     text;
  v_permite_fiado    boolean;
  v_produtos_ok      integer;
  v_produtos_pedidos integer;
  v_falta_nome       text;
  v_falta_estoque    integer;
  v_falta_qtd        integer;
  v_entrada          numeric := round(coalesce(p_entrada_valor, 0), 2);
  v_restante         numeric;
  v_taxa_maquineta   numeric := 0;
  v_forma_e_cartao   boolean;
  v_forma_label      text;
  v_limite_fiado     numeric;
  v_fiado_em_uso     numeric;
  v_parcela_valor    numeric;
  v_i                integer;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo para registrar a venda.';
  end if;

  if p_status not in ('paga', 'fiado') then
    raise exception 'Status de venda inválido: %', p_status;
  end if;

  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa ter pelo menos um item.';
  end if;

  if v_desconto < 0 or v_entrega < 0 then
    raise exception 'Desconto e entrega não podem ser negativos.';
  end if;

  if v_entrada < 0 then
    raise exception 'O valor da entrada não pode ser negativo.';
  end if;

  if v_entrada > 0 and p_entrada_forma not in ('dinheiro', 'pix') then
    raise exception 'A entrada só pode ser em dinheiro ou pix.';
  end if;

  if p_parcelas_fiado is null or p_parcelas_fiado < 1 then
    p_parcelas_fiado := 1;
  end if;
  if p_parcelas_fiado > 24 then
    raise exception 'Máximo de 24 parcelas.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_itens) i
    where (i->>'quantidade')::integer <= 0 or (i->>'preco_unitario')::numeric < 0
  ) then
    raise exception 'Todo item precisa de quantidade maior que zero e preço não negativo.';
  end if;

  -- 1. Trava as linhas de produto da venda em ordem crescente de id. A ordem
  --    importa: dois caixas vendendo itens em comum travariam em ordens
  --    diferentes e dariam deadlock.
  perform 1
  from produtos p
  where p.user_id = v_user
    and p.id in (select distinct (i->>'produto_id')::uuid from jsonb_array_elements(p_itens) i)
  order by p.id
  for update;

  -- Item apagado, ou de outro usuário, sai do join em silêncio e ficaria sem
  -- baixa de estoque. Conferir a contagem fecha esse buraco.
  select count(*) into v_produtos_ok
  from produtos p
  where p.user_id = v_user
    and p.id in (select distinct (i->>'produto_id')::uuid from jsonb_array_elements(p_itens) i);

  select count(distinct (i->>'produto_id')::uuid) into v_produtos_pedidos
  from jsonb_array_elements(p_itens) i;

  if v_produtos_ok <> v_produtos_pedidos then
    raise exception 'Um ou mais produtos da venda não existem mais ou não pertencem a você.';
  end if;

  -- 2. Valida o saldo com as quantidades AGREGADAS por produto: o mesmo SKU
  --    pode entrar em mais de uma linha do carrinho, e validar linha a linha
  --    deixaria passar 3 + 3 com estoque 5.
  select p.nome || coalesce(' — ' || p.variante_nome, ''), p.estoque, agg.qtd
  into v_falta_nome, v_falta_estoque, v_falta_qtd
  from (
    select (i->>'produto_id')::uuid as produto_id,
           sum((i->>'quantidade')::integer) as qtd
    from jsonb_array_elements(p_itens) i
    group by 1
  ) agg
  join produtos p on p.id = agg.produto_id and p.user_id = v_user
  where p.estoque < agg.qtd
  limit 1;

  if found then
    raise exception 'Estoque insuficiente de "%": disponível %, pedido %.',
      v_falta_nome, v_falta_estoque, v_falta_qtd;
  end if;

  -- 3. Totais. O custo vem das linhas já travadas.
  select coalesce(sum(round((i->>'preco_unitario')::numeric * (i->>'quantidade')::integer, 2)), 0)
  into v_subtotal
  from jsonb_array_elements(p_itens) i;

  select coalesce(sum(round(p.custo * (i->>'quantidade')::integer, 2)), 0)
  into v_custo_total
  from jsonb_array_elements(p_itens) i
  join produtos p on p.id = (i->>'produto_id')::uuid and p.user_id = v_user;

  if v_desconto > v_subtotal then
    raise exception 'O desconto (%) é maior que o valor dos itens (%).', v_desconto, v_subtotal;
  end if;

  select aliquota_das into v_aliquota from perfil_negocio where user_id = v_user;
  v_imposto := round(coalesce(v_aliquota, 0) / 100 * (v_subtotal - v_desconto), 2);

  v_total := round(v_subtotal - v_desconto + v_entrega, 2);

  if v_entrada > v_total then
    raise exception 'A entrada (%) não pode ser maior que o total da venda (%).', v_entrada, v_total;
  end if;
  v_restante := round(v_total - v_entrada, 2);

  -- Taxa de maquineta: só faz sentido quando a forma que fecha o restante é cartão de
  -- crédito. Reduz o lucro, não o valor creditado no caixa — mesmo padrão do imposto: o
  -- caixa recebe o valor cheio, é o lucro que sente o desconto.
  if p_taxa_maquineta_pct > 0 then
    select exists (
      select 1 from formas_pagamento
      where user_id = v_user
        and nome = coalesce(p_forma_pagamento_2, p_forma_pagamento)
        and tipo = 'cartao_credito'
    ) into v_forma_e_cartao;

    if not v_forma_e_cartao then
      raise exception 'Taxa de maquineta só se aplica a cartão de crédito.';
    end if;

    v_taxa_maquineta := round(v_restante * p_taxa_maquineta_pct / 100, 2);
  end if;

  v_lucro := round(v_subtotal - v_desconto - v_custo_total - v_imposto - v_taxa_maquineta, 2);

  -- Rótulo pronto para exibir em Vendas e no comprovante — o resto do sistema que já lê
  -- `vendas.forma_pagamento` continua funcionando sem mudança nenhuma.
  if v_entrada > 0 then
    v_forma_label := initcap(p_entrada_forma) || ' (entrada)';
    if p_forma_pagamento_2 is not null then
      v_forma_label := v_forma_label || ' + ' || p_forma_pagamento_2;
    end if;
  else
    v_forma_label := p_forma_pagamento;
  end if;
  if p_parcelas_cartao is not null and p_parcelas_cartao > 1 then
    v_forma_label := v_forma_label || ' ' || p_parcelas_cartao::text || 'x';
  end if;
  if v_taxa_maquineta > 0 then
    v_forma_label := v_forma_label || format(' — taxa maquineta %s%%', p_taxa_maquineta_pct);
  end if;

  -- 4. Cliente e regras de fiado.
  if p_cliente_id is not null then
    select nome, permite_fiado into v_cliente_nome, v_permite_fiado
    from clientes
    where id = p_cliente_id and user_id = v_user;

    if not found then
      raise exception 'Cliente não encontrado ou não pertence a você.';
    end if;
  end if;

  if p_status = 'fiado' then
    if p_cliente_id is null then
      raise exception 'Venda fiado precisa de um cliente identificado.';
    end if;
    if not v_permite_fiado then
      raise exception 'O cliente "%" não está autorizado a comprar fiado.', v_cliente_nome;
    end if;

    if v_restante > 0 then
      select limite_fiado into v_limite_fiado from clientes where id = p_cliente_id and user_id = v_user;
      select fiado_em_uso_cliente(p_cliente_id) into v_fiado_em_uso;

      if v_restante + coalesce(v_fiado_em_uso, 0) > coalesce(v_limite_fiado, 0) then
        raise exception 'Limite de fiado insuficiente para "%": disponível %, necessário %.',
          v_cliente_nome, coalesce(v_limite_fiado, 0) - coalesce(v_fiado_em_uso, 0), v_restante;
      end if;
    end if;
  elsif p_conta_id is null then
    raise exception 'Escolha a conta que vai receber o valor da venda.';
  end if;

  if v_entrada > 0 and p_conta_id is null then
    raise exception 'Escolha a conta que vai receber a entrada.';
  end if;

  -- 5. A venda (o número vem do trigger).
  insert into vendas (
    user_id, cliente_id, cliente_nome, status, subtotal, desconto, valor_entrega,
    total, custo_total, lucro, forma_pagamento, conta_id, observacao,
    imposto_pct, imposto_valor,
    entrada_valor, entrada_forma, forma_pagamento_2, parcelas_cartao,
    taxa_maquineta_pct, taxa_maquineta_valor
  ) values (
    v_user, p_cliente_id, v_cliente_nome, p_status, v_subtotal, v_desconto, v_entrega,
    v_total, v_custo_total, v_lucro, v_forma_label, p_conta_id, p_observacao,
    coalesce(v_aliquota, 0) / 100, v_imposto,
    v_entrada, p_entrada_forma, p_forma_pagamento_2, p_parcelas_cartao,
    p_taxa_maquineta_pct, v_taxa_maquineta
  )
  returning * into v_venda;

  -- 6. Itens, com snapshot de nome (já com a variante), SKU, preço e custo.
  insert into venda_itens (
    venda_id, produto_id, produto_nome, produto_sku, quantidade, preco_unitario, custo_unitario
  )
  select v_venda.id,
         p.id,
         p.nome || coalesce(' — ' || p.variante_nome, ''),
         p.sku,
         (i->>'quantidade')::integer,
         round((i->>'preco_unitario')::numeric, 2),
         p.custo
  from jsonb_array_elements(p_itens) i
  join produtos p on p.id = (i->>'produto_id')::uuid and p.user_id = v_user;

  -- 7. Baixa de estoque — sem greatest(0, ...): se chegou aqui há saldo, e a
  --    constraint produtos_estoque_nao_negativo aborta a transação se não houver.
  update produtos p
  set estoque = p.estoque - agg.qtd
  from (
    select (i->>'produto_id')::uuid as produto_id,
           sum((i->>'quantidade')::integer) as qtd
    from jsonb_array_elements(p_itens) i
    group by 1
  ) agg
  where p.id = agg.produto_id and p.user_id = v_user;

  insert into estoque_movimentacoes (
    user_id, produto_id, produto_nome, tipo, quantidade, motivo, data_movimentacao
  )
  select v_user,
         p.id,
         p.nome || coalesce(' — ' || p.variante_nome, ''),
         'saida',
         (i->>'quantidade')::integer,
         'Venda ' || v_venda.numero,
         now()
  from jsonb_array_elements(p_itens) i
  join produtos p on p.id = (i->>'produto_id')::uuid and p.user_id = v_user;

  -- 8a. Entrada: dinheiro que já entrou de verdade, registrada na hora, independente do
  --     status final da venda (paga ou fiado).
  if v_entrada > 0 then
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id
    ) values (
      v_user, 'entrada', v_entrada,
      'Entrada — venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
      'PDV', 'Entrada de venda', p_conta_id, true, current_date, v_venda.id
    );

    update contas set saldo = saldo + v_entrada where id = p_conta_id and user_id = v_user;
    if not found then
      raise exception 'Conta não encontrada ou não pertence ao usuário atual';
    end if;
  end if;

  -- 8b. O restante: entra agora (paga) ou vira dívida do cliente (fiado), parcelada ou não.
  if p_status = 'paga' then
    if v_restante > 0 then
      insert into movimentacoes_financeiras (
        user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
        data_movimentacao, referencia_venda_id
      ) values (
        v_user, 'entrada', v_restante,
        'Venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
        'PDV', 'Vendas', p_conta_id, true, current_date, v_venda.id
      );

      update contas set saldo = saldo + v_restante where id = p_conta_id and user_id = v_user;
      if not found then
        raise exception 'Conta não encontrada ou não pertence ao usuário atual';
      end if;
    end if;
  elsif v_restante > 0 then
    if p_parcelas_fiado <= 1 then
      -- Fiado sem parcelamento: exatamente como sempre foi.
      insert into contas_a_pagar_receber (
        user_id, tipo, descricao, valor, data_vencimento, status, conta_id,
        cliente_id, referencia_venda_id
      ) values (
        v_user, 'receber',
        'Fiado — venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
        v_restante, coalesce(p_data_vencimento, current_date + 30), 'pendente', p_conta_id,
        p_cliente_id, v_venda.id
      );
    else
      -- Fiado parcelado: uma linha "pai" em contas_a_pagar_receber (é a que aparece na
      -- lista principal do Financeiro) e uma linha por parcela em venda_parcelas. O resto
      -- do arredondamento (centavos que não dividem exato) vai pra última parcela.
      v_parcela_valor := round(v_restante / p_parcelas_fiado, 2);
      for v_i in 1..p_parcelas_fiado loop
        insert into venda_parcelas (user_id, venda_id, numero, total_parcelas, valor, data_vencimento)
        values (
          v_user, v_venda.id, v_i, p_parcelas_fiado,
          case
            when v_i = p_parcelas_fiado then round(v_restante - v_parcela_valor * (p_parcelas_fiado - 1), 2)
            else v_parcela_valor
          end,
          coalesce(p_data_vencimento, current_date + 30) + (v_i - 1) * p_dias_entre_parcelas
        );
      end loop;

      insert into contas_a_pagar_receber (
        user_id, tipo, descricao, valor, data_vencimento, status, conta_id,
        cliente_id, referencia_venda_id
      ) values (
        v_user, 'receber',
        format('Fiado — venda %s%s (%s parcelas)', v_venda.numero, coalesce(' — ' || v_cliente_nome, ''), p_parcelas_fiado),
        v_restante, coalesce(p_data_vencimento, current_date + 30), 'pendente', p_conta_id,
        p_cliente_id, v_venda.id
      );

      update vendas set total_parcelas_fiado = p_parcelas_fiado where id = v_venda.id;
    end if;
  end if;

  return query select v_venda.id, v_venda.numero, v_total, v_lucro;
end;
$$;

-- ============================================================
-- 7) marcar_parcela_paga — o evento real de caixa de cada parcela. Quando a última
--    parcela pendente de uma venda é paga, o registro "pai" em contas_a_pagar_receber muda
--    de status sozinho, sem gerar uma segunda movimentação (o dinheiro já entrou, parcela
--    por parcela).
-- ============================================================

create or replace function marcar_parcela_paga(
  p_parcela_id uuid,
  p_valor_pago numeric,
  p_data_pagamento date,
  p_conta_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_parcela venda_parcelas%rowtype;
  v_venda vendas%rowtype;
  v_todas_pagas boolean;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo para registrar o pagamento.';
  end if;

  select * into v_parcela from venda_parcelas where id = p_parcela_id and user_id = v_user for update;
  if not found then
    raise exception 'Parcela não encontrada ou não pertence a você.';
  end if;
  if v_parcela.status = 'paga' then
    raise exception 'Esta parcela já está paga.';
  end if;
  if p_valor_pago is null or p_valor_pago <= 0 then
    raise exception 'Informe o valor recebido.';
  end if;
  if p_conta_id is null then
    raise exception 'Escolha a conta que recebeu o pagamento.';
  end if;

  select * into v_venda from vendas where id = v_parcela.venda_id and user_id = v_user;

  update venda_parcelas
  set status = 'paga', data_pagamento = coalesce(p_data_pagamento, current_date),
      valor_pago = p_valor_pago, conta_id = p_conta_id
  where id = p_parcela_id;

  insert into movimentacoes_financeiras (
    user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
    data_movimentacao, referencia_venda_id
  ) values (
    v_user, 'entrada', p_valor_pago,
    format('Venda %s — parcela %s/%s', v_venda.numero, v_parcela.numero, v_parcela.total_parcelas),
    'Fiado', 'Recebimento de fiado', p_conta_id, true, coalesce(p_data_pagamento, current_date), v_venda.id
  );

  update contas set saldo = saldo + p_valor_pago where id = p_conta_id and user_id = v_user;
  if not found then
    raise exception 'Conta não encontrada ou não pertence ao usuário atual';
  end if;

  select not exists (
    select 1 from venda_parcelas where venda_id = v_parcela.venda_id and status = 'pendente'
  ) into v_todas_pagas;

  if v_todas_pagas then
    update contas_a_pagar_receber
    set status = 'recebido'
    where referencia_venda_id = v_parcela.venda_id and tipo = 'receber' and user_id = v_user;
  end if;
end;
$$;

grant execute on function marcar_parcela_paga(uuid, numeric, date, uuid) to authenticated;

-- ============================================================
-- 8) parcelas_da_venda — leitura simples, pro modal de "Visualizar parcelas".
-- ============================================================

create or replace function parcelas_da_venda(p_venda_id uuid)
returns setof venda_parcelas
language sql
security invoker
stable
set search_path = public
as $$
  select * from venda_parcelas where venda_id = p_venda_id and user_id = auth.uid() order by numero;
$$;

grant execute on function parcelas_da_venda(uuid) to authenticated;

-- ============================================================
-- 9) cancelar_venda — generalizada para reverter qualquer combinação de movimentações
--    ligadas à venda (entrada isolada, venda paga, parcelas de fiado já pagas) e para
--    apagar parcelas que ainda não venceram. `desfazer_movimentacao_financeira` (0005)
--    APAGA a movimentação e desfaz o saldo — não marca como estornada, então o laço abaixo
--    reflete exatamente esse comportamento, sem reescrever a lógica dela.
--
--    Generalização em relação à 0018: antes, o ramo "fiado" só ia atrás de movimentações
--    quando `contas_a_pagar_receber.status <> 'pendente'` (só existia o caminho de
--    quitação única). Com parcelas, uma venda fiado pode ter movimentações (entrada,
--    parcelas já pagas) mesmo com o registro "pai" ainda `pendente` — por isso o laço
--    agora roda sempre, sem a checagem de status antes.
-- ============================================================

create or replace function cancelar_venda(p_venda_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_venda    vendas%rowtype;
  v_cpr      contas_a_pagar_receber%rowtype;
  v_mov      record;
  v_estornos integer := 0;
begin
  select * into v_venda
  from vendas
  where id = p_venda_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Venda não encontrada ou não pertence a você.';
  end if;

  if v_venda.status = 'cancelada' then
    raise exception 'A venda % já foi cancelada.', v_venda.numero;
  end if;

  -- 1. Devolve o estoque (itens cujo produto foi apagado só geram log).
  update produtos p
  set estoque = p.estoque + agg.qtd
  from (
    select produto_id, sum(quantidade) as qtd
    from venda_itens
    where venda_id = p_venda_id and produto_id is not null
    group by 1
  ) agg
  where p.id = agg.produto_id and p.user_id = v_user;

  insert into estoque_movimentacoes (
    user_id, produto_id, produto_nome, tipo, quantidade, motivo, data_movimentacao
  )
  select v_user, vi.produto_id, vi.produto_nome, 'entrada', vi.quantidade,
         'Cancelamento da venda ' || v_venda.numero, now()
  from venda_itens vi
  where vi.venda_id = p_venda_id;

  -- 2. Financeiro.
  if v_venda.status = 'paga' then
    for v_mov in
      select id from movimentacoes_financeiras
      where referencia_venda_id = p_venda_id and user_id = v_user
    loop
      perform desfazer_movimentacao_financeira(v_mov.id);
      v_estornos := v_estornos + 1;
    end loop;

    if v_estornos = 0 then
      raise exception
        'A entrada no caixa da venda % não foi encontrada. Estorne o lançamento manualmente no Financeiro antes de cancelar.',
        v_venda.numero;
    end if;
  else
    -- Fiado: reverte toda movimentação ligada à venda (entrada isolada, parcelas já
    -- pagas) — zero movimentações é um estado válido agora (fiado ainda 100% em aberto),
    -- então, diferente do ramo "paga" acima, não há exceção por "nada encontrado".
    for v_mov in
      select id from movimentacoes_financeiras
      where referencia_venda_id = p_venda_id and user_id = v_user
    loop
      perform desfazer_movimentacao_financeira(v_mov.id);
    end loop;

    delete from venda_parcelas where venda_id = p_venda_id and user_id = v_user;

    select * into v_cpr
    from contas_a_pagar_receber
    where referencia_venda_id = p_venda_id and user_id = v_user
    for update;

    if found then
      delete from contas_a_pagar_receber where id = v_cpr.id;
    end if;
  end if;

  update vendas
  set status = 'cancelada', cancelada_em = now()
  where id = p_venda_id and user_id = v_user;
end;
$$;

NOTIFY pgrst, 'reload schema';

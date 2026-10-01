-- ============================================================
-- 0052 — Esteira de expedição do ERP + RESERVA de estoque (Fase 10.3).
--
-- Etapas (vendas.etapa): reservar → emitir → enviar → imprimir → retirada → enviado →
-- concluido.
--   * Para Reservar: pedido com problema (sem estoque disponível ou item não mapeado).
--   * Ao passar de Para Enviar → Para Imprimir a RESERVA vira BAIXA definitiva.
--   * PDV balcão continua baixando na hora: com entrega entra Enviado; sem, Concluído.
--   * Pedido do catálogo aprovado: registrar_venda(..., p_reservar => true) reserva e
--     entra em Para Enviar (ou Para Reservar se faltar estoque).
--   * Shopee/marketplace: pago esperando envio RESERVA; PROCESSED/enviado BAIXA.
--
-- Disponível = produtos.estoque (físico) − Σ estoque_reservas. A view estoque_disponivel
-- expõe os três números. Cancelar venda só reservada libera a reserva (não "devolve").
--
-- As funções registrar_venda (0032), cancelar_venda (0030), importar_pedidos_marketplace
-- (0046) e revincular_itens_marketplace (0047) foram copiadas e mudam SÓ no que a reserva
-- exige (gerado por script, para não divergir do original).
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Reservas -----------------------------------------------------------------------------
create table if not exists estoque_reservas (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users on delete cascade,
  produto_id            uuid not null references produtos(id) on delete cascade,
  quantidade            integer not null check (quantidade > 0),
  origem                text not null check (origem in ('venda', 'marketplace')),
  venda_id              uuid references vendas(id) on delete cascade,
  pedido_marketplace_id uuid references pedidos_marketplace(id) on delete cascade,
  criado_em             timestamptz not null default now(),
  check ((venda_id is not null) <> (pedido_marketplace_id is not null))
);
create unique index if not exists estoque_reservas_venda_produto on estoque_reservas (venda_id, produto_id) where venda_id is not null;
create unique index if not exists estoque_reservas_mkt_produto on estoque_reservas (pedido_marketplace_id, produto_id) where pedido_marketplace_id is not null;
create index if not exists estoque_reservas_produto_idx on estoque_reservas (produto_id);

alter table estoque_reservas enable row level security;
drop policy if exists "le_estoque_reservas" on estoque_reservas;
-- As RPCs de venda rodam como o usuário (security invoker): o dono grava as próprias reservas.
drop policy if exists "dono_estoque_reservas" on estoque_reservas;
create policy "dono_estoque_reservas" on estoque_reservas for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

create or replace view estoque_disponivel with (security_invoker = true) as
select p.id as produto_id,
       p.user_id,
       p.estoque as fisico,
       coalesce(r.reservado, 0)::integer as reservado,
       (p.estoque - coalesce(r.reservado, 0))::integer as disponivel
  from produtos p
  left join (select produto_id, sum(quantidade) as reservado from estoque_reservas group by produto_id) r on r.produto_id = p.id;

-- 2) Etapas novas -------------------------------------------------------------------------
alter table vendas add column if not exists estoque_baixado boolean not null default true;
alter table pedidos_marketplace add column if not exists estoque_reservado boolean not null default false;

create or replace function sincronizar_etapa_venda()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.etapa is null then
      new.etapa := case
        when new.status_envio = 'separacao' then 'enviar'
        when new.status_envio = 'enviado' then 'enviado'
        when new.status_envio = 'concluido' then 'concluido'
        -- Balcão: com entrega já sai (Enviado); sem entrega, Concluído.
        when coalesce(new.valor_entrega, 0) > 0 then 'enviado'
        else 'concluido'
      end;
    end if;
    if new.status_envio is null then
      new.status_envio := case
        when new.etapa in ('reservar', 'emitir', 'enviar', 'imprimir', 'retirada') then 'separacao'
        when new.etapa = 'enviado' then 'enviado'
        else null
      end;
    end if;
  elsif new.etapa is distinct from old.etapa then
    new.status_envio := case new.etapa
      when 'enviado' then 'enviado'
      when 'concluido' then case when old.status_envio is null then null else 'concluido' end
      else 'separacao'
    end;
  elsif new.status_envio is distinct from old.status_envio then
    new.etapa := case new.status_envio
      when 'separacao' then case when old.etapa in ('reservar', 'emitir', 'enviar', 'imprimir', 'retirada') then old.etapa else 'enviar' end
      when 'enviado' then 'enviado'
      else 'concluido'
    end;
  end if;
  return new;
end;
$$;

-- Ordem nova (do ERP): Enviar vem antes de Imprimir. As vendas que estavam no meio do
-- caminho já tinham baixado o estoque (estoque_baixado = true, padrão da coluna).
-- Só uma vez: se a regra da etapa já aceita 'retirada', a renumeração já foi feita
-- (rodar de novo andaria as etapas mais um passo).
do $$
declare
  v_def text;
begin
  select pg_get_constraintdef(oid) into v_def from pg_constraint where conname = 'vendas_etapa_valida';
  if v_def is null or v_def not like '%retirada%' then
    alter table vendas drop constraint if exists vendas_etapa_valida;
    update vendas set etapa = case etapa when 'imprimir' then 'enviar' when 'enviar' then 'retirada' else etapa end
     where etapa in ('imprimir', 'enviar');
    alter table vendas add constraint vendas_etapa_valida
      check (etapa is null or etapa in ('reservar', 'emitir', 'enviar', 'imprimir', 'retirada', 'enviado', 'concluido'));
  end if;
end $$;

-- 3) Funções com reserva ------------------------------------------------------------------
drop function if exists registrar_venda(jsonb, text, uuid, uuid, text, numeric, numeric, text, date, numeric, text, text, integer, numeric, integer, integer);

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
  p_dias_entre_parcelas integer default 30,
  -- 0052: pedido que segue a esteira (catálogo aprovado) RESERVA em vez de baixar.
  p_reservar boolean default false
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
  v_falta            boolean := false;
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
  -- 0052: o que vale é o DISPONÍVEL (físico − reservado por pedidos na esteira).
  select p.nome || coalesce(' — ' || p.variante_nome, ''),
         p.estoque - coalesce((select sum(r.quantidade) from estoque_reservas r where r.produto_id = p.id), 0),
         agg.qtd
  into v_falta_nome, v_falta_estoque, v_falta_qtd
  from (
    select (i->>'produto_id')::uuid as produto_id,
           sum((i->>'quantidade')::integer) as qtd
    from jsonb_array_elements(p_itens) i
    group by 1
  ) agg
  join produtos p on p.id = agg.produto_id and p.user_id = v_user
  where p.estoque - coalesce((select sum(r.quantidade) from estoque_reservas r where r.produto_id = p.id), 0) < agg.qtd
  limit 1;

  if found then
    if p_reservar then
      -- Pedido da esteira sem estoque não trava: entra em "Para Reservar" sem reserva.
      v_falta := true;
    else
      raise exception 'Estoque insuficiente de "%": disponível %, pedido %.',
        v_falta_nome, v_falta_estoque, v_falta_qtd;
    end if;
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
    taxa_maquineta_pct, taxa_maquineta_valor,
    etapa, estoque_baixado
  ) values (
    v_user, p_cliente_id, v_cliente_nome, p_status, v_subtotal, v_desconto, v_entrega,
    v_total, v_custo_total, v_lucro, v_forma_label, p_conta_id, p_observacao,
    coalesce(v_aliquota, 0) / 100, v_imposto,
    v_entrada, p_entrada_forma, p_forma_pagamento_2, p_parcelas_cartao,
    p_taxa_maquineta_pct, v_taxa_maquineta,
    -- Balcão (sem reserva): o gatilho decide (com entrega = Enviado, sem = Concluído).
    case when p_reservar then (case when v_falta then 'reservar' else 'enviar' end) else null end,
    not p_reservar
  )
  returning * into v_venda;

  -- 6. Itens, com snapshot de nome (já com a variante), SKU, preço e custo.
  insert into venda_itens (
    venda_id, produto_id, produto_nome, produto_sku, quantidade, preco_unitario, custo_unitario,
    garantia_dias
  )
  select v_venda.id,
         p.id,
         p.nome || coalesce(' — ' || p.variante_nome, ''),
         p.sku,
         (i->>'quantidade')::integer,
         round((i->>'preco_unitario')::numeric, 2),
         p.custo,
         nullif((i->>'garantia_dias')::integer, 0)
  from jsonb_array_elements(p_itens) i
  join produtos p on p.id = (i->>'produto_id')::uuid and p.user_id = v_user;

  -- 7. Baixa de estoque — sem greatest(0, ...): se chegou aqui há saldo, e a
  --    constraint produtos_estoque_nao_negativo aborta a transação se não houver.
  --    0052: pedido da esteira só RESERVA; a baixa acontece ao passar para Imprimir.
  if p_reservar then
    if not v_falta then
      insert into estoque_reservas (user_id, produto_id, quantidade, origem, venda_id)
      select v_user, (i->>'produto_id')::uuid, sum((i->>'quantidade')::integer), 'venda', v_venda.id
        from jsonb_array_elements(p_itens) i
       group by (i->>'produto_id')::uuid;
    end if;
  else
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
  end if;

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
  --    0052: se o pedido ainda estava só RESERVADO (não saiu do estoque), libera a reserva.
  if not coalesce(v_venda.estoque_baixado, true) then
    delete from estoque_reservas where venda_id = p_venda_id and user_id = v_user;
  else
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
  end if;

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

create or replace function importar_pedidos_marketplace(p_loja_id uuid, p_pedidos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_loja     text;
  v_armazem  uuid;
  v_p        jsonb;
  v_i        jsonb;
  v_id       uuid;
  v_antigo   record;
  v_status   text;
  v_baixa    boolean;
  v_baixado  boolean;
  v_reserva  boolean;
  v_reservado boolean;
  v_pago     boolean;
  v_conta    uuid;
  v_repasse  numeric;
  v_venc     date;
  v_prod     uuid;
  v_novos    integer := 0;
  v_atual    integer := 0;
  v_baixas   integer := 0;
  v_estornos integer := 0;
  v_item     record;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not conta_ativa() then
    raise exception 'Conta inativa.';
  end if;
  select nome into v_loja from lojas_canal where id = p_loja_id and user_id = v_user;
  if v_loja is null then
    raise exception 'Loja não encontrada.';
  end if;
  if jsonb_typeof(p_pedidos) <> 'array' or jsonb_array_length(p_pedidos) > 2000 then
    raise exception 'Envie no máximo 2.000 pedidos por vez.';
  end if;

  select id into v_armazem from armazens
   where user_id = v_user and p_loja_id = any(coalesce(loja_ids, '{}'))
   order by criado_em limit 1;
  perform set_config('app.armazem_mov', coalesce(v_armazem::text, ''), true);

  for v_p in select * from jsonb_array_elements(p_pedidos)
  loop
    v_status := v_p->>'status';
    if v_status not in ('nao_pago', 'a_enviar', 'enviado', 'concluido', 'cancelado', 'devolvido') or coalesce(v_p->>'numero', '') = '' then
      continue;
    end if;
    -- 0052: pago e esperando envio só RESERVA; a baixa vem quando a plataforma processa
    -- (etiqueta gerada: PROCESSED) ou envia. Planilha "A Enviar" não diz se processou.
    v_baixa := v_status in ('enviado', 'concluido')
      or (v_status = 'a_enviar' and coalesce(v_p->>'status_original', '') ~* '(processed|retry_ship|processado)');
    v_reserva := v_status = 'a_enviar' and not v_baixa;
    v_pago := v_baixa or v_reserva;
    v_repasse := greatest(0, coalesce((v_p->>'repasse')::numeric, 0));

    select id, estoque_baixado, estoque_reservado, conta_receber_id into v_antigo
      from pedidos_marketplace
     where user_id = v_user and loja_id = p_loja_id and numero = v_p->>'numero'
     for update;

    if v_antigo.id is null then
      insert into pedidos_marketplace (user_id, loja_id, numero, status)
      values (v_user, p_loja_id, left(v_p->>'numero', 80), v_status)
      returning id into v_id;
      v_baixado := false;
      v_reservado := false;
      v_conta := null;
      v_novos := v_novos + 1;
    else
      v_id := v_antigo.id;
      v_baixado := v_antigo.estoque_baixado;
      v_reservado := coalesce(v_antigo.estoque_reservado, false);
      v_conta := v_antigo.conta_receber_id;
      v_atual := v_atual + 1;
    end if;

    -- Estorno: já tinha saído do estoque e agora foi cancelado/devolvido.
    if v_baixado and not v_pago then
      for v_item in select produto_id, quantidade from pedidos_marketplace_itens where pedido_id = v_id and produto_id is not null
      loop
        perform registrar_movimentacao_estoque(v_item.produto_id, 'entrada', v_item.quantidade, left(format('Estorno %s %s pedido %s', 'Shopee', v_loja, v_p->>'numero'), 300));
      end loop;
      v_baixado := false;
      v_estornos := v_estornos + 1;
    end if;

    -- Reserva que não vale mais (cancelou, ou vai baixar agora) sai.
    if v_reservado and not v_reserva then
      delete from estoque_reservas where pedido_marketplace_id = v_id;
      v_reservado := false;
    end if;

    delete from pedidos_marketplace_itens where pedido_id = v_id;
    for v_i in select * from jsonb_array_elements(coalesce(v_p->'itens', '[]'::jsonb))
    loop
      v_prod := nullif(v_i->>'produto_id', '')::uuid;
      if v_prod is not null and not exists (select 1 from produtos where id = v_prod and user_id = v_user) then
        v_prod := null;
      end if;
      insert into pedidos_marketplace_itens (user_id, pedido_id, produto_id, sku, sku_principal, nome, variacao, quantidade, preco_unitario, custo_unitario)
      values (
        v_user, v_id, v_prod,
        left(v_i->>'sku', 120), left(v_i->>'sku_principal', 120),
        left(coalesce(nullif(v_i->>'nome', ''), 'Produto'), 300), left(v_i->>'variacao', 200),
        greatest(1, coalesce((v_i->>'quantidade')::integer, 1)),
        coalesce((v_i->>'preco_unitario')::numeric, 0),
        nullif(v_i->>'custo_unitario', '')::numeric
      );
    end loop;

    -- Reserva: pago esperando envio, ainda não baixado.
    if v_reserva and not v_baixado and not v_reservado then
      insert into estoque_reservas (user_id, produto_id, quantidade, origem, pedido_marketplace_id)
      select v_user, produto_id, sum(quantidade)::integer, 'marketplace', v_id
        from pedidos_marketplace_itens where pedido_id = v_id and produto_id is not null
       group by produto_id;
      v_reservado := true;
    end if;

    -- Baixa: uma vez por pedido. Sem saldo suficiente, o estoque para em zero.
    if v_baixa and not v_baixado then
      for v_item in select produto_id, sum(quantidade)::integer as quantidade from pedidos_marketplace_itens
                     where pedido_id = v_id and produto_id is not null group by produto_id
      loop
        perform registrar_movimentacao_estoque(v_item.produto_id, 'saida', v_item.quantidade, left(format('Venda %s %s pedido %s', 'Shopee', v_loja, v_p->>'numero'), 300));
      end loop;
      v_baixado := true;
      v_baixas := v_baixas + 1;
    end if;

    -- Repasse previsto no Financeiro.
    if v_pago and v_repasse > 0 then
      v_venc := (coalesce(nullif(v_p->>'pago_em', '')::timestamptz, nullif(v_p->>'criado_em', '')::timestamptz, now()) at time zone 'America/Sao_Paulo')::date + 15;
      if v_conta is not null and exists (select 1 from contas_a_pagar_receber where id = v_conta and user_id = v_user) then
        update contas_a_pagar_receber set valor = v_repasse
         where id = v_conta and status = 'pendente';
      else
        insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento, status)
        values (v_user, 'receber', left(format('Repasse Shopee %s — pedido %s', v_loja, v_p->>'numero'), 300), v_repasse, v_venc, 'pendente')
        returning id into v_conta;
      end if;
    elsif not v_pago and v_conta is not null then
      delete from contas_a_pagar_receber where id = v_conta and user_id = v_user and status = 'pendente';
      if not found then
        -- Já recebida: fica como está (o dono resolve a devolução no Financeiro).
        null;
      else
        v_conta := null;
      end if;
    end if;

    update pedidos_marketplace set
      status               = v_status,
      status_original      = left(v_p->>'status_original', 80),
      criado_em_plataforma = nullif(v_p->>'criado_em', '')::timestamptz,
      pago_em              = nullif(v_p->>'pago_em', '')::timestamptz,
      comprador            = left(v_p->>'comprador', 120),
      cidade               = left(v_p->>'cidade', 120),
      uf                   = left(upper(v_p->>'uf'), 2),
      rastreio             = left(v_p->>'rastreio', 80),
      subtotal             = coalesce((v_p->>'subtotal')::numeric, 0),
      desconto_vendedor    = coalesce((v_p->>'desconto_vendedor')::numeric, 0),
      cupom_vendedor       = coalesce((v_p->>'cupom_vendedor')::numeric, 0),
      comissao             = coalesce((v_p->>'comissao')::numeric, 0),
      taxa_servico         = coalesce((v_p->>'taxa_servico')::numeric, 0),
      taxa_transacao       = coalesce((v_p->>'taxa_transacao')::numeric, 0),
      frete_comprador      = coalesce((v_p->>'frete_comprador')::numeric, 0),
      repasse              = v_repasse,
      custo                = coalesce((v_p->>'custo')::numeric, 0),
      imposto              = coalesce((v_p->>'imposto')::numeric, 0),
      lucro                = coalesce((v_p->>'lucro')::numeric, 0),
      custo_incompleto     = coalesce((v_p->>'custo_incompleto')::boolean, false),
      estoque_baixado      = v_baixado,
      estoque_reservado    = v_reservado,
      conta_receber_id     = v_conta,
      atualizado_em        = now()
    where id = v_id;
  end loop;

  return jsonb_build_object('novos', v_novos, 'atualizados', v_atual, 'baixas', v_baixas, 'estornos', v_estornos, 'armazem_id', v_armazem);
end;
$$;

create or replace function revincular_itens_marketplace(p_loja_id uuid, p_sku text, p_produto_id uuid, p_imposto_pct numeric default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_custo   numeric;
  v_loja    text;
  v_armazem uuid;
  v_ped     record;
  v_itens   integer := 0;
  v_pedidos integer := 0;
  v_baixas  integer := 0;
  v_qtd     integer;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  select nome into v_loja from lojas_canal where id = p_loja_id and user_id = v_user;
  if v_loja is null then
    raise exception 'Loja não encontrada.';
  end if;
  select custo into v_custo from produtos where id = p_produto_id and user_id = v_user;
  if not found then
    raise exception 'Produto não encontrado.';
  end if;
  if coalesce(trim(p_sku), '') = '' then
    raise exception 'Informe o SKU do anúncio.';
  end if;

  -- Guarda o vínculo para as próximas importações.
  update marketplace_vinculos set produto_id = p_produto_id
   where user_id = v_user and loja_id = p_loja_id and lower(sku_externo) = lower(trim(p_sku));
  if not found then
    insert into marketplace_vinculos (user_id, loja_id, sku_externo, produto_id) values (v_user, p_loja_id, left(trim(p_sku), 300), p_produto_id);
  end if;

  select id into v_armazem from armazens where user_id = v_user and p_loja_id = any(coalesce(loja_ids, '{}')) order by criado_em limit 1;
  perform set_config('app.armazem_mov', coalesce(v_armazem::text, ''), true);

  -- Cada pedido da loja que tem item sem produto com esse SKU.
  for v_ped in
    select distinct p.id, p.numero, p.estoque_baixado, p.estoque_reservado, p.subtotal, p.repasse
      from pedidos_marketplace p
      join pedidos_marketplace_itens i on i.pedido_id = p.id
     where p.user_id = v_user and p.loja_id = p_loja_id and i.produto_id is null
       and lower(trim(p_sku)) in (lower(coalesce(i.sku, '')), lower(coalesce(i.sku_principal, '')))
  loop
    select coalesce(sum(quantidade), 0)::integer into v_qtd
      from pedidos_marketplace_itens i
     where i.pedido_id = v_ped.id and i.produto_id is null
       and lower(trim(p_sku)) in (lower(coalesce(i.sku, '')), lower(coalesce(i.sku_principal, '')));

    update pedidos_marketplace_itens i
       set produto_id = p_produto_id, custo_unitario = v_custo
     where i.pedido_id = v_ped.id and i.produto_id is null
       and lower(trim(p_sku)) in (lower(coalesce(i.sku, '')), lower(coalesce(i.sku_principal, '')));
    get diagnostics v_itens = row_count;

    -- 0052: pedido só reservado → reserva também o item que ganhou produto.
    if not v_ped.estoque_baixado and coalesce(v_ped.estoque_reservado, false) and v_qtd > 0 then
      insert into estoque_reservas (user_id, produto_id, quantidade, origem, pedido_marketplace_id)
      values (v_user, p_produto_id, v_qtd, 'marketplace', v_ped.id)
      on conflict (pedido_marketplace_id, produto_id) where pedido_marketplace_id is not null
      do update set quantidade = estoque_reservas.quantidade + excluded.quantidade;
    end if;
    -- O pedido já tinha baixado os outros itens: baixa também os que ganharam produto.
    if v_ped.estoque_baixado and v_qtd > 0 then
      perform registrar_movimentacao_estoque(p_produto_id, 'saida', v_qtd, left(format('Venda Shopee %s pedido %s (vínculo)', v_loja, v_ped.numero), 300));
      v_baixas := v_baixas + 1;
    end if;

    -- Custo, imposto e lucro recalculados com os itens agora vinculados.
    update pedidos_marketplace p set
      custo = sub.custo,
      imposto = round(p.subtotal * greatest(0, coalesce(p_imposto_pct, 0)), 2),
      lucro = round(p.repasse - sub.custo - p.subtotal * greatest(0, coalesce(p_imposto_pct, 0)), 2),
      custo_incompleto = sub.faltando > 0,
      atualizado_em = now()
      from (
        select coalesce(sum(case when produto_id is not null then coalesce(custo_unitario, 0) * quantidade else 0 end), 0) as custo,
               count(*) filter (where produto_id is null) as faltando
          from pedidos_marketplace_itens where pedido_id = v_ped.id
      ) sub
     where p.id = v_ped.id and p.status not in ('cancelado', 'devolvido');

    v_pedidos := v_pedidos + 1;
  end loop;

  return jsonb_build_object('pedidos', v_pedidos, 'baixas', v_baixas);
end;
$$;


-- Avança (ou volta) a etapa de vendas da esteira. A passagem para Imprimir (ou adiante)
-- transforma a reserva em baixa definitiva; sair de Para Reservar tenta reservar.
create or replace function avancar_etapa_vendas(p_ids uuid[], p_etapa text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_venda record;
  v_falta text;
  v_n     integer := 0;
  v_baixa boolean := p_etapa in ('imprimir', 'retirada', 'enviado', 'concluido');
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if p_etapa not in ('reservar', 'emitir', 'enviar', 'imprimir', 'retirada', 'enviado', 'concluido') then
    raise exception 'Etapa inválida: %', p_etapa;
  end if;

  for v_venda in
    select id, numero, etapa, estoque_baixado from vendas
     where user_id = v_user and id = any(p_ids) and status <> 'cancelada'
     order by id
     for update
  loop
    if not v_venda.estoque_baixado then
      -- Saindo de Para Reservar: precisa conseguir reservar tudo.
      if v_venda.etapa = 'reservar' and p_etapa <> 'reservar'
         and not exists (select 1 from estoque_reservas where venda_id = v_venda.id) then
        select p.nome into v_falta
          from venda_itens vi join produtos p on p.id = vi.produto_id
         where vi.venda_id = v_venda.id
         group by p.id, p.nome, p.estoque
        having p.estoque - coalesce((select sum(r.quantidade) from estoque_reservas r where r.produto_id = p.id), 0) < sum(vi.quantidade)
         limit 1;
        if v_falta is not null then
          raise exception 'Sem estoque disponível de "%" para o pedido %.', v_falta, v_venda.numero;
        end if;
        insert into estoque_reservas (user_id, produto_id, quantidade, origem, venda_id)
        select v_user, produto_id, sum(quantidade), 'venda', v_venda.id
          from venda_itens where venda_id = v_venda.id and produto_id is not null group by produto_id;
      end if;

      -- Para Imprimir em diante: a reserva vira baixa.
      if v_baixa then
        delete from estoque_reservas where venda_id = v_venda.id;
        update produtos p set estoque = p.estoque - agg.qtd
          from (select produto_id, sum(quantidade) as qtd from venda_itens where venda_id = v_venda.id and produto_id is not null group by 1) agg
         where p.id = agg.produto_id and p.user_id = v_user;
        insert into estoque_movimentacoes (user_id, produto_id, produto_nome, tipo, quantidade, motivo, data_movimentacao)
        select v_user, vi.produto_id, vi.produto_nome, 'saida', vi.quantidade, 'Venda ' || v_venda.numero || ' (expedição)', now()
          from venda_itens vi where vi.venda_id = v_venda.id and vi.produto_id is not null;
        update vendas set estoque_baixado = true where id = v_venda.id;
      end if;
    end if;

    update vendas set etapa = p_etapa where id = v_venda.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

grant execute on function avancar_etapa_vendas(uuid[], text) to authenticated;

NOTIFY pgrst, 'reload schema';

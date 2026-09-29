-- ============================================================
-- Precificação — Fase 1: custo composto no produto, custo médio ponderado na
-- entrada de estoque, imposto abatido na venda, e preço mais recente por canal.
--
-- Idempotente: pode ser colada e rodada mais de uma vez sem erro (o SQL Editor do
-- Supabase não envolve o script numa transação — ver CLAUDE.md).
-- ============================================================

-- ============================================================
-- 1) Custo composto: `produtos.custo` vira uma coluna DERIVADA.
--
-- `custo_base` (valor do produto) + `insumos` (jsonb, mesma forma de `ComponenteKit`
-- em lib/pricing.ts: [{id, nome, quantidade, custoUnitario}, ...]) somados por um
-- trigger. O imposto NÃO entra aqui — ele já é descontado do preço de venda na
-- precificação (`perfil_negocio.aliquota_das`), e entrar também no custo cobraria o
-- imposto duas vezes.
--
-- Escrever direto em `produtos.custo` deixa de ter efeito: o trigger sempre
-- recalcula. É isso que garante que produto, PDV, precificação e vendas nunca
-- divirjam sobre quanto custa um produto.
-- ============================================================

alter table produtos
  add column if not exists custo_base numeric not null default 0,
  add column if not exists insumos jsonb not null default '[]'::jsonb;

-- Backfill: só na primeira vez (produtos já com custo_base setado não são tocados de
-- novo, o que torna este UPDATE idempotente).
update produtos set custo_base = custo where custo_base = 0 and custo > 0;

create or replace function custo_de_insumos(p_insumos jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select coalesce(sum((i->>'quantidade')::numeric * (i->>'custoUnitario')::numeric), 0)
  from jsonb_array_elements(coalesce(p_insumos, '[]'::jsonb)) i;
$$;

create or replace function recalcular_custo_produto()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.custo := round(coalesce(new.custo_base, 0) + custo_de_insumos(new.insumos), 2);
  return new;
end;
$$;

drop trigger if exists trg_recalcular_custo_produto on produtos;
create trigger trg_recalcular_custo_produto
before insert or update on produtos
for each row execute function recalcular_custo_produto();

-- ============================================================
-- 2) Custo médio ponderado na entrada de estoque, com histórico.
--
-- Fórmula: custo_novo = (estoque_anterior * custo_anterior + qtd_entrada * custo_entrada)
--                        / (estoque_anterior + qtd_entrada)
-- Caso de borda: estoque_anterior <= 0 → custo_novo = custo_entrada (sem divisão).
--
-- A média é sobre `custo_base`, não sobre `custo` (que é derivado pelo trigger acima).
-- ============================================================

create table if not exists produto_custo_historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  origem text not null check (origem in ('entrada_manual', 'pedido_compra', 'edicao_manual')),
  estoque_anterior integer not null,
  custo_anterior numeric not null,
  quantidade_entrada integer not null,
  custo_entrada numeric not null,
  custo_novo numeric not null,
  criado_em timestamptz not null default now()
);

alter table produto_custo_historico enable row level security;

drop policy if exists "own_rows_produto_custo_historico" on produto_custo_historico;
create policy "own_rows_produto_custo_historico" on produto_custo_historico for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

create index if not exists produto_custo_historico_produto_id_idx on produto_custo_historico (produto_id);
create index if not exists produto_custo_historico_user_id_idx on produto_custo_historico (user_id);

-- Mesmo trigger genérico que já protege as outras tabelas filhas (ver 0026): garante
-- que `produto_id` aponta pra um produto que existe e pertence à conta que está
-- escrevendo, sem dar SELECT direto na tabela pai pra quem só devia enxergar o filho.
drop trigger if exists trg_valida_vinculo_produto_custo_historico on produto_custo_historico;
create trigger trg_valida_vinculo_produto_custo_historico
before insert or update of produto_id on produto_custo_historico
for each row execute function validar_vinculo_do_dono('produto_id', 'produtos');

alter table estoque_movimentacoes add column if not exists custo_unitario numeric;

create or replace function registrar_entrada_com_custo(
  p_produto_id uuid,
  p_quantidade integer,
  p_custo_unitario numeric,
  p_motivo text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_produto produtos%rowtype;
  v_custo_novo numeric;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo para registrar a entrada.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade precisa ser maior que zero.';
  end if;
  if p_custo_unitario is null or p_custo_unitario < 0 then
    raise exception 'O custo unitário não pode ser negativo.';
  end if;

  select * into v_produto from produtos where id = p_produto_id and user_id = v_user for update;
  if not found then
    raise exception 'Produto não encontrado ou não pertence a você.';
  end if;

  if v_produto.estoque <= 0 then
    v_custo_novo := p_custo_unitario;
  else
    v_custo_novo := round(
      (v_produto.estoque * v_produto.custo_base + p_quantidade * p_custo_unitario)
      / (v_produto.estoque + p_quantidade),
      2
    );
  end if;

  insert into produto_custo_historico (
    user_id, produto_id, origem, estoque_anterior, custo_anterior,
    quantidade_entrada, custo_entrada, custo_novo
  ) values (
    v_user, p_produto_id, 'entrada_manual', v_produto.estoque, v_produto.custo_base,
    p_quantidade, p_custo_unitario, v_custo_novo
  );

  update produtos
  set estoque = estoque + p_quantidade,
      custo_base = v_custo_novo
  where id = p_produto_id and user_id = v_user;

  insert into estoque_movimentacoes (
    user_id, produto_id, produto_nome, tipo, quantidade, motivo, custo_unitario, data_movimentacao
  ) values (
    v_user, p_produto_id, v_produto.nome || coalesce(' — ' || v_produto.variante_nome, ''),
    'entrada', p_quantidade, coalesce(p_motivo, 'Entrada de estoque'), p_custo_unitario, now()
  );
end;
$$;

grant execute on function registrar_entrada_com_custo(uuid, integer, numeric, text) to authenticated;

-- `marcar_pedido_recebido` já capturava `pedidos_compra_itens.custo_unitario` e
-- descartava o valor — só somava estoque. Agora aplica a mesma média ponderada, item
-- a item. Retorno (`void`) não muda, então `create or replace` é seguro aqui (a
-- armadilha do 0017 é só quando `returns table` muda de colunas).
create or replace function marcar_pedido_recebido(p_pedido_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  item record;
  v_produto produtos%rowtype;
  v_custo_novo numeric;
begin
  update pedidos_compra
  set status = 'recebido', data_recebimento = current_date
  where id = p_pedido_id and user_id = auth.uid() and status = 'pendente';

  if not found then
    raise exception 'Pedido não encontrado, já recebido ou não pertence ao usuário atual';
  end if;

  for item in
    select * from pedidos_compra_itens where pedido_compra_id = p_pedido_id
  loop
    if item.produto_id is not null then
      select * into v_produto from produtos where id = item.produto_id and user_id = auth.uid() for update;

      if found then
        if v_produto.estoque <= 0 then
          v_custo_novo := item.custo_unitario;
        else
          v_custo_novo := round(
            (v_produto.estoque * v_produto.custo_base + item.quantidade * item.custo_unitario)
            / (v_produto.estoque + item.quantidade),
            2
          );
        end if;

        insert into produto_custo_historico (
          user_id, produto_id, origem, estoque_anterior, custo_anterior,
          quantidade_entrada, custo_entrada, custo_novo
        ) values (
          auth.uid(), item.produto_id, 'pedido_compra', v_produto.estoque, v_produto.custo_base,
          item.quantidade, item.custo_unitario, v_custo_novo
        );

        update produtos
        set estoque = estoque + item.quantidade,
            custo_base = v_custo_novo
        where id = item.produto_id and user_id = auth.uid();
      end if;
    end if;

    insert into estoque_movimentacoes (user_id, produto_id, produto_nome, tipo, quantidade, motivo, custo_unitario, data_movimentacao)
    values (auth.uid(), item.produto_id, item.produto_nome, 'entrada', item.quantidade, 'Pedido de compra recebido', item.custo_unitario, now());
  end loop;
end;
$$;

-- ============================================================
-- 3) Imposto abatido no lucro da venda.
--
-- `registrar_venda` calculava lucro = subtotal - desconto - custo, sem imposto
-- nenhum. Passa a descontar `perfil_negocio.aliquota_das` também, como já acontece
-- na Precificação. Vendas já gravadas ficam com imposto_pct = 0 — é de fato o que
-- foi calculado na época, por pedido explícito: só vendas novas.
--
-- Colunas de retorno da função não mudam (venda_id, venda_numero, venda_total,
-- venda_lucro) — `create or replace` é seguro.
-- ============================================================

alter table vendas
  add column if not exists imposto_pct numeric not null default 0,
  add column if not exists imposto_valor numeric not null default 0;

create or replace function registrar_venda(
  p_itens jsonb,
  p_status text default 'paga',
  p_cliente_id uuid default null,
  p_conta_id uuid default null,
  p_forma_pagamento text default null,
  p_desconto numeric default 0,
  p_valor_entrega numeric default 0,
  p_observacao text default null,
  p_data_vencimento date default null
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
  v_lucro := round(v_subtotal - v_desconto - v_custo_total - v_imposto, 2);

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
  elsif p_conta_id is null then
    raise exception 'Escolha a conta que vai receber o valor da venda.';
  end if;

  -- 5. A venda (o número vem do trigger).
  insert into vendas (
    user_id, cliente_id, cliente_nome, status, subtotal, desconto, valor_entrega,
    total, custo_total, lucro, forma_pagamento, conta_id, observacao,
    imposto_pct, imposto_valor
  ) values (
    v_user, p_cliente_id, v_cliente_nome, p_status, v_subtotal, v_desconto, v_entrega,
    v_total, v_custo_total, v_lucro, p_forma_pagamento, p_conta_id, p_observacao,
    coalesce(v_aliquota, 0) / 100, v_imposto
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

  -- 8. Dinheiro: entra no caixa agora, ou vira conta a receber.
  if p_status = 'paga' then
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id
    ) values (
      v_user, 'entrada', v_total,
      'Venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
      'PDV', 'Vendas', p_conta_id, true, current_date, v_venda.id
    );

    -- ajustar_saldo_conta foi dropada na 0007; o update vai inline.
    update contas set saldo = saldo + v_total
    where id = p_conta_id and user_id = v_user;

    if not found then
      raise exception 'Conta não encontrada ou não pertence ao usuário atual';
    end if;
  else
    -- contas_a_pagar_receber.forma_pagamento foi dropada na 0007: a forma de
    -- pagamento do fiado fica só em vendas.forma_pagamento.
    insert into contas_a_pagar_receber (
      user_id, tipo, descricao, valor, data_vencimento, status, conta_id,
      cliente_id, referencia_venda_id
    ) values (
      v_user, 'receber',
      'Fiado — venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
      v_total, coalesce(p_data_vencimento, current_date + 30), 'pendente', p_conta_id,
      p_cliente_id, v_venda.id
    );
  end if;

  return query select v_venda.id, v_venda.numero, v_total, v_lucro;
end;
$$;

-- ============================================================
-- 4) Preço mais recente por produto e por canal.
--
-- `precificacoes` já guarda produto_id, loja_id, canal, preco_calculado e lucro —
-- não precisa de tabela nova. `distinct on` pega só a mais recente de cada par
-- (produto, loja); margem e markup são recalculados do lucro salvo (mesma fórmula
-- de `pctPorModo` em lib/pricing.ts), não copiados de `margem_pct` — que só existe
-- quando a precificação foi feita no modo "margem".
-- ============================================================

create or replace function precos_canal_por_produto()
returns table (
  produto_id uuid,
  loja_id uuid,
  canal_nome text,
  preco numeric,
  margem_pct numeric,
  markup_pct numeric,
  criado_em timestamptz
)
language sql
security invoker
stable
set search_path = public
as $$
  select distinct on (p.produto_id, p.loja_id)
    p.produto_id,
    p.loja_id,
    p.canal,
    p.preco_calculado,
    case when p.preco_calculado > 0 then p.lucro / p.preco_calculado else 0 end,
    case when p.custo > 0 then p.lucro / p.custo else 0 end,
    p.criado_em
  from precificacoes p
  where p.user_id = auth.uid()
    and p.produto_id is not null
  order by p.produto_id, p.loja_id, p.criado_em desc;
$$;

grant execute on function precos_canal_por_produto() to authenticated;

NOTIFY pgrst, 'reload schema';

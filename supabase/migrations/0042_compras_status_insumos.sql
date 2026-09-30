-- ============================================================
-- 0042 — Compras com recebimento parcial, cancelamento e categorias de insumo (Fase 8.4).
--
-- Status do pedido de compra. Os valores antigos NÃO mudam de nome — Dashboard, Financeiro e
-- a erosão de margem já filtram por eles —, só ganham irmãos:
--   pendente    → "Para comprar"
--   em_transito → "Em trânsito"   (novo)
--   parcial     → "Parcial"       (novo: parte dos itens chegou)
--   recebido    → "Completado"
--   cancelado   → "Cancelado"     (novo)
--
-- Recebimento parcial: cada item guarda `quantidade_recebida`. `receber_pedido_compra`
-- recebe o que chegou (item a item), aplica o custo médio, põe no armazém escolhido (0041)
-- e decide sozinho se o pedido fica 'parcial' ou 'recebido'.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Categoria com tipo: produto, insumo ou embalagem (a composição de custo prioriza os dois últimos).
alter table categorias add column if not exists tipo text not null default 'produto';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categorias_tipo_check') then
    alter table categorias add constraint categorias_tipo_check check (tipo in ('produto', 'insumo', 'embalagem'));
  end if;
end $$;

-- 2) Status novos, frete, observação e data de cancelamento.
alter table pedidos_compra drop constraint if exists pedidos_compra_status_check;
alter table pedidos_compra add constraint pedidos_compra_status_check
  check (status in ('pendente', 'em_transito', 'parcial', 'recebido', 'cancelado'));

alter table pedidos_compra
  add column if not exists frete numeric not null default 0 check (frete >= 0),
  add column if not exists observacao text check (observacao is null or length(observacao) <= 500),
  add column if not exists cancelado_em timestamptz;

-- 3) Quanto de cada item já chegou. Pedido antigo já recebido conta como tudo recebido.
alter table pedidos_compra_itens add column if not exists quantidade_recebida integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_compra_itens_recebida_check') then
    alter table pedidos_compra_itens add constraint pedidos_compra_itens_recebida_check check (quantidade_recebida >= 0);
  end if;
end $$;

update pedidos_compra_itens i
   set quantidade_recebida = i.quantidade
  from pedidos_compra p
 where p.id = i.pedido_compra_id and p.status = 'recebido' and i.quantidade_recebida = 0;

-- 4) Recebe o que chegou. `p_itens` = [{ "item_id": uuid, "quantidade": int }]; vazio ou nulo =
--    tudo o que falta. Devolve o status resultante.
create or replace function receber_pedido_compra(
  p_pedido_id uuid,
  p_itens jsonb default null,
  p_armazem_id uuid default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_pedido pedidos_compra%rowtype;
  v_armazem uuid;
  item record;
  v_qtd integer;
  v_produto produtos%rowtype;
  v_custo_novo numeric;
  v_recebeu boolean := false;
  v_falta integer;
  v_status text;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;

  select * into v_pedido from pedidos_compra where id = p_pedido_id and user_id = v_user for update;
  if not found then
    raise exception 'Pedido de compra não encontrado.';
  end if;
  if v_pedido.status not in ('pendente', 'em_transito', 'parcial') then
    raise exception 'Este pedido já foi % e não pode receber mais itens.', case v_pedido.status when 'recebido' then 'completado' else 'cancelado' end;
  end if;

  v_armazem := coalesce(p_armazem_id, v_pedido.armazem_id);
  if v_armazem is not null and not exists (select 1 from armazens where id = v_armazem and user_id = v_user) then
    raise exception 'Armazém não encontrado.';
  end if;
  -- Estoque por armazém (0041): o gatilho de produtos lê este valor. Sem a 0041, é ignorado.
  if v_armazem is not null then
    perform set_config('app.armazem_mov', v_armazem::text, true);
  end if;

  for item in
    select * from pedidos_compra_itens where pedido_compra_id = p_pedido_id order by id for update
  loop
    if p_itens is null or jsonb_array_length(p_itens) = 0 then
      v_qtd := item.quantidade - item.quantidade_recebida;
    else
      select coalesce(max((e->>'quantidade')::integer), 0) into v_qtd
        from jsonb_array_elements(p_itens) e
       where (e->>'item_id')::uuid = item.id;
    end if;

    if v_qtd is null or v_qtd <= 0 then
      continue;
    end if;
    if v_qtd > item.quantidade - item.quantidade_recebida then
      raise exception 'O item "%" só tem % unidade(s) a receber.', item.produto_nome, item.quantidade - item.quantidade_recebida;
    end if;

    if item.produto_id is not null then
      select * into v_produto from produtos where id = item.produto_id and user_id = v_user for update;
      if found then
        v_custo_novo := case
          when v_produto.estoque <= 0 then item.custo_unitario
          else round((v_produto.estoque * v_produto.custo_base + v_qtd * item.custo_unitario) / (v_produto.estoque + v_qtd), 2)
        end;

        insert into produto_custo_historico (
          user_id, produto_id, origem, estoque_anterior, custo_anterior, quantidade_entrada, custo_entrada, custo_novo
        ) values (
          v_user, item.produto_id, 'pedido_compra', v_produto.estoque, v_produto.custo_base, v_qtd, item.custo_unitario, v_custo_novo
        );

        update produtos set estoque = estoque + v_qtd, custo_base = v_custo_novo
         where id = item.produto_id and user_id = v_user;
      end if;
    end if;

    insert into estoque_movimentacoes (user_id, produto_id, produto_nome, tipo, quantidade, motivo, custo_unitario, data_movimentacao)
    values (v_user, item.produto_id, item.produto_nome, 'entrada', v_qtd, 'Pedido de compra ' || v_pedido.numero, item.custo_unitario, now());

    update pedidos_compra_itens set quantidade_recebida = quantidade_recebida + v_qtd where id = item.id;
    v_recebeu := true;
  end loop;

  if not v_recebeu then
    raise exception 'Informe a quantidade que chegou de pelo menos um item.';
  end if;

  select coalesce(sum(greatest(quantidade - quantidade_recebida, 0)), 0) into v_falta
    from pedidos_compra_itens where pedido_compra_id = p_pedido_id;
  v_status := case when v_falta = 0 then 'recebido' else 'parcial' end;

  update pedidos_compra
     set status = v_status,
         data_recebimento = case when v_falta = 0 then current_date else data_recebimento end,
         armazem_id = coalesce(armazem_id, v_armazem)
   where id = p_pedido_id;

  perform set_config('app.armazem_mov', '', true);
  return v_status;
end;
$$;

grant execute on function receber_pedido_compra(uuid, jsonb, uuid) to authenticated;

-- 5) A função antiga continua existindo (mesma assinatura): recebe tudo o que falta.
create or replace function marcar_pedido_recebido(p_pedido_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform receber_pedido_compra(p_pedido_id, null, null);
end;
$$;

-- 6) Cancelar: só o que ainda não foi completado. As parcelas a pagar ainda em aberto do
--    pedido somem; as já pagas ficam (dinheiro que saiu não desaparece do caixa).
create or replace function cancelar_pedido_compra(p_pedido_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_removidas integer;
begin
  select status into v_status from pedidos_compra where id = p_pedido_id and user_id = v_user for update;
  if v_status is null then
    raise exception 'Pedido de compra não encontrado.';
  end if;
  if v_status in ('recebido', 'cancelado') then
    raise exception 'Este pedido já foi % e não pode ser cancelado.', case v_status when 'recebido' then 'completado' else 'cancelado' end;
  end if;

  update pedidos_compra set status = 'cancelado', cancelado_em = now() where id = p_pedido_id;

  delete from contas_a_pagar_receber
   where referencia_pedido_compra_id = p_pedido_id and user_id = v_user and status = 'pendente';
  get diagnostics v_removidas = row_count;
  return v_removidas;
end;
$$;

grant execute on function cancelar_pedido_compra(uuid) to authenticated;

-- 7) Erosão de margem: compra parcial também já trouxe custo novo para o estoque.
create or replace function custos_recentes_por_produto()
returns table (produto_id uuid, produto_nome text, custo_compra numeric, custo_precificacao numeric)
language sql
security invoker
stable
set search_path = public
as $$
  with compras as (
    select distinct on (i.produto_id) i.produto_id, i.produto_nome, i.custo_unitario
      from pedidos_compra_itens i
      join pedidos_compra p on p.id = i.pedido_compra_id
     where p.user_id = auth.uid()
       and p.status in ('recebido', 'parcial')
       and i.quantidade_recebida > 0
       and i.produto_id is not null
     order by i.produto_id, coalesce(p.data_recebimento, p.data_pedido) desc
  ),
  precos as (
    select distinct on (pr.produto_id) pr.produto_id, pr.custo
      from precificacoes pr
     where pr.user_id = auth.uid() and pr.produto_id is not null
     order by pr.produto_id, pr.criado_em desc
  )
  select c.produto_id, c.produto_nome, c.custo_unitario, p.custo
    from compras c
    join precos p on p.produto_id = c.produto_id;
$$;

-- 8) Número do pedido começava em "MV-00". Passa a começar em 1, com 4 dígitos (MV-0001),
--    no mesmo formato das vendas. Pedidos antigos mantêm o número; a sequência continua do
--    maior que já existe.
create or replace function gerar_numero_pedido()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_proximo integer;
begin
  if new.numero is not null and new.numero <> '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text), hashtext('pedidos_compra'));

  select coalesce(max(substring(numero from '\d+')::integer), 0) + 1
    into v_proximo
    from pedidos_compra
   where user_id = new.user_id and numero ~ '^MV-\d+$';

  new.numero := 'MV-' || lpad(v_proximo::text, 4, '0');
  return new;
end;
$$;

NOTIFY pgrst, 'reload schema';

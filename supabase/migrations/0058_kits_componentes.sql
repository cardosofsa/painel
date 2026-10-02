-- ============================================================
-- 0058 — Kit com estoque dos componentes (Fase 11.1).
--
-- Um produto marcado como KIT (`e_kit`) não tem estoque próprio: os componentes são os
-- itens da composição que vêm de produtos do estoque (`insumos[].produtoId`, quantidade por
-- kit). Embalagem digitada à mão (sem produtoId) só entra no custo.
--
--   * estoque do kit = quantos kits dá para montar com o DISPONÍVEL dos componentes
--     (físico − reservado), recalculado sozinho quando um componente muda;
--   * vender / baixar / estornar o kit (qualquer caminho: PDV, esteira, marketplace,
--     cancelamento) passa a diferença para os componentes, com movimentação registrada;
--   * reservar o kit reserva os componentes (o kit nunca guarda reserva própria);
--   * kit não ocupa saldo em armazém (o saldo é dos componentes).
--
-- Feito com gatilhos para não reescrever as RPCs de venda/importação: toda mudança de
-- estoque passa por `produtos.estoque` e toda reserva por `estoque_reservas`.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table produtos add column if not exists e_kit boolean not null default false;

-- Componentes de um kit (só produtos do mesmo dono, nunca outro kit nem ele mesmo).
create or replace function componentes_do_kit(p_kit uuid)
returns table (produto_id uuid, quantidade integer)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, greatest(1, ceil(sum((i->>'quantidade')::numeric))::integer)
    from produtos k
    cross join lateral jsonb_array_elements(coalesce(k.insumos, '[]'::jsonb)) i
    join produtos c on c.id = nullif(i->>'produtoId', '')::uuid and c.user_id = k.user_id and c.id <> k.id and not c.e_kit
   where k.id = p_kit and coalesce((i->>'quantidade')::numeric, 0) > 0
   group by c.id;
$$;

revoke execute on function componentes_do_kit(uuid) from public, anon;
grant execute on function componentes_do_kit(uuid) to authenticated;

-- Quantos kits dá para montar com o disponível de cada componente.
create or replace function estoque_calculado_kit(p_kit uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(min(floor(greatest(0, p.estoque - coalesce((select sum(r.quantidade) from estoque_reservas r where r.produto_id = p.id), 0)) / c.quantidade)), 0)::integer
    from componentes_do_kit(p_kit) c
    join produtos p on p.id = c.produto_id;
$$;

-- Regrava o estoque dos kits (os que usam o componente, ou um kit específico).
drop function if exists recalcular_kits(uuid, uuid);
create or replace function recalcular_kits(p_componente uuid, p_kit uuid default null, p_exceto uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit uuid;
begin
  for v_kit in
    select k.id from produtos k
     where k.e_kit
       and k.id is distinct from p_exceto
       and (k.id = p_kit or (p_componente is not null and exists (
             select 1 from jsonb_array_elements(coalesce(k.insumos, '[]'::jsonb)) i where nullif(i->>'produtoId', '')::uuid = p_componente)))
  loop
    perform set_config('app.kit_recalc', '1', true);
    update produtos set estoque = estoque_calculado_kit(v_kit) where id = v_kit and estoque is distinct from estoque_calculado_kit(v_kit);
    perform set_config('app.kit_recalc', '', true);
  end loop;
end;
$$;

-- Venda/baixa/estorno do kit → componentes. Recalcular (app.kit_recalc) não propaga.
create or replace function propagar_estoque_kit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta integer := coalesce(new.estoque, 0) - coalesce(old.estoque, 0);
  v_c     record;
begin
  if not new.e_kit or v_delta = 0 or current_setting('app.kit_recalc', true) = '1' then
    return new;
  end if;
  -- Enquanto mexe nos componentes, o recálculo automático fica parado (ele tentaria regravar
  -- ESTE kit, que está no meio do próprio update); os outros kits são recalculados no fim.
  perform set_config('app.kit_propagando', '1', true);
  for v_c in select * from componentes_do_kit(new.id) loop
    update produtos set estoque = greatest(0, estoque + v_delta * v_c.quantidade) where id = v_c.produto_id;
    insert into estoque_movimentacoes (user_id, produto_id, produto_nome, tipo, quantidade, motivo, data_movimentacao)
    select new.user_id, p.id, p.nome, case when v_delta < 0 then 'saida' else 'entrada' end, abs(v_delta) * v_c.quantidade,
           left(format('Kit %s (%s × %s)', new.nome, abs(v_delta), v_c.quantidade), 300), now()
      from produtos p where p.id = v_c.produto_id;
  end loop;
  perform set_config('app.kit_propagando', '', true);
  for v_c in select * from componentes_do_kit(new.id) loop
    perform recalcular_kits(v_c.produto_id, null, new.id);
  end loop;
  -- Depois de mexer nos componentes, o kit volta a ser o que dá para montar.
  new.estoque := estoque_calculado_kit(new.id);
  return new;
end;
$$;

drop trigger if exists produtos_propagar_kit on produtos;
create trigger produtos_propagar_kit
  before update of estoque on produtos
  for each row execute function propagar_estoque_kit();

-- Componente mudou (estoque físico) → kits recalculados.
create or replace function kits_apos_componente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not new.e_kit and new.estoque is distinct from old.estoque and coalesce(current_setting('app.kit_propagando', true), '') <> '1' then
    perform recalcular_kits(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists produtos_recalcular_kits on produtos;
create trigger produtos_recalcular_kits
  after update of estoque on produtos
  for each row execute function kits_apos_componente();

-- Virou kit / mudou a composição → recalcula esse kit.
create or replace function kit_composicao_mudou()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.e_kit and (tg_op = 'INSERT' or new.insumos is distinct from old.insumos or not old.e_kit) then
    delete from estoque_armazem where produto_id = new.id;
    perform recalcular_kits(null, new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists produtos_kit_composicao on produtos;
create trigger produtos_kit_composicao
  after insert or update of insumos, e_kit on produtos
  for each row execute function kit_composicao_mudou();

-- Reserva de kit vira reserva dos componentes.
create or replace function expandir_reserva_kit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c record;
begin
  if not exists (select 1 from produtos where id = new.produto_id and e_kit) then
    return new;
  end if;
  for v_c in select * from componentes_do_kit(new.produto_id) loop
    if new.venda_id is not null then
      insert into estoque_reservas (user_id, produto_id, quantidade, origem, venda_id)
      values (new.user_id, v_c.produto_id, new.quantidade * v_c.quantidade, new.origem, new.venda_id)
      on conflict (venda_id, produto_id) where venda_id is not null
      do update set quantidade = estoque_reservas.quantidade + excluded.quantidade;
    else
      insert into estoque_reservas (user_id, produto_id, quantidade, origem, pedido_marketplace_id)
      values (new.user_id, v_c.produto_id, new.quantidade * v_c.quantidade, new.origem, new.pedido_marketplace_id)
      on conflict (pedido_marketplace_id, produto_id) where pedido_marketplace_id is not null
      do update set quantidade = estoque_reservas.quantidade + excluded.quantidade;
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists estoque_reservas_kit on estoque_reservas;
create trigger estoque_reservas_kit
  before insert on estoque_reservas
  for each row execute function expandir_reserva_kit();

-- Reserva entrou/saiu → o disponível do componente mudou → kits recalculados.
create or replace function kits_apos_reserva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then perform recalcular_kits(new.produto_id); end if;
  if tg_op in ('DELETE', 'UPDATE') then perform recalcular_kits(old.produto_id); end if;
  return null;
end;
$$;

drop trigger if exists estoque_reservas_recalcular_kits on estoque_reservas;
create trigger estoque_reservas_recalcular_kits
  after insert or update or delete on estoque_reservas
  for each row execute function kits_apos_reserva();

-- Kit não ocupa armazém: a sincronização da 0041 ignora kits (cópia + 1 linha).
create or replace function sincronizar_estoque_armazem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes   integer := case when tg_op = 'INSERT' then 0 else coalesce(old.estoque, 0) end;
  v_delta   integer := coalesce(new.estoque, 0) - v_antes;
  v_alvo    uuid;
  v_restante integer;
  v_linha   record;
  v_tirar   integer;
  v_soma    integer;
begin
  if v_delta = 0 or new.e_kit then
    return new;
  end if;

  v_alvo := nullif(current_setting('app.armazem_mov', true), '')::uuid;
  if v_alvo is not null and not exists (select 1 from armazens where id = v_alvo and user_id = new.user_id) then
    v_alvo := null;
  end if;
  if v_alvo is null then
    v_alvo := new.armazem_id;
    if v_alvo is not null and not exists (select 1 from armazens where id = v_alvo and user_id = new.user_id) then
      v_alvo := null;
    end if;
  end if;
  if v_alvo is null then
    v_alvo := armazem_principal(new.user_id);
  end if;

  if v_delta > 0 then
    insert into estoque_armazem (user_id, produto_id, armazem_id, quantidade)
    values (new.user_id, new.id, v_alvo, v_delta)
    on conflict (produto_id, armazem_id) do update
      set quantidade = estoque_armazem.quantidade + excluded.quantidade, atualizado_em = now();
  else
    v_restante := -v_delta;
    for v_linha in
      select armazem_id, quantidade from estoque_armazem
       where produto_id = new.id and quantidade > 0
       order by (armazem_id = v_alvo) desc, quantidade desc
       for update
    loop
      exit when v_restante <= 0;
      v_tirar := least(v_linha.quantidade, v_restante);
      update estoque_armazem set quantidade = quantidade - v_tirar, atualizado_em = now()
       where produto_id = new.id and armazem_id = v_linha.armazem_id;
      v_restante := v_restante - v_tirar;
    end loop;
  end if;

  select coalesce(sum(quantidade), 0) into v_soma from estoque_armazem where produto_id = new.id;
  if v_soma <> coalesce(new.estoque, 0) then
    insert into estoque_armazem (user_id, produto_id, armazem_id, quantidade)
    values (new.user_id, new.id, v_alvo, greatest(0, coalesce(new.estoque, 0) - v_soma))
    on conflict (produto_id, armazem_id) do update
      set quantidade = greatest(0, estoque_armazem.quantidade + (coalesce(new.estoque, 0) - v_soma)), atualizado_em = now();
  end if;

  return new;
end;
$$;

NOTIFY pgrst, 'reload schema';

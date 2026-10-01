-- ============================================================
-- 0053 — Expedição em massa: observação interna, tags e ocultar pedido (Fase 10.4).
--
-- vendas e pedidos_marketplace ganham `observacao_interna` (só a equipe vê), `tags`
-- (até 8, coloridas na tela, filtráveis) e `ocultado_em` (pedido some das etapas e vai
-- para "Oculto", sem cancelar). Vendas são editadas direto (policy do dono);
-- pedidos_marketplace só têm leitura, então a escrita é por `anotar_pedidos_marketplace`.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table vendas add column if not exists observacao_interna text;
alter table vendas add column if not exists tags text[] not null default '{}';
alter table vendas add column if not exists ocultado_em timestamptz;

alter table pedidos_marketplace add column if not exists observacao_interna text;
alter table pedidos_marketplace add column if not exists tags text[] not null default '{}';
alter table pedidos_marketplace add column if not exists ocultado_em timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendas_anotacoes_limite') then
    alter table vendas add constraint vendas_anotacoes_limite
      check ((observacao_interna is null or length(observacao_interna) <= 1000) and cardinality(tags) <= 8);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_marketplace_anotacoes_limite') then
    alter table pedidos_marketplace add constraint pedidos_marketplace_anotacoes_limite
      check ((observacao_interna is null or length(observacao_interna) <= 1000) and cardinality(tags) <= 8);
  end if;
end $$;

-- null = não mexe. Observação vazia apaga; tags '{}' limpa; p_ocultar true/false oculta/mostra.
create or replace function anotar_pedidos_marketplace(p_ids uuid[], p_observacao text default null, p_tags text[] default null, p_ocultar boolean default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_n    integer;
begin
  if v_user is null or not conta_ativa() then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if p_tags is not null and cardinality(p_tags) > 8 then
    raise exception 'No máximo 8 tags por pedido.';
  end if;
  update pedidos_marketplace set
    observacao_interna = case when p_observacao is null then observacao_interna else nullif(left(trim(p_observacao), 1000), '') end,
    tags = coalesce(p_tags, tags),
    ocultado_em = case when p_ocultar is null then ocultado_em when p_ocultar then coalesce(ocultado_em, now()) else null end,
    atualizado_em = now()
  where user_id = v_user and id = any(p_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function anotar_pedidos_marketplace(uuid[], text, text[], boolean) from public, anon;
grant execute on function anotar_pedidos_marketplace(uuid[], text, text[], boolean) to authenticated;

NOTIFY pgrst, 'reload schema';

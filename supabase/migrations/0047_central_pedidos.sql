-- ============================================================
-- 0047 — Central de pedidos em Vendas (Fase 9.4/9.5).
--
-- 1) vendas.etapa: o fluxo de expedição (Para Emitir → Imprimir → Enviar → Enviado →
--    Concluído). `status_envio` (0030) continua existindo e é mantido em sincronia por
--    gatilho, nos dois sentidos — telas antigas (detalhe do cliente) seguem funcionando.
--      * Venda nova: balcão (sem entrega) já entra Concluída; com entrega, Para Emitir.
--      * O pedido do catálogo, ao virar venda, recebe status_envio 'separacao' → Imprimir.
--    vendas.logistica: Retirada, Entrega própria, Correios, Motoboy... (texto livre).
-- 2) pedidos_marketplace.logistica e prazo_envio (Shopee Express, data limite de envio),
--    gravados por `atualizar_envio_marketplace` logo depois da importação.
-- 3) revincular_itens_marketplace: liga um SKU da Shopee a um produto DEPOIS que o pedido
--    já entrou (pela API), recalcula custo/lucro e baixa o estoque se o pedido já baixou.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Etapa e logística das vendas -------------------------------------------------------
alter table vendas add column if not exists etapa text;
alter table vendas add column if not exists logistica text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendas_etapa_valida') then
    alter table vendas add constraint vendas_etapa_valida
      check (etapa is null or etapa in ('emitir', 'imprimir', 'enviar', 'enviado', 'concluido'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vendas_logistica_tamanho') then
    alter table vendas add constraint vendas_logistica_tamanho check (logistica is null or length(logistica) <= 80);
  end if;
end $$;

create or replace function sincronizar_etapa_venda()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.etapa is null then
      new.etapa := case
        when new.status_envio = 'separacao' then 'imprimir'
        when new.status_envio = 'enviado' then 'enviado'
        when new.status_envio = 'concluido' then 'concluido'
        when coalesce(new.valor_entrega, 0) > 0 then 'emitir'
        else 'concluido'
      end;
    end if;
    if new.status_envio is null and new.etapa in ('emitir', 'imprimir', 'enviar') then
      new.status_envio := 'separacao';
    end if;
  elsif new.etapa is distinct from old.etapa then
    -- A etapa mudou (tela nova): o status_envio acompanha.
    new.status_envio := case new.etapa
      when 'emitir' then 'separacao'
      when 'imprimir' then 'separacao'
      when 'enviar' then 'separacao'
      when 'enviado' then 'enviado'
      when 'concluido' then case when old.status_envio is null then null else 'concluido' end
      else old.status_envio
    end;
  elsif new.status_envio is distinct from old.status_envio then
    -- O status_envio mudou (tela antiga): a etapa acompanha.
    new.etapa := case new.status_envio
      when 'separacao' then case when old.etapa in ('emitir', 'imprimir', 'enviar') then old.etapa else 'imprimir' end
      when 'enviado' then 'enviado'
      else 'concluido'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_etapa_venda on vendas;
create trigger trg_sincronizar_etapa_venda
before insert or update of etapa, status_envio on vendas
for each row execute function sincronizar_etapa_venda();

-- Vendas que já existiam: a etapa sai do status_envio (sem envio = já concluída).
update vendas set etapa = case status_envio
    when 'separacao' then 'imprimir'
    when 'enviado' then 'enviado'
    else 'concluido'
  end
 where etapa is null;

create index if not exists vendas_user_etapa_idx on vendas (user_id, etapa);

-- 2) Logística e prazo dos pedidos de marketplace ----------------------------------------
alter table pedidos_marketplace add column if not exists logistica text;
alter table pedidos_marketplace add column if not exists prazo_envio timestamptz;

create or replace function atualizar_envio_marketplace(p_loja_id uuid, p_envios jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_e    jsonb;
  v_n    integer := 0;
begin
  if v_user is null or not exists (select 1 from lojas_canal where id = p_loja_id and user_id = v_user) then
    raise exception 'Loja não encontrada.';
  end if;
  if jsonb_typeof(p_envios) <> 'array' or jsonb_array_length(p_envios) > 2000 then
    raise exception 'Envie no máximo 2.000 pedidos por vez.';
  end if;
  for v_e in select * from jsonb_array_elements(p_envios)
  loop
    update pedidos_marketplace
       set logistica = coalesce(left(nullif(v_e->>'logistica', ''), 80), logistica),
           prazo_envio = coalesce(nullif(v_e->>'prazo_envio', '')::timestamptz, prazo_envio)
     where user_id = v_user and loja_id = p_loja_id and numero = v_e->>'numero';
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;

revoke execute on function atualizar_envio_marketplace(uuid, jsonb) from public, anon;
grant execute on function atualizar_envio_marketplace(uuid, jsonb) to authenticated;

-- Mesma rotina pelo cron (service_role), como a importação.
create or replace function atualizar_envio_marketplace_servico(p_user uuid, p_loja_id uuid, p_envios jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  return atualizar_envio_marketplace(p_loja_id, p_envios);
end;
$$;

revoke execute on function atualizar_envio_marketplace_servico(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function atualizar_envio_marketplace_servico(uuid, uuid, jsonb) to service_role;

-- 3) Vincular anúncio depois que o pedido já entrou ---------------------------------------
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
    select distinct p.id, p.numero, p.estoque_baixado, p.subtotal, p.repasse
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

revoke execute on function revincular_itens_marketplace(uuid, text, uuid, numeric) from public, anon;
grant execute on function revincular_itens_marketplace(uuid, text, uuid, numeric) to authenticated;

NOTIFY pgrst, 'reload schema';

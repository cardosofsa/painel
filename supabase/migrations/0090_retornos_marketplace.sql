-- ============================================================
-- 0090 — Retornos (devoluções/reembolsos) do marketplace.
--
-- Por quê: a aba "Retornos" de Vendas mostra os pedidos de devolução da Shopee como o Seller
-- Center (em análise, em devolução, aprovadas, em disputa, canceladas). Até aqui o sistema só
-- sabia que um pedido virou `devolvido`; nada de motivo, valor, prazo de resposta ou etapa.
--
-- 1) `retornos_marketplace`: um retorno por (conta, loja, número do retorno). `status` guarda o
--    valor ORIGINAL da plataforma e `bruto` o payload inteiro: em qual sub-aba cada retorno cai é
--    decidido na leitura (`lib/retornos.ts`), então ajustar o mapa não exige migração nem nova sync.
-- 2) Escrita só pela RPC `importar_retornos_marketplace` (e a variante `_servico` do cron), como em
--    `pedidos_marketplace`: a tabela tem só policy de SELECT.
-- 3) `marketplace_conexoes.ultima_sincronizacao_retornos` / `ultimo_erro_retornos`: a sync de retornos
--    é um passo à parte; falha dela (ex.: app sem permissão de Devoluções) não derruba a de pedidos.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists retornos_marketplace (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users on delete cascade default auth.uid(),
  loja_id                  uuid not null references lojas_canal(id) on delete cascade,
  plataforma               text not null default 'shopee',
  return_sn                text not null,
  numero_pedido            text,
  status                   text not null,
  motivo                   text,
  valor_reembolso          numeric(12, 2) not null default 0,
  comprador                text,
  rastreio                 text,
  itens                    jsonb not null default '[]'::jsonb,
  criado_em_plataforma     timestamptz,
  atualizado_em_plataforma timestamptz,
  prazo_resposta           timestamptz,
  bruto                    jsonb,
  importado_em             timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  unique (user_id, loja_id, return_sn)
);
create index if not exists retornos_marketplace_user_data_idx on retornos_marketplace (user_id, criado_em_plataforma desc);
create index if not exists idx_fk_retornos_marketplace_loja_id on retornos_marketplace (loja_id);

alter table retornos_marketplace enable row level security;
drop policy if exists "le_retornos_marketplace" on retornos_marketplace;
create policy "le_retornos_marketplace" on retornos_marketplace for select
  using (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_retornos_mkt_loja on retornos_marketplace;
create trigger trg_valida_vinculo_retornos_mkt_loja
before insert or update of loja_id on retornos_marketplace
for each row execute function validar_vinculo_do_dono('loja_id', 'lojas_canal');

alter table marketplace_conexoes add column if not exists ultima_sincronizacao_retornos timestamptz;
alter table marketplace_conexoes add column if not exists ultimo_erro_retornos text;

-- p_retornos: [{"return_sn", "numero_pedido", "status", "motivo", "valor_reembolso", "comprador",
--               "rastreio", "itens": [...], "criado_em", "atualizado_em", "prazo_resposta", "bruto": {...}}]
-- Devolve quantos retornos entraram ou foram atualizados.
create or replace function importar_retornos_marketplace(p_loja_id uuid, p_retornos jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_plat  text;
  v_item  jsonb;
  v_sn    text;
  v_n     integer := 0;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not conta_ativa() then
    raise exception 'Conta sem acesso no momento.';
  end if;
  select coalesce(c.plataforma, 'shopee') into v_plat
    from lojas_canal l left join marketplace_conexoes c on c.loja_id = l.id and c.user_id = l.user_id
   where l.id = p_loja_id and l.user_id = v_user;
  if not found then
    raise exception 'Loja não encontrada.';
  end if;
  if jsonb_typeof(coalesce(p_retornos, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de retornos inválida.';
  end if;
  if jsonb_array_length(coalesce(p_retornos, '[]'::jsonb)) > 2000 then
    raise exception 'No máximo 2.000 retornos por vez.';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_retornos, '[]'::jsonb)) loop
    v_sn := nullif(trim(v_item->>'return_sn'), '');
    if v_sn is null or nullif(trim(v_item->>'status'), '') is null then
      continue;
    end if;
    insert into retornos_marketplace (
      user_id, loja_id, plataforma, return_sn, numero_pedido, status, motivo, valor_reembolso, comprador,
      rastreio, itens, criado_em_plataforma, atualizado_em_plataforma, prazo_resposta, bruto
    ) values (
      v_user, p_loja_id, v_plat, left(v_sn, 80), left(nullif(v_item->>'numero_pedido', ''), 80), left(trim(v_item->>'status'), 60),
      left(nullif(v_item->>'motivo', ''), 500), coalesce(round(nullif(v_item->>'valor_reembolso', '')::numeric, 2), 0),
      left(nullif(v_item->>'comprador', ''), 200), left(nullif(v_item->>'rastreio', ''), 120),
      case when jsonb_typeof(v_item->'itens') = 'array' then v_item->'itens' else '[]'::jsonb end,
      nullif(v_item->>'criado_em', '')::timestamptz, nullif(v_item->>'atualizado_em', '')::timestamptz,
      nullif(v_item->>'prazo_resposta', '')::timestamptz,
      case when jsonb_typeof(v_item->'bruto') = 'object' then v_item->'bruto' else null end
    )
    on conflict (user_id, loja_id, return_sn) do update set
      numero_pedido            = excluded.numero_pedido,
      status                   = excluded.status,
      motivo                   = excluded.motivo,
      valor_reembolso          = excluded.valor_reembolso,
      comprador                = excluded.comprador,
      rastreio                 = excluded.rastreio,
      itens                    = excluded.itens,
      criado_em_plataforma     = coalesce(excluded.criado_em_plataforma, retornos_marketplace.criado_em_plataforma),
      atualizado_em_plataforma = excluded.atualizado_em_plataforma,
      prazo_resposta           = excluded.prazo_resposta,
      bruto                    = excluded.bruto,
      atualizado_em            = now();
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke execute on function importar_retornos_marketplace(uuid, jsonb) from public, anon;
grant execute on function importar_retornos_marketplace(uuid, jsonb) to authenticated;

-- Cron: roda a MESMA importação como se fosse o dono da loja. Só o service_role executa.
create or replace function importar_retornos_marketplace_servico(p_user uuid, p_loja_id uuid, p_retornos jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from lojas_canal where id = p_loja_id and user_id = p_user) then
    raise exception 'Loja não encontrada.';
  end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  return importar_retornos_marketplace(p_loja_id, p_retornos);
end;
$$;

revoke execute on function importar_retornos_marketplace_servico(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function importar_retornos_marketplace_servico(uuid, uuid, jsonb) to service_role;

NOTIFY pgrst, 'reload schema';

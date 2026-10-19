-- ============================================================
-- 0104 — Ciclo de resultado do anúncio: versões do título × vendas.
--
-- Por quê: o Painel monta o título, cria o item na Shopee e analisa o anúncio, mas não sabia
-- dizer se o título novo vendeu mais que o antigo. Faltavam duas coisas:
--
--   1) `marketplace_titulos_historico` — o título de cada anúncio sincronizado, gravado QUANDO
--      MUDA (pela sincronização) e na criação pelo Painel. Mesmo desenho do histórico de
--      preço da 0102.
--   2) `vendas_por_anuncio_periodo` — unidades, receita e pedidos de um produto numa loja ENTRE
--      duas datas, somados no banco. A 0102 só somava "últimos N dias". Mesma regra de status
--      e mesma ressalva: os itens de pedido não guardam o item_id, a conta é por produto + loja.
--
-- Nada é removido nem renomeado; o código no ar continua funcionando antes e depois.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Histórico de título
create table if not exists marketplace_titulos_historico (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  anuncio_id  uuid not null references marketplace_anuncios(id) on delete cascade,
  titulo      text not null check (length(btrim(titulo)) between 1 and 300),
  origem      text not null default 'sincronizacao' check (origem in ('sincronizacao', 'painel')),
  lido_em     timestamptz not null default now()
);
create index if not exists marketplace_titulos_historico_idx on marketplace_titulos_historico (anuncio_id, lido_em desc);
create index if not exists marketplace_titulos_historico_user_idx on marketplace_titulos_historico (user_id);

alter table marketplace_titulos_historico enable row level security;
drop policy if exists "dono_marketplace_titulos_historico" on marketplace_titulos_historico;
create policy "dono_marketplace_titulos_historico" on marketplace_titulos_historico for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_titulo_hist_anuncio on marketplace_titulos_historico;
create trigger trg_valida_vinculo_titulo_hist_anuncio
before insert or update of anuncio_id on marketplace_titulos_historico
for each row execute function validar_vinculo_do_dono('anuncio_id', 'marketplace_anuncios');

-- 2) Vendas de um produto numa loja num período [p_de, p_ate)
create or replace function vendas_por_anuncio_periodo(p_loja uuid, p_produto uuid, p_de timestamptz, p_ate timestamptz)
returns table (unidades bigint, receita numeric, pedidos bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select
    coalesce(sum(i.quantidade), 0)::bigint,
    coalesce(sum(i.quantidade * i.preco_unitario), 0)::numeric,
    count(distinct p.id)::bigint
  from pedidos_marketplace p
  join pedidos_marketplace_itens i on i.pedido_id = p.id
  where p.user_id = auth.uid()
    and p.loja_id = p_loja
    and i.produto_id = p_produto
    and p.status not in ('nao_pago', 'cancelado', 'devolvido')
    and coalesce(p.pago_em, p.criado_em_plataforma) >= p_de
    and coalesce(p.pago_em, p.criado_em_plataforma) < coalesce(p_ate, now());
$$;

-- Padrão da 0077: fora de PUBLIC e anon, grant explícito a quem está logado.
revoke all on function vendas_por_anuncio_periodo(uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function vendas_por_anuncio_periodo(uuid, uuid, timestamptz, timestamptz) to authenticated;

NOTIFY pgrst, 'reload schema';

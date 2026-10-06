-- ============================================================
-- 0071 — Raio-X do anúncio (Fase 1): preço praticado × preço ideal.
--
-- 1) `precos_praticados`: o preço que a pessoa diz usar hoje num anúncio (chave = o anúncio
--    da precificação: produto + loja). Guarda o histórico; vale o mais recente.
-- 2) `marketplace_anuncios.preco_atual`: o preço que está no ar na Shopee / Mercado Livre,
--    lido pela mesma sincronização que já traz o estoque.
-- 3) `raio_x_vendas(p_dias)`: unidades e preço médio por produto e loja nos últimos dias —
--    pedidos dos marketplaces (por loja) e vendas do PDV/catálogo (loja nula). Soma no
--    banco, não na tela.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Preço praticado digitado
create table if not exists precos_praticados (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  chave        text not null check (length(chave) between 1 and 300),
  produto_id   uuid references produtos(id) on delete set null,
  loja_id      uuid references lojas_canal(id) on delete set null,
  preco        numeric(12,2) not null check (preco > 0 and preco < 1000000),
  observacao   text check (observacao is null or length(observacao) <= 200),
  observado_em timestamptz not null default now()
);

create index if not exists precos_praticados_chave_idx on precos_praticados (user_id, chave, observado_em desc);
create index if not exists idx_fk_precos_praticados_produto_id on precos_praticados (produto_id) where produto_id is not null;
create index if not exists idx_fk_precos_praticados_loja_id on precos_praticados (loja_id) where loja_id is not null;

alter table precos_praticados enable row level security;
drop policy if exists "dono_precos_praticados" on precos_praticados;
create policy "dono_precos_praticados" on precos_praticados for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_precos_praticados on precos_praticados;
create trigger trg_valida_vinculo_precos_praticados
  before insert or update of produto_id, loja_id on precos_praticados
  for each row execute function validar_vinculo_do_dono('produto_id', 'produtos', 'loja_id', 'lojas_canal');

-- 2) Preço do anúncio no ar
alter table marketplace_anuncios add column if not exists preco_atual numeric(12,2);
alter table marketplace_anuncios add column if not exists preco_lido_em timestamptz;

-- 3) Vendas recentes por produto e loja
create or replace function raio_x_vendas(p_dias integer default 30)
returns table (produto_id uuid, loja_id uuid, quantidade bigint, preco_medio numeric)
language sql
security invoker
stable
set search_path = public
as $$
  with mkt as (
    select i.produto_id, p.loja_id, i.quantidade, i.preco_unitario
      from pedidos_marketplace_itens i
      join pedidos_marketplace p on p.id = i.pedido_id
     where p.user_id = auth.uid()
       and i.produto_id is not null
       and p.status not in ('cancelado', 'devolvido')
       and coalesce(p.pago_em, p.criado_em_plataforma) >= now() - make_interval(days => greatest(coalesce(p_dias, 30), 1))
  ),
  proprias as (
    select vi.produto_id, null::uuid as loja_id, vi.quantidade, vi.preco_unitario
      from venda_itens vi
      join vendas v on v.id = vi.venda_id
     where v.user_id = auth.uid()
       and vi.produto_id is not null
       and v.status <> 'cancelada'
       and v.data_venda >= now() - make_interval(days => greatest(coalesce(p_dias, 30), 1))
  ),
  tudo as (select * from mkt union all select * from proprias)
  select produto_id, loja_id, sum(quantidade)::bigint, round(sum(preco_unitario * quantidade) / nullif(sum(quantidade), 0), 2)
    from tudo
   group by produto_id, loja_id;
$$;

revoke execute on function raio_x_vendas(integer) from public, anon;
grant execute on function raio_x_vendas(integer) to authenticated;

NOTIFY pgrst, 'reload schema';

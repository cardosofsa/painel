-- ============================================================
-- Vincula um produto a uma ou mais lojas (canal de venda) em que ele é
-- vendido. Até aqui esse vínculo só existia indiretamente, uma linha por
-- combinação, via anuncios/precificacoes — aqui é uma relação direta e
-- explícita no cadastro do produto.
-- ============================================================

create table produto_lojas (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  loja_id uuid not null references lojas_canal(id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (produto_id, loja_id)
);

create index produto_lojas_produto_id_idx on produto_lojas (produto_id);
create index produto_lojas_loja_id_idx on produto_lojas (loja_id);

alter table produto_lojas enable row level security;
create policy "own_rows_produto_lojas" on produto_lojas for all
  using (exists (select 1 from produtos p where p.id = produto_id and p.user_id = auth.uid()))
  with check (exists (select 1 from produtos p where p.id = produto_id and p.user_id = auth.uid()));

NOTIFY pgrst, 'reload schema';

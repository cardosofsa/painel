-- ============================================================
-- Concorrentes de preço, persistidos por produto
-- ============================================================

create table concorrentes_preco (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  nome text not null,
  preco numeric not null,
  link text,
  criado_em timestamptz not null default now()
);

create index concorrentes_preco_produto_id_idx on concorrentes_preco (produto_id);

alter table concorrentes_preco enable row level security;
create policy "own_rows_concorrentes_preco" on concorrentes_preco for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Formas de pagamento configuráveis pelo usuário (Configurações)
-- ============================================================

create table formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  nome text not null,
  criado_em timestamptz not null default now()
);

alter table formas_pagamento enable row level security;
create policy "own_rows_formas_pagamento" on formas_pagamento for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Enum fixo sai de cena: forma de pagamento passa a ser texto livre, vindo da lista
-- que o usuário cadastra acima. Coluna já é text, só removemos a restrição antiga.
alter table pedidos_compra drop constraint if exists pedidos_compra_forma_pagamento_check;

NOTIFY pgrst, 'reload schema';

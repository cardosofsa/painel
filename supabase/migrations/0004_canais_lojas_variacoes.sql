-- Painel — Canais → Lojas, faixas de comissão (Shopee), anúncios com variações.

-- ============================================================
-- Canais (categoria fixa: Shopee, Mercado Livre, Loja Física, Facebook)
-- ============================================================

create table canais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  nome text not null,
  tipo_taxa text not null default 'fixo' check (tipo_taxa in ('faixas', 'fixo')),
  icone text not null default 'Store',
  cor text not null default '#64748b',
  comissao_pct_padrao numeric not null default 0,
  taxa_fixa_padrao numeric not null default 0,
  taxa_extra_valor_padrao numeric,
  taxa_extra_tipo_padrao text check (taxa_extra_tipo_padrao in ('percentual', 'fixo')),
  criado_em timestamptz not null default now()
);

alter table canais enable row level security;
create policy "own_rows_canais" on canais for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Lojas do canal (a loja real do usuário; taxas nulas herdam o padrão do canal)
-- ============================================================

create table lojas_canal (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  canal_id uuid not null references canais(id) on delete cascade,
  nome text not null,
  logo_path text,
  link text,
  comissao_pct numeric,
  taxa_fixa numeric,
  taxa_extra_valor numeric,
  taxa_extra_tipo text check (taxa_extra_tipo in ('percentual', 'fixo')),
  criado_em timestamptz not null default now()
);

alter table lojas_canal enable row level security;
create policy "own_rows_lojas_canal" on lojas_canal for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index lojas_canal_canal_id_idx on lojas_canal (canal_id);

-- ============================================================
-- Seed dos canais padrão: usuários existentes + trigger para novos cadastros
-- ============================================================

insert into canais (user_id, nome, tipo_taxa, icone, cor, comissao_pct_padrao, taxa_fixa_padrao)
select id, 'Shopee', 'faixas', 'ShoppingBag', '#EE4D2D', 0, 0 from auth.users
union all
select id, 'Mercado Livre', 'fixo', 'ShoppingCart', '#FFE600', 0, 0 from auth.users
union all
select id, 'Loja Física', 'fixo', 'Store', '#64748b', 0, 0 from auth.users
union all
select id, 'Facebook', 'fixo', 'Facebook', '#1877F2', 0, 0 from auth.users;

create or replace function seed_canais_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into canais (user_id, nome, tipo_taxa, icone, cor, comissao_pct_padrao, taxa_fixa_padrao) values
    (new.id, 'Shopee', 'faixas', 'ShoppingBag', '#EE4D2D', 0, 0),
    (new.id, 'Mercado Livre', 'fixo', 'ShoppingCart', '#FFE600', 0, 0),
    (new.id, 'Loja Física', 'fixo', 'Store', '#64748b', 0, 0),
    (new.id, 'Facebook', 'fixo', 'Facebook', '#1877F2', 0, 0);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_seed_canais on auth.users;
create trigger on_auth_user_created_seed_canais
after insert on auth.users
for each row execute function seed_canais_novo_usuario();

-- ============================================================
-- Precificações: vínculo com loja, snapshot dos insumos, taxa extra
-- ============================================================

alter table precificacoes
  add column loja_id uuid references lojas_canal(id) on delete set null,
  add column componentes jsonb,
  add column taxa_extra_valor numeric,
  add column taxa_extra_tipo text check (taxa_extra_tipo in ('percentual', 'fixo'));

-- ============================================================
-- Anúncios com variações (Unidade, Kit 2, Kit 3...)
-- ============================================================

create table anuncios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  produto_id uuid references produtos(id) on delete set null,
  loja_id uuid references lojas_canal(id) on delete set null,
  nome_anuncio text not null,
  titulo_anuncio text,
  componentes_base jsonb,
  criado_em timestamptz not null default now()
);

alter table anuncios enable row level security;
create policy "own_rows_anuncios" on anuncios for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table anuncio_variacoes (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references anuncios(id) on delete cascade,
  nome_variacao text not null,
  multiplicador integer not null default 1,
  custo numeric not null default 0,
  taxa_variavel_pct numeric not null default 0,
  taxa_fixa numeric not null default 0,
  taxa_adicional_pct numeric not null default 0,
  imposto_pct numeric not null default 0,
  taxa_extra_valor numeric,
  taxa_extra_tipo text check (taxa_extra_tipo in ('percentual', 'fixo')),
  margem_pct numeric,
  preco_calculado numeric not null default 0,
  lucro numeric not null default 0,
  criado_em timestamptz not null default now()
);

alter table anuncio_variacoes enable row level security;
create policy "own_rows_anuncio_variacoes" on anuncio_variacoes for all
  using (exists (select 1 from anuncios a where a.id = anuncio_id and a.user_id = auth.uid()))
  with check (exists (select 1 from anuncios a where a.id = anuncio_id and a.user_id = auth.uid()));

create index anuncio_variacoes_anuncio_id_idx on anuncio_variacoes (anuncio_id);

-- ============================================================
-- Storage: logos de loja
-- ============================================================

insert into storage.buckets (id, name, public)
values ('canais-logos', 'canais-logos', true)
on conflict (id) do nothing;

create policy "canais_logos_select_public" on storage.objects for select
  using (bucket_id = 'canais-logos');

create policy "canais_logos_insert_own" on storage.objects for insert
  with check (bucket_id = 'canais-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "canais_logos_update_own" on storage.objects for update
  using (bucket_id = 'canais-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "canais_logos_delete_own" on storage.objects for delete
  using (bucket_id = 'canais-logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Remove a tabela antiga de canais/lojas (confirmado vazia, substituída pelo modelo acima)
-- ============================================================

drop table if exists canais_venda cascade;

NOTIFY pgrst, 'reload schema';

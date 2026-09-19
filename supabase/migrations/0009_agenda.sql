-- ============================================================
-- Agenda básica: compromissos no Dashboard (sem Google Calendar por enquanto)
-- ============================================================

create table compromissos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users default auth.uid(),
  titulo text not null,
  data date not null,
  hora time,
  descricao text,
  criado_em timestamptz not null default now()
);

create index compromissos_user_id_data_idx on compromissos (user_id, data);

alter table compromissos enable row level security;
create policy "own_rows_compromissos" on compromissos for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';

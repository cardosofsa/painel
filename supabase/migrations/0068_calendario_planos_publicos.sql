-- 0068 — Calendário do Dashboard e planos na página inicial.
--
-- 1) `datas_calendario`: datas de cada conta que nenhuma tabela fixa cobre — feriado da
--    cidade (aniversário, padroeiro), aniversário da loja, promoção própria. Repete todo
--    ano quando marcado. Os feriados nacionais/estaduais e as datas do comércio são
--    calculados no código (`lib/feriados.ts`, `lib/calendario-comercial.ts`), não ficam aqui.
-- 2) `perfil_negocio.calendario_uf`: estado dos feriados estaduais (null = o UF da empresa).
--    `calendario_camadas`: o que aparece no calendário (feriados, comércio, vencimentos…).
-- 3) `planos_publicos()`: nome, preço e limites dos planos ATIVOS para a página inicial,
--    que é aberta sem login. A tabela `planos` continua legível só para quem entrou.
--
-- Idempotente. Termina com NOTIFY.

-- 1) Datas próprias
create table if not exists datas_calendario (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  titulo text not null check (length(btrim(titulo)) between 1 and 80),
  data date not null,
  repete_todo_ano boolean not null default true,
  tipo text not null default 'municipal' check (tipo in ('municipal', 'pessoal', 'promocao')),
  observacao text check (observacao is null or length(observacao) <= 200),
  criado_em timestamptz not null default now()
);

create index if not exists datas_calendario_user_idx on datas_calendario (user_id, data);

alter table datas_calendario enable row level security;
drop policy if exists "dono_datas_calendario" on datas_calendario;
create policy "dono_datas_calendario" on datas_calendario for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

-- 2) Preferências do calendário
alter table perfil_negocio add column if not exists calendario_uf text;
alter table perfil_negocio add column if not exists calendario_camadas jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfil_negocio_calendario_uf') then
    alter table perfil_negocio add constraint perfil_negocio_calendario_uf
      check (calendario_uf is null or calendario_uf ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfil_negocio_calendario_camadas') then
    alter table perfil_negocio add constraint perfil_negocio_calendario_camadas
      check (calendario_camadas is null or jsonb_typeof(calendario_camadas) = 'array');
  end if;
end $$;

-- 3) Planos para quem ainda não tem conta. Só o que é público: nada de assinatura, conta
-- ou usuário. `security definer` porque a policy de `planos` exige login.
drop function if exists planos_publicos();
create function planos_publicos()
returns table (
  id text,
  nome text,
  descricao text,
  preco_mensal numeric,
  limite_produtos integer,
  limite_lojas integer,
  limite_usuarios integer,
  limite_ia_mes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome, p.descricao, p.preco_mensal, p.limite_produtos, p.limite_lojas, p.limite_usuarios, p.limite_ia_mes
    from planos p
   where p.ativo
   order by p.ordem, p.preco_mensal;
$$;

revoke execute on function planos_publicos() from public;
grant execute on function planos_publicos() to anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- 0076 — Plataforma (Fase 5, onda D): erros do app, uso de IA por conta e backups semanais.
--
-- 1) `erros_app`: o que quebra no ar (servidor e navegador), para o master ver no admin.
--    Escrita só pela RPC `registrar_erro_app` (security definer, campos cortados, no máximo
--    60 por minuto no total e 5.000 guardados); leitura só pela `admin_erros_app` (master).
--    Nada de dado de conta: mensagem, rota, digest e onde aconteceu.
-- 2) `admin_uso_ia(p_inicio)`: gerações de texto (ia_uso) e imagens (ia_imagens, 0072) por
--    conta desde a data, para o master estimar o custo da IA do sistema.
-- 3) Bucket privado `backups`: o cron semanal grava `<user_id>/<data>.json` com o serviço;
--    cada conta só LÊ a própria pasta (download pela tela Dados).
--
-- Idempotente: if not exists, create or replace, drop policy if exists, on conflict.

-- ---------- 1) Erros do app ----------
create table if not exists erros_app (
  id         bigint generated always as identity primary key,
  criado_em  timestamptz not null default now(),
  onde       text not null check (onde in ('servidor', 'navegador')),
  mensagem   text not null check (length(mensagem) <= 500),
  rota       text check (rota is null or length(rota) <= 300),
  digest     text check (digest is null or length(digest) <= 100),
  user_id    uuid references auth.users on delete set null
);

create index if not exists erros_app_criado_idx on erros_app (criado_em desc);
create index if not exists idx_fk_erros_app_user_id on erros_app (user_id) where user_id is not null;

alter table erros_app enable row level security;
-- Sem policy: ninguém lê nem grava direto pela API. Tudo pelas RPCs abaixo.
revoke all on erros_app from anon, authenticated;

create or replace function registrar_erro_app(p_onde text, p_mensagem text, p_rota text default null, p_digest text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_onde not in ('servidor', 'navegador') or coalesce(btrim(p_mensagem), '') = '' then
    return;
  end if;
  -- Freio contra enxurrada (loop de erro ou abuso): 60 por minuto no total.
  if (select count(*) from erros_app where criado_em > now() - interval '1 minute') >= 60 then
    return;
  end if;
  insert into erros_app (onde, mensagem, rota, digest, user_id)
  values (p_onde, left(btrim(p_mensagem), 500), left(nullif(btrim(coalesce(p_rota, '')), ''), 300), left(nullif(btrim(coalesce(p_digest, '')), ''), 100), auth.uid());
  -- Guarda só os 5.000 mais recentes.
  delete from erros_app where id < (select min(id) from (select id from erros_app order by id desc limit 5000) t);
end;
$$;

revoke execute on function registrar_erro_app(text, text, text, text) from public;
grant execute on function registrar_erro_app(text, text, text, text) to anon, authenticated;

create or replace function admin_erros_app(p_limite integer default 200)
returns table (id bigint, criado_em timestamptz, onde text, mensagem text, rota text, digest text, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not e_master() then
    raise exception 'Só o administrador pode ver os erros do sistema.';
  end if;
  return query
  select e.id, e.criado_em, e.onde, e.mensagem, e.rota, e.digest, pa.email
    from erros_app e
    left join perfis_acesso pa on pa.user_id = e.user_id
   order by e.id desc
   limit least(greatest(coalesce(p_limite, 200), 1), 1000);
end;
$$;

revoke execute on function admin_erros_app(integer) from public, anon;
grant execute on function admin_erros_app(integer) to authenticated;

-- ---------- 2) Uso de IA por conta ----------
create or replace function admin_uso_ia(p_inicio date)
returns table (user_id uuid, email text, negocio text, geracoes bigint, cache_hits bigint, imagens bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not e_master() then
    raise exception 'Só o administrador pode ver o uso de IA das contas.';
  end if;
  if to_regclass('public.ia_imagens') is not null then
    return query execute $q$
      with t as (
        select u.user_id, sum(u.geracoes)::bigint as g, sum(u.cache_hits)::bigint as c from ia_uso u where u.dia >= $1 group by u.user_id
      ), i as (
        select im.user_id, count(*)::bigint as n from ia_imagens im where im.status = 'ok' and im.criado_em >= $1 group by im.user_id
      )
      select pa.user_id, pa.email, pn.nome_negocio, coalesce(t.g, 0), coalesce(t.c, 0), coalesce(i.n, 0)
        from perfis_acesso pa
        left join t on t.user_id = pa.user_id
        left join i on i.user_id = pa.user_id
        left join perfil_negocio pn on pn.user_id = pa.user_id
       where coalesce(t.g, 0) + coalesce(i.n, 0) + coalesce(t.c, 0) > 0
       order by coalesce(t.g, 0) + coalesce(i.n, 0) * 10 desc
    $q$ using p_inicio;
  else
    return query
    select pa.user_id, pa.email, pn.nome_negocio, sum(u.geracoes)::bigint, sum(u.cache_hits)::bigint, 0::bigint
      from ia_uso u
      join perfis_acesso pa on pa.user_id = u.user_id
      left join perfil_negocio pn on pn.user_id = u.user_id
     where u.dia >= p_inicio
     group by pa.user_id, pa.email, pn.nome_negocio
     order by 4 desc;
  end if;
end;
$$;

revoke execute on function admin_uso_ia(date) from public, anon;
grant execute on function admin_uso_ia(date) to authenticated;

-- ---------- 3) Backups semanais ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/json'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Leitura só da própria pasta. Escrita e remoção: só o serviço (cron), que ignora RLS.
drop policy if exists "backups_select_own" on storage.objects;
create policy "backups_select_own" on storage.objects for select
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text);

NOTIFY pgrst, 'reload schema';

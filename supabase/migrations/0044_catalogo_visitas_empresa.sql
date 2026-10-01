-- ============================================================
-- 0044 — Visitas do catálogo e dados públicos da loja na vitrine (Fase 8.7).
--
-- 1) `catalogo_visitas`: um contador por catálogo e por dia. Anônimo de propósito — sem IP,
--    sem cookie, sem identificar o visitante (nada para a Política de Privacidade declarar
--    além de "contamos acessos"). É aproximado: robôs e recarregamentos também contam.
--    Escrita só pela RPC pública `registrar_visita_catalogo`, que só soma em catálogo ativo
--    de conta ativa e trava em 100 mil por dia para ninguém inflar sem limite.
--
-- 2) `obter_empresa_catalogo`: o que a vitrine mostra sobre a loja (nome, logo, cidade/UF,
--    Instagram, WhatsApp). São dados que o dono já publica no próprio catálogo; nada além
--    disso sai (CNPJ, e-mail, endereço completo ficam de fora).
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists catalogo_visitas (
  catalogo_id uuid not null references catalogos(id) on delete cascade,
  user_id     uuid not null references auth.users on delete cascade,
  dia         date not null,
  visitas     integer not null default 0 check (visitas >= 0),
  primary key (catalogo_id, dia)
);

create index if not exists catalogo_visitas_user_idx on catalogo_visitas (user_id, dia);

alter table catalogo_visitas enable row level security;
drop policy if exists "le_catalogo_visitas" on catalogo_visitas;
create policy "le_catalogo_visitas" on catalogo_visitas for select
  using (auth.uid() = user_id and conta_ativa());

create or replace function registrar_visita_catalogo(p_slug text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat record;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select id, user_id into v_cat from catalogos where slug = p_slug and ativo = true;
  if not found or not conta_ativa_de(v_cat.user_id) then
    return;
  end if;

  insert into catalogo_visitas (catalogo_id, user_id, dia, visitas)
  values (v_cat.id, v_cat.user_id, v_dia, 1)
  on conflict (catalogo_id, dia) do update
    set visitas = least(catalogo_visitas.visitas + 1, 100000);
end;
$$;

revoke execute on function registrar_visita_catalogo(text) from public;
grant execute on function registrar_visita_catalogo(text) to anon, authenticated;

create or replace function obter_empresa_catalogo(p_slug text)
returns table (nome_negocio text, logo_url text, cidade text, uf text, instagram text, whatsapp text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat record;
begin
  select id, user_id into v_cat from catalogos where slug = p_slug and ativo = true;
  if not found or not conta_ativa_de(v_cat.user_id) then
    return;
  end if;
  return query
    select p.nome_negocio, p.logo_url, p.cidade, p.uf, p.instagram, p.whatsapp
      from perfil_negocio p
     where p.user_id = v_cat.user_id;
end;
$$;

revoke execute on function obter_empresa_catalogo(text) from public;
grant execute on function obter_empresa_catalogo(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';

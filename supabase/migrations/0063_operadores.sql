-- ============================================================
-- 0063 — Equipe: operadores com PIN e comissão (Fase 11.8).
--
-- A loja continua com UM login. Cada funcionário é um OPERADOR (nome + PIN de 4 a 6 dígitos)
-- com as telas que pode usar e a comissão (% sobre a venda ou sobre o lucro). Quem está
-- operando vai num cookie assinado; a venda grava o operador (vendas.operador_id).
--
-- Segurança (o login é compartilhado):
--   * o hash do PIN NÃO é legível pela API (privilégio por coluna) — só as funções abaixo
--     (security definer) o usam;
--   * errar o PIN custa 0,8 s (freia tentativa em série);
--   * criar/alterar operador e ligar "exigir operador" pedem o PIN de administrador da
--     loja quando ele existe (perfil_negocio.pin_admin_hash, 0021);
--   * a restrição de telas é aplicada no middleware (navegação); a conta continua sendo uma
--     só no banco — é o modelo escolhido (rápido, sem reescrever o RLS).
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists operadores (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade default auth.uid(),
  nome           text not null check (length(btrim(nome)) between 1 and 60),
  pin_hash       text not null,
  abas           text[] not null default array['pdv']::text[],
  comissao_pct   numeric(5,2) not null default 0 check (comissao_pct between 0 and 100),
  comissao_base  text not null default 'venda' check (comissao_base in ('venda', 'lucro')),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  unique (user_id, nome)
);

alter table operadores enable row level security;
drop policy if exists "dono_operadores" on operadores;
create policy "dono_operadores" on operadores for select using (auth.uid() = user_id and conta_ativa());

-- O hash do PIN fica fora do alcance da API: só as colunas abaixo são legíveis.
revoke all on operadores from anon, authenticated;
grant select (id, user_id, nome, abas, comissao_pct, comissao_base, ativo, criado_em) on operadores to authenticated;

alter table vendas add column if not exists operador_id uuid references operadores(id) on delete set null;
create index if not exists vendas_operador_idx on vendas (operador_id) where operador_id is not null;

alter table perfil_negocio add column if not exists exigir_operador boolean not null default false;

-- PIN de administrador confere? (sem PIN cadastrado = livre)
create or replace function pin_admin_confere(p_pin text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(
    (select case when pn.pin_admin_hash is null then true else pn.pin_admin_hash = crypt(coalesce(btrim(p_pin), ''), pn.pin_admin_hash) end
       from perfil_negocio pn where pn.user_id = auth.uid()),
    true);
$$;

revoke execute on function pin_admin_confere(text) from public, anon;
grant execute on function pin_admin_confere(text) to authenticated;

create or replace function salvar_operador(
  p_id uuid,
  p_nome text,
  p_pin text,
  p_abas text[],
  p_comissao_pct numeric,
  p_comissao_base text,
  p_ativo boolean,
  p_pin_admin text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null or not conta_ativa() then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not pin_admin_confere(p_pin_admin) then
    raise exception 'PIN de administrador incorreto.';
  end if;
  if p_pin is not null and btrim(p_pin) !~ '^\d{4,6}$' then
    raise exception 'O PIN do operador tem de 4 a 6 números.';
  end if;
  if p_id is null then
    if p_pin is null then
      raise exception 'Defina o PIN do operador.';
    end if;
    insert into operadores (user_id, nome, pin_hash, abas, comissao_pct, comissao_base, ativo)
    values (v_user, btrim(p_nome), crypt(btrim(p_pin), gen_salt('bf')), coalesce(p_abas, array['pdv']), coalesce(p_comissao_pct, 0), coalesce(p_comissao_base, 'venda'), coalesce(p_ativo, true))
    returning id into v_id;
  else
    update operadores set
      nome = btrim(p_nome),
      pin_hash = case when p_pin is null then pin_hash else crypt(btrim(p_pin), gen_salt('bf')) end,
      abas = coalesce(p_abas, abas),
      comissao_pct = coalesce(p_comissao_pct, comissao_pct),
      comissao_base = coalesce(p_comissao_base, comissao_base),
      ativo = coalesce(p_ativo, ativo)
    where id = p_id and user_id = v_user
    returning id into v_id;
    if v_id is null then
      raise exception 'Operador não encontrado.';
    end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function salvar_operador(uuid, text, text, text[], numeric, text, boolean, text) from public, anon;
grant execute on function salvar_operador(uuid, text, text, text[], numeric, text, boolean, text) to authenticated;

-- Entrar como operador: PIN certo devolve quem é; errado espera e recusa.
create or replace function entrar_operador(p_id uuid, p_pin text)
returns table (id uuid, nome text, abas text[])
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_op operadores;
begin
  select * into v_op from operadores o where o.id = p_id and o.user_id = auth.uid() and o.ativo;
  if not found or v_op.pin_hash <> crypt(coalesce(btrim(p_pin), ''), v_op.pin_hash) then
    perform pg_sleep(0.8);
    raise exception 'PIN incorreto.';
  end if;
  return query select v_op.id, v_op.nome, v_op.abas;
end;
$$;

revoke execute on function entrar_operador(uuid, text) from public, anon;
grant execute on function entrar_operador(uuid, text) to authenticated;

-- Ligar/desligar "exigir operador" (pede o PIN de administrador, se houver).
create or replace function definir_exigir_operador(p_exigir boolean, p_pin_admin text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null or not conta_ativa() then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not pin_admin_confere(p_pin_admin) then
    raise exception 'PIN de administrador incorreto.';
  end if;
  insert into perfil_negocio (user_id, exigir_operador) values (auth.uid(), p_exigir)
  on conflict (user_id) do update set exigir_operador = excluded.exigir_operador;
end;
$$;

revoke execute on function definir_exigir_operador(boolean, text) from public, anon;
grant execute on function definir_exigir_operador(boolean, text) to authenticated;

-- Marca o operador na venda (só operador da própria conta).
create or replace function marcar_operador_venda(p_venda_id uuid, p_operador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update vendas set operador_id = p_operador_id
   where id = p_venda_id and user_id = auth.uid()
     and exists (select 1 from operadores o where o.id = p_operador_id and o.user_id = auth.uid());
end;
$$;

revoke execute on function marcar_operador_venda(uuid, uuid) from public, anon;
grant execute on function marcar_operador_venda(uuid, uuid) to authenticated;

NOTIFY pgrst, 'reload schema';

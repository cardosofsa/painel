-- ============================================================
-- 0081: PIN de administração fora do alcance do PostgREST e `conta_ativa()` nas RPCs que
-- ainda não conferiam.
--
-- 1) O hash do PIN morava em `perfil_negocio.pin_admin_hash`, que o próprio usuário lê e
--    escreve pela policy da tabela. Quem usa o modo operador (a mesma sessão do dono) podia
--    ler o hash pelo console e quebrá-lo por força bruta offline (4 a 8 números = no máximo
--    10^8 tentativas, sem contador), ou simplesmente gravar outro hash por cima. Agora ele vai
--    para `pin_admin_segredo`, sem policy nem grant: só funções `security definer` tocam nela.
--    A coluna antiga fica (o código no ar ainda a seleciona), mas um trigger zera tudo que
--    for gravado nela.
-- 2) `definir_pin_admin` passa a pedir o PIN atual para trocar ou remover um PIN existente.
--    Sem ele, o operador trocava o PIN do dono e liberava a edição de vendas. Esqueceu o PIN?
--    Entre de novo com a senha: até 10 minutos depois do login a troca não pede o atual.
-- 3) `salvar_operador` e `definir_exigir_operador` erravam o PIN com `raise`, que desfazia a
--    contagem de tentativas junto: dava para chutar o PIN sem nunca bloquear. Agora devolvem
--    o erro no corpo com status 400 (mesmo padrão do `editar_venda` da 0077) e a contagem fica.
-- 4) `conta_ativa()` nas RPCs que escrevem e ainda não conferiam (conta suspensa seguia
--    mexendo em pedido de marketplace e operador), e `conta_ativa_de` nas três da vitrine.
--
-- Idempotente: pode rodar de novo por cima.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabela do segredo
-- ------------------------------------------------------------
create table if not exists pin_admin_segredo (
  user_id       uuid primary key references auth.users on delete cascade default auth.uid(),
  hash          text not null,
  atualizado_em timestamptz not null default now()
);

alter table pin_admin_segredo enable row level security;
-- Sem policy de propósito (como `perfis_acesso` sem policy de escrita): nada passa pelo
-- PostgREST. Não "padronize" com `using (auth.uid() = user_id)`: devolveria o hash ao console.
revoke all on pin_admin_segredo from public, anon, authenticated;

-- Copia os hashes existentes e limpa a coluna antiga.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'perfil_negocio' and column_name = 'pin_admin_hash') then
    insert into pin_admin_segredo (user_id, hash)
    select user_id, pin_admin_hash from perfil_negocio where pin_admin_hash is not null
    on conflict (user_id) do nothing;
    update perfil_negocio set pin_admin_hash = null where pin_admin_hash is not null;
  end if;
end $$;

-- Nada mais grava na coluna antiga, nem pelo PostgREST.
create or replace function perfil_negocio_sem_pin_hash()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.pin_admin_hash := null;
  return new;
end;
$$;

drop trigger if exists perfil_negocio_sem_pin_hash on perfil_negocio;
create trigger perfil_negocio_sem_pin_hash
  before insert or update on perfil_negocio
  for each row execute function perfil_negocio_sem_pin_hash();

-- O que a tela precisa saber: se existe PIN. Nunca qual.
create or replace function tem_pin_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from pin_admin_segredo where user_id = auth.uid());
$$;

revoke execute on function tem_pin_admin() from public, anon;
grant execute on function tem_pin_admin() to authenticated;

-- ------------------------------------------------------------
-- 2) Conferência (mesma lógica da 0077, lendo da tabela nova)
-- ------------------------------------------------------------
create or replace function pin_admin_checar(p_pin text)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  MAX_FALHAS constant integer  := 5;
  BLOQUEIO   constant interval := interval '15 minutes';
  v_user     uuid := auth.uid();
  v_hash     text;
  v_t        pin_admin_tentativas%rowtype;
begin
  if v_user is null then
    return 'incorreto';
  end if;
  select s.hash into v_hash from pin_admin_segredo s where s.user_id = v_user;
  if v_hash is null then
    return 'livre';
  end if;

  perform pg_advisory_xact_lock(hashtext('pin_admin:' || v_user::text));

  select * into v_t from pin_admin_tentativas t where t.user_id = v_user;
  if v_t.bloqueado_ate is not null and v_t.bloqueado_ate > now() then
    return 'bloqueado';
  end if;

  if v_hash = crypt(coalesce(btrim(p_pin), ''), v_hash) then
    if v_t.user_id is not null and (v_t.falhas <> 0 or v_t.bloqueado_ate is not null) then
      update pin_admin_tentativas set falhas = 0, bloqueado_ate = null where user_id = v_user;
    end if;
    return 'ok';
  end if;

  perform pg_sleep(0.8);
  insert into pin_admin_tentativas as t (user_id, falhas, ultima_falha_em)
  values (v_user, 1, now())
  on conflict (user_id) do update
    set falhas = case
                   when t.bloqueado_ate is not null or t.ultima_falha_em < now() - interval '1 day' then 1
                   else t.falhas + 1
                 end,
        bloqueado_ate = null,
        ultima_falha_em = now()
  returning * into v_t;

  if v_t.falhas >= MAX_FALHAS then
    update pin_admin_tentativas set falhas = 0, bloqueado_ate = now() + BLOQUEIO where user_id = v_user;
    return 'bloqueou';
  end if;
  return 'incorreto';
end;
$$;

revoke execute on function pin_admin_checar(text) from public, anon;
grant execute on function pin_admin_checar(text) to authenticated;

-- Resposta de erro sem `raise` (a transação é confirmada e a tentativa fica contada). O
-- PostgREST devolve o corpo com o status 400 e o supabase-js entrega como `error`.
create or replace function pin_admin_erro(p_estado text)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
begin
  perform set_config('response.status', '400', true);
  return jsonb_build_object(
    'code', 'P0001',
    'message', case p_estado
                 when 'bloqueou' then 'PIN de administrador incorreto. Foram 5 tentativas erradas seguidas: o PIN ficou bloqueado por 15 minutos.'
                 when 'bloqueado' then 'Muitas tentativas erradas: o PIN de administrador está bloqueado por até 15 minutos.'
                 else 'PIN de administrador incorreto.'
               end,
    'details', null,
    'hint', null
  );
end;
$$;

revoke execute on function pin_admin_erro(text) from public, anon, authenticated;

-- Login (senha, link ou código) há no máximo 10 minutos: claim `amr` do JWT da GoTrue,
-- que guarda a hora de cada método usado e não muda quando o token é renovado.
create or replace function login_recente()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select max((m ->> 'timestamp')::bigint)
       from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) m
      where m ->> 'method' in ('password', 'otp', 'magiclink', 'oauth', 'recovery')
        and (m ->> 'timestamp') ~ '^\d+$')
      > extract(epoch from now()) - 600,
    false);
$$;

revoke execute on function login_recente() from public, anon;
grant execute on function login_recente() to authenticated;

-- ------------------------------------------------------------
-- 3) Gravar o PIN: pede o atual (ou login recente) para trocar ou remover
-- ------------------------------------------------------------
drop function if exists definir_pin_admin(text);

create or replace function definir_pin_admin(p_pin text, p_pin_atual text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_user   uuid := auth.uid();
  v_estado text;
begin
  if v_user is null or not conta_ativa() then
    raise exception 'Sua conta não está ativa. Fale com o administrador.';
  end if;
  if p_pin is not null and btrim(p_pin) <> '' and btrim(p_pin) !~ '^\d{4,8}$' then
    raise exception 'O PIN deve ter de 4 a 8 números.';
  end if;

  if exists (select 1 from pin_admin_segredo where user_id = v_user) and not login_recente() then
    v_estado := pin_admin_checar(p_pin_atual);
    if v_estado <> 'ok' then
      return pin_admin_erro(v_estado);
    end if;
  end if;

  if p_pin is null or btrim(p_pin) = '' then
    delete from pin_admin_segredo where user_id = v_user;
  else
    insert into pin_admin_segredo (user_id, hash, atualizado_em)
    values (v_user, crypt(btrim(p_pin), gen_salt('bf')), now())
    on conflict (user_id) do update set hash = excluded.hash, atualizado_em = now();
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function definir_pin_admin(text, text) from public, anon;
grant execute on function definir_pin_admin(text, text) to authenticated;

-- ------------------------------------------------------------
-- 4) Operadores: PIN errado não desfaz mais a contagem
-- ------------------------------------------------------------
drop function if exists salvar_operador(uuid, text, text, text[], numeric, text, boolean, text);

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
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_user   uuid := auth.uid();
  v_id     uuid;
  v_estado text;
begin
  if v_user is null or not conta_ativa() then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  v_estado := pin_admin_checar(p_pin_admin);
  if v_estado not in ('ok', 'livre') then
    return pin_admin_erro(v_estado);
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
  return jsonb_build_object('id', v_id);
end;
$$;

revoke execute on function salvar_operador(uuid, text, text, text[], numeric, text, boolean, text) from public, anon;
grant execute on function salvar_operador(uuid, text, text, text[], numeric, text, boolean, text) to authenticated;

drop function if exists definir_exigir_operador(boolean, text);

create or replace function definir_exigir_operador(p_exigir boolean, p_pin_admin text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_estado text;
begin
  if auth.uid() is null or not conta_ativa() then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  v_estado := pin_admin_checar(p_pin_admin);
  if v_estado not in ('ok', 'livre') then
    return pin_admin_erro(v_estado);
  end if;
  insert into perfil_negocio (user_id, exigir_operador) values (auth.uid(), p_exigir)
  on conflict (user_id) do update set exigir_operador = excluded.exigir_operador;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function definir_exigir_operador(boolean, text) from public, anon;
grant execute on function definir_exigir_operador(boolean, text) to authenticated;

-- ------------------------------------------------------------
-- 5) Remendos por texto em funções longas (sem copiar o corpo inteiro aqui):
--    - editar_venda (security invoker) lia o hash da coluna antiga para saber se há PIN;
--    - RPCs que escrevem sem conferir `conta_ativa()`: a checagem entra logo após o begin.
--    Cada remendo só roda se o trecho original ainda existe e o novo ainda não: reexecutar
--    não muda nada.
-- ------------------------------------------------------------
do $$
declare
  v_oid  oid;
  v_def  text;
  v_novo text;
  v_fn   text;
  CHECA  constant text := E'\nbegin\n  if auth.uid() is null or not conta_ativa() then\n    raise exception ''Sua conta não está ativa. Fale com o administrador.'';\n  end if;\n';
begin
  -- editar_venda
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'editar_venda' limit 1;
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    v_novo := replace(v_def,
      'select pin_admin_hash into v_hash from perfil_negocio where user_id = v_user;',
      'v_hash := case when tem_pin_admin() then ''cadastrado'' end;');
    if v_novo <> v_def then
      execute v_novo;
    end if;
  end if;

  foreach v_fn in array array[
    'remover_pedido_marketplace', 'atualizar_envio_marketplace', 'revincular_itens_marketplace',
    'marcar_operador_venda', 'entrar_operador'
  ] loop
    for v_oid in
      select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = v_fn and p.prosrc !~ 'conta_ativa\('
    loop
      v_def := pg_get_functiondef(v_oid);
      -- Primeiro `begin` de linha inteira: o do bloco principal (o `declare` vem antes).
      v_novo := regexp_replace(v_def, E'\\nbegin\\n', CHECA, '');
      if v_novo = v_def then
        raise exception 'Remendo da 0081: não achei o begin de %', v_fn;
      end if;
      execute v_novo;
    end loop;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 6) Vitrine: catálogo de conta suspensa não responde
-- ------------------------------------------------------------
create or replace function formas_pagamento_catalogo(p_slug text)
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(c.formas_pagamento, '{}')
    from catalogos c
   where c.slug = p_slug and c.ativo and conta_ativa_de(c.user_id)
   limit 1;
$$;

create or replace function vitrine_tem_frete(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from catalogos c
      join frete_conexoes f on f.user_id = c.user_id
     where c.slug = p_slug and c.ativo and conta_ativa_de(c.user_id)
       and f.na_vitrine and f.token_cifrado is not null and f.cep_origem is not null
  );
$$;

create or replace function definir_pagamento_pedido_vitrine(p_slug text, p_idempotencia uuid, p_forma text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat record;
begin
  select id, formas_pagamento into v_cat from catalogos
   where slug = p_slug and ativo and conta_ativa_de(user_id) limit 1;
  if v_cat.id is null or not (trim(coalesce(p_forma, '')) = any(coalesce(v_cat.formas_pagamento, '{}'))) then
    return false;
  end if;
  update pedidos_vitrine
     set forma_pagamento = left(trim(p_forma), 40)
   where catalogo_id = v_cat.id
     and idempotencia = p_idempotencia
     and status = 'pendente'
     and criado_em > now() - interval '1 hour';
  return found;
end;
$$;

NOTIFY pgrst, 'reload schema';

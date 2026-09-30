-- ============================================================
-- 0036 — Teste grátis da IA do SISTEMA + teto de segurança da IA PRÓPRIA.
--
-- Regra:
--   • IA do sistema (a chave Gemini do dono do SERTÃO): cada conta ganha um teste — por
--     padrão 7 dias E 15 gerações no total (vale o que acabar primeiro). A janela de dias
--     começa no PRIMEIRO uso (`ia_teste_inicio` nulo até lá), então quem entra e só usa
--     semanas depois não perde o teste. A conta master é isenta.
--   • IA própria (a conta cadastrou a chave e paga o provedor): sem teste, só um teto de
--     segurança de 300 gerações/dia contra laço acidental.
--
-- O master ajusta dias e limite de cada conta (admin_definir_teste_ia) e pode reiniciar a
-- janela. `ia_limite_diario` (cota diária antiga) deixa de valer.
--
-- Compatibilidade: `ia_consumir(p_tipo)` e `ia_estornar()` continuam chamáveis sem argumento
-- (origem padrão = 'sistema'), então o código antigo ainda deployado não quebra.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table perfis_acesso
  add column if not exists ia_teste_inicio timestamptz,
  add column if not exists ia_teste_dias integer not null default 7,
  add column if not exists ia_teste_limite integer not null default 15;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_acesso_ia_teste_dias_check') then
    alter table perfis_acesso add constraint perfis_acesso_ia_teste_dias_check
      check (ia_teste_dias between 0 and 3650);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfis_acesso_ia_teste_limite_check') then
    alter table perfis_acesso add constraint perfis_acesso_ia_teste_limite_check
      check (ia_teste_limite between 0 and 100000);
  end if;
end $$;

alter table ia_uso
  add column if not exists geracoes_sistema integer not null default 0,
  add column if not exists geracoes_propria integer not null default 0;

-- ------------------------------------------------------------
-- ia_consumir — reserva uma vaga. Só no erro de cache.
-- ------------------------------------------------------------
drop function if exists ia_consumir(text);
create or replace function ia_consumir(p_tipo text, p_origem text default 'sistema')
returns table (usadas integer, limite integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_hoje           date := (now() at time zone 'America/Sao_Paulo')::date;
  v_perfil         perfis_acesso%rowtype;
  v_usadas         integer;
  v_total_sistema  integer;
  v_teto_propria   constant integer := 300;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre de novo para continuar.';
  end if;
  if not conta_ativa() then
    raise exception 'Sua conta não está ativa. Fale com o administrador.';
  end if;
  if p_tipo not in ('titulo', 'descricao', 'tema') then
    raise exception 'Tipo de geração inválido.';
  end if;
  if p_origem not in ('sistema', 'propria') then
    raise exception 'Origem de IA inválida.';
  end if;

  -- Trava a linha do perfil: duas gerações simultâneas da mesma conta se enfileiram aqui,
  -- então a última vaga do teste não passa para as duas.
  select * into v_perfil from perfis_acesso where user_id = v_uid for update;
  if not found then
    raise exception 'Conta sem perfil de acesso. Fale com o administrador.';
  end if;

  -- ---- IA própria: só o teto diário de segurança ----
  if p_origem = 'propria' then
    insert into ia_uso (user_id, dia, geracoes, geracoes_propria, titulos, descricoes, atualizado_em)
    values (
      v_uid, v_hoje, 1, 1,
      case when p_tipo = 'titulo' then 1 else 0 end,
      case when p_tipo = 'descricao' then 1 else 0 end,
      now()
    )
    on conflict (user_id, dia) do update
       set geracoes         = ia_uso.geracoes + 1,
           geracoes_propria = ia_uso.geracoes_propria + 1,
           titulos          = ia_uso.titulos + (case when p_tipo = 'titulo' then 1 else 0 end),
           descricoes       = ia_uso.descricoes + (case when p_tipo = 'descricao' then 1 else 0 end),
           atualizado_em    = now()
     where ia_uso.geracoes_propria < v_teto_propria
    returning ia_uso.geracoes_propria into v_usadas;

    if v_usadas is null then
      raise exception 'Você chegou ao limite de segurança de % gerações por dia com a sua IA. O contador volta amanhã.', v_teto_propria;
    end if;
    return query select v_usadas, v_teto_propria;
    return;
  end if;

  -- ---- IA do sistema: teste grátis (master é isento) ----
  if v_perfil.papel <> 'master' then
    if v_perfil.ia_teste_inicio is null then
      update perfis_acesso set ia_teste_inicio = now() where user_id = v_uid;
      v_perfil.ia_teste_inicio := now();
    end if;

    if now() >= v_perfil.ia_teste_inicio + make_interval(days => v_perfil.ia_teste_dias) then
      raise exception 'Seu teste grátis da IA do sistema (% dias) terminou. Cadastre a sua própria IA em Configurações → IA para continuar.', v_perfil.ia_teste_dias;
    end if;

    select coalesce(sum(u.geracoes_sistema), 0) into v_total_sistema from ia_uso u where u.user_id = v_uid;
    if v_total_sistema >= v_perfil.ia_teste_limite then
      raise exception 'Você usou as % gerações do teste grátis da IA do sistema. Cadastre a sua própria IA em Configurações → IA para continuar.', v_perfil.ia_teste_limite;
    end if;
  else
    select coalesce(sum(u.geracoes_sistema), 0) into v_total_sistema from ia_uso u where u.user_id = v_uid;
  end if;

  insert into ia_uso (user_id, dia, geracoes, geracoes_sistema, titulos, descricoes, atualizado_em)
  values (
    v_uid, v_hoje, 1, 1,
    case when p_tipo = 'titulo' then 1 else 0 end,
    case when p_tipo = 'descricao' then 1 else 0 end,
    now()
  )
  on conflict (user_id, dia) do update
     set geracoes         = ia_uso.geracoes + 1,
         geracoes_sistema = ia_uso.geracoes_sistema + 1,
         titulos          = ia_uso.titulos + (case when p_tipo = 'titulo' then 1 else 0 end),
         descricoes       = ia_uso.descricoes + (case when p_tipo = 'descricao' then 1 else 0 end),
         atualizado_em    = now();

  -- limite 0 = sem limite (master).
  return query select v_total_sistema + 1, (case when v_perfil.papel = 'master' then 0 else v_perfil.ia_teste_limite end);
end;
$$;

-- ------------------------------------------------------------
-- ia_estornar — devolve UMA geração (falha de infraestrutura). Nunca abaixo de zero.
-- ------------------------------------------------------------
drop function if exists ia_estornar();
create or replace function ia_estornar(p_origem text default 'sistema')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update ia_uso
     set geracoes = greatest(geracoes - 1, 0),
         geracoes_sistema = case when p_origem = 'sistema' then greatest(geracoes_sistema - 1, 0) else geracoes_sistema end,
         geracoes_propria = case when p_origem = 'propria' then greatest(geracoes_propria - 1, 0) else geracoes_propria end,
         atualizado_em = now()
   where user_id = auth.uid()
     and dia = (now() at time zone 'America/Sao_Paulo')::date;
end;
$$;

-- ------------------------------------------------------------
-- ia_estado_teste — o que a tela mostra ("restam 9 de 15 até 06/10").
-- ------------------------------------------------------------
drop function if exists ia_estado_teste();
create or replace function ia_estado_teste()
returns table (
  usadas     integer,
  limite     integer,
  dias       integer,
  inicio     timestamptz,
  expira_em  timestamptz,
  ilimitado  boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce((select sum(u.geracoes_sistema) from ia_uso u where u.user_id = p.user_id), 0)::integer,
    p.ia_teste_limite,
    p.ia_teste_dias,
    p.ia_teste_inicio,
    case when p.ia_teste_inicio is null then null
         else p.ia_teste_inicio + make_interval(days => p.ia_teste_dias) end,
    (p.papel = 'master')
  from perfis_acesso p
  where p.user_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- Master ajusta o teste de uma conta.
-- ------------------------------------------------------------
drop function if exists admin_definir_limite_ia(uuid, integer);

create or replace function admin_definir_teste_ia(
  p_user_id uuid,
  p_dias integer,
  p_limite integer,
  p_reiniciar boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
  v_alvo_email  text;
  v_dias_antes  integer;
  v_lim_antes   integer;
begin
  if not e_master() then
    raise exception 'Só a conta master pode alterar o teste de IA.';
  end if;
  if p_dias < 0 or p_dias > 3650 then
    raise exception 'Dias fora do intervalo permitido (0 a 3650).';
  end if;
  if p_limite < 0 or p_limite > 100000 then
    raise exception 'Limite fora do intervalo permitido (0 a 100000).';
  end if;

  select p.email, p.ia_teste_dias, p.ia_teste_limite into v_alvo_email, v_dias_antes, v_lim_antes
    from perfis_acesso p where p.user_id = p_user_id;
  if v_alvo_email is null then
    raise exception 'Conta não encontrada.';
  end if;

  update perfis_acesso
     set ia_teste_dias = p_dias,
         ia_teste_limite = p_limite,
         ia_teste_inicio = case when p_reiniciar then null else ia_teste_inicio end
   where user_id = p_user_id;

  -- Reiniciar zera também o consumo do sistema, senão o limite continuaria estourado.
  if p_reiniciar then
    update ia_uso set geracoes_sistema = 0 where user_id = p_user_id;
  end if;

  if v_dias_antes is distinct from p_dias or v_lim_antes is distinct from p_limite or p_reiniciar then
    select p.email into v_admin_email from perfis_acesso p where p.user_id = auth.uid();
    insert into historico_admin (admin_user_id, admin_email, alvo_user_id, alvo_email, acao, detalhes)
    values (auth.uid(), coalesce(v_admin_email, ''), p_user_id, v_alvo_email, 'limite_ia',
            jsonb_build_object('ia_teste', jsonb_build_object(
              'dias', jsonb_build_object('de', v_dias_antes, 'para', p_dias),
              'limite', jsonb_build_object('de', v_lim_antes, 'para', p_limite),
              'reiniciado', p_reiniciar
            )));
  end if;
end;
$$;

-- ------------------------------------------------------------
-- Consumo visto pelo master (a lista de colunas mudou: DROP obrigatório).
-- ------------------------------------------------------------
drop function if exists admin_uso_ia_conta(uuid);
create or replace function admin_uso_ia_conta(p_user_id uuid)
returns table (
  limite          integer,
  usadas_hoje     integer,
  cache_hoje      integer,
  usadas_30dias   bigint,
  cache_30dias    bigint,
  teste_usadas    bigint,
  teste_dias      integer,
  teste_expira_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not e_master() then
    raise exception 'Só a conta master pode ver o consumo de IA de uma conta.';
  end if;

  return query
  select
    coalesce((select p.ia_teste_limite from perfis_acesso p where p.user_id = p_user_id), 0),
    coalesce((select u.geracoes   from ia_uso u where u.user_id = p_user_id and u.dia = v_hoje), 0),
    coalesce((select u.cache_hits from ia_uso u where u.user_id = p_user_id and u.dia = v_hoje), 0),
    coalesce((select sum(u.geracoes)   from ia_uso u where u.user_id = p_user_id and u.dia > v_hoje - 30), 0),
    coalesce((select sum(u.cache_hits) from ia_uso u where u.user_id = p_user_id and u.dia > v_hoje - 30), 0),
    coalesce((select sum(u.geracoes_sistema) from ia_uso u where u.user_id = p_user_id), 0),
    coalesce((select p.ia_teste_dias from perfis_acesso p where p.user_id = p_user_id), 0),
    (select case when p.ia_teste_inicio is null then null
                 else p.ia_teste_inicio + make_interval(days => p.ia_teste_dias) end
       from perfis_acesso p where p.user_id = p_user_id);
end;
$$;

grant execute on function ia_consumir(text, text) to authenticated;
grant execute on function ia_estornar(text) to authenticated;
grant execute on function ia_estado_teste() to authenticated;
grant execute on function admin_definir_teste_ia(uuid, integer, integer, boolean) to authenticated;
grant execute on function admin_uso_ia_conta(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';

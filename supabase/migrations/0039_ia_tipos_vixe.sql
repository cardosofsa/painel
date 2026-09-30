-- ============================================================
-- 0039 — Novos tipos de geração por IA (Fase 7.6 e 7.7).
--
-- 'preco' (Vixe Preço) e, já prevendo a 7.7, 'resposta' (pergunta de cliente), 'cobranca'
-- (mensagem de fiado), 'legenda' (WhatsApp/Instagram) e 'atributos' (ficha técnica). Abrir
-- tudo agora evita uma migração por etapa. Nada mais muda: mesma cota, mesmo cache.
--
-- Idempotente: a constraint é recriada e as funções são CREATE OR REPLACE com a mesma
-- assinatura de antes.
-- ============================================================

alter table ia_sugestoes drop constraint if exists ia_sugestoes_tipo_check;
alter table ia_sugestoes add constraint ia_sugestoes_tipo_check check (tipo in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos'));

-- ia_buscar_sugestao: cópia da 0028; só muda a lista de tipos.
create or replace function ia_buscar_sugestao(p_tipo text, p_hash text)
returns table (texto text, palavras_chave text[], posicionamento text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre de novo para continuar.';
  end if;
  if not conta_ativa() then
    raise exception 'Sua conta não está ativa. Fale com o administrador.';
  end if;
  if p_tipo not in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos') then
    raise exception 'Tipo de geração inválido.';
  end if;

  return query
    select s.texto, s.palavras_chave, s.posicionamento
      from ia_sugestoes s
     where s.user_id = v_uid and s.tipo = p_tipo and s.contexto_hash = p_hash;

  if found then
    insert into ia_uso (user_id, dia, cache_hits, atualizado_em)
    values (v_uid, (now() at time zone 'America/Sao_Paulo')::date, 1, now())
    on conflict (user_id, dia) do update
       set cache_hits = ia_uso.cache_hits + 1, atualizado_em = now();
  end if;
end;
$$;

-- ia_consumir: cópia da 0036; só muda a lista de tipos.
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
  if p_tipo not in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos') then
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

-- ia_guardar_sugestao: cópia da 0037; só muda a lista de tipos.
create or replace function ia_guardar_sugestao(
  p_tipo text,
  p_hash text,
  p_texto text,
  p_palavras_chave text[],
  p_posicionamento text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not conta_ativa() then
    raise exception 'Sua sessão expirou. Entre de novo para continuar.';
  end if;
  if p_tipo not in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos') then
    raise exception 'Tipo de geração inválido.';
  end if;

  insert into ia_sugestoes (user_id, tipo, contexto_hash, texto, palavras_chave, posicionamento, criado_em)
  values (v_uid, p_tipo, p_hash, left(p_texto, 6000), coalesce(p_palavras_chave, '{}'), left(p_posicionamento, 500), now())
  on conflict (user_id, tipo, contexto_hash) do update
     set texto          = excluded.texto,
         palavras_chave = excluded.palavras_chave,
         posicionamento = excluded.posicionamento,
         criado_em      = now();

  if random() < 0.02 then
    delete from ia_sugestoes where user_id = v_uid and criado_em < now() - interval '60 days';
  end if;
end;
$$;

NOTIFY pgrst, 'reload schema';

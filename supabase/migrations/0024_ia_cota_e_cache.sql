-- ============================================================
-- Cota diária e cache das gerações por IA.
--
-- A chave do Gemini é UMA só, do sistema. Como o app é multi-conta, sem limite uma conta
-- sozinha torra a cota (e a fatura) de todo mundo. O limite precisa morar AQUI: contagem
-- feita só no Node é contornável, e dois cliques simultâneos não teriam quem arbitrasse.
--
-- Mesma disciplina de historico_admin (0023): tabela só com policy de SELECT, toda escrita
-- por RPC security definer. Assim o usuário lê o próprio consumo mas não zera o contador
-- nem planta sugestão pelo console do navegador.
--
-- Pré-requisito: 0020 (perfis_acesso, e_master), 0021 (conta_ativa), 0023 (historico_admin).
-- ============================================================

-- `to_regclass` só resolve RELAÇÃO — nunca função (erro cometido na 0023). Checagem de
-- função vai em pg_proc.
do $$
begin
  if to_regclass('public.perfis_acesso') is null then
    raise exception 'Aplique 0020_perfis_acesso_admin.sql antes desta.';
  end if;
  if to_regclass('public.historico_admin') is null then
    raise exception 'Aplique 0023_admin_historico_e_atividade.sql antes desta.';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'conta_ativa'
  ) then
    raise exception 'Aplique 0021_seguranca_acesso.sql antes desta (função conta_ativa ausente).';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'e_master'
  ) then
    raise exception 'Aplique 0020_perfis_acesso_admin.sql antes desta (função e_master ausente).';
  end if;
end $$;

-- ============================================================
-- 1) Cota por conta, ajustável pelo master.
--
-- Default conservador de propósito: é mais fácil o master soltar a cota de quem precisa
-- do que descobrir a fatura depois.
-- ============================================================

alter table perfis_acesso add column if not exists ia_limite_diario integer not null default 20;

-- ============================================================
-- 2) ia_uso — contador do dia.
--
-- A PK (user_id, dia) é a trava de concorrência: o ON CONFLICT trava a linha, então dois
-- cliques simultâneos não passam os dois pela última vaga.
--
-- `dia` no fuso de Brasília. Com `current_date` cru (UTC) a cota viraria às 21h — o
-- usuário perderia as gerações da noite achando que era bug.
-- ============================================================

create table if not exists ia_uso (
  user_id       uuid    not null references auth.users on delete cascade default auth.uid(),
  dia           date    not null default (now() at time zone 'America/Sao_Paulo')::date,
  geracoes      integer not null default 0,
  titulos       integer not null default 0,
  descricoes    integer not null default 0,
  cache_hits    integer not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, dia)
);

alter table ia_uso enable row level security;

-- Só SELECT. Escrita exclusivamente por ia_consumir / ia_registrar_cache / ia_estornar.
drop policy if exists "le_ia_uso" on ia_uso;
create policy "le_ia_uso" on ia_uso for select
  using (auth.uid() = user_id and conta_ativa());

create index if not exists ia_uso_dia_idx on ia_uso (dia desc);

-- ============================================================
-- 3) ia_sugestoes — cache por impressão digital do contexto.
--
-- O maior desperdício de IA não é volume, é repetição: reabrir o mesmo produto e clicar
-- gerar de novo pagaria duas vezes pela mesma pergunta. `contexto_hash` vem de
-- `hashContexto()` em lib/ia/prompts.ts e cobre TODO campo que muda a resposta.
-- ============================================================

create table if not exists ia_sugestoes (
  user_id        uuid not null references auth.users on delete cascade default auth.uid(),
  tipo           text not null check (tipo in ('titulo', 'descricao')),
  contexto_hash  text not null,
  texto          text not null,
  palavras_chave text[] not null default '{}',
  posicionamento text,
  criado_em      timestamptz not null default now(),
  primary key (user_id, tipo, contexto_hash)
);

alter table ia_sugestoes enable row level security;

-- Idem: só leitura do próprio dono. Plantar sugestão aqui seria plantar texto que o
-- usuário acharia que veio da IA.
drop policy if exists "le_ia_sugestoes" on ia_sugestoes;
create policy "le_ia_sugestoes" on ia_sugestoes for select
  using (auth.uid() = user_id and conta_ativa());

create index if not exists ia_sugestoes_criado_idx on ia_sugestoes (criado_em);

-- ============================================================
-- 4) ia_buscar_sugestao — autentica e tenta o cache.
--
-- É o PRIMEIRO passo do fluxo, antes de qualquer gasto: é aqui que conta suspensa é
-- barrada. Acerto de cache não consome cota, só incrementa o contador de acertos (que
-- serve para medir quanto do uso saiu de graça).
--
-- DROP explícito antes: `create or replace` não muda a lista de colunas de um RETURNS
-- TABLE (armadilha documentada no CLAUDE.md).
-- ============================================================

drop function if exists ia_buscar_sugestao(text, text);
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
  if p_tipo not in ('titulo', 'descricao') then
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

-- ============================================================
-- 5) ia_consumir — reserva uma vaga do dia. Só no erro de cache.
-- ============================================================

drop function if exists ia_consumir(text);
create or replace function ia_consumir(p_tipo text)
returns table (usadas integer, limite integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_limite integer;
  v_usadas integer;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre de novo para continuar.';
  end if;
  if not conta_ativa() then
    raise exception 'Sua conta não está ativa. Fale com o administrador.';
  end if;
  if p_tipo not in ('titulo', 'descricao') then
    raise exception 'Tipo de geração inválido.';
  end if;

  select p.ia_limite_diario into v_limite from perfis_acesso p where p.user_id = v_uid;
  if v_limite is null then
    raise exception 'Conta sem perfil de acesso. Fale com o administrador.';
  end if;

  -- Atômico: o WHERE do DO UPDATE é o que barra o estouro. Se não couber, nenhuma linha
  -- volta e v_usadas fica NULL. O insert inicial só passa se o limite for > 0.
  insert into ia_uso (user_id, dia, geracoes, titulos, descricoes, atualizado_em)
  select
    v_uid, v_hoje, 1,
    case when p_tipo = 'titulo' then 1 else 0 end,
    case when p_tipo = 'descricao' then 1 else 0 end,
    now()
  where v_limite > 0
  on conflict (user_id, dia) do update
     set geracoes      = ia_uso.geracoes + 1,
         titulos       = ia_uso.titulos + (case when p_tipo = 'titulo' then 1 else 0 end),
         descricoes    = ia_uso.descricoes + (case when p_tipo = 'descricao' then 1 else 0 end),
         atualizado_em = now()
   where ia_uso.geracoes < v_limite
  returning ia_uso.geracoes into v_usadas;

  if v_usadas is null then
    raise exception 'Você já usou as % gerações de IA de hoje. O limite volta amanhã.', v_limite;
  end if;

  return query select v_usadas, v_limite;
end;
$$;

-- ============================================================
-- 6) ia_guardar_sugestao — grava no cache depois da geração.
--
-- `on conflict do update`: o mesmo contexto pode ser regerado por "Gerar outro", e aí a
-- sugestão nova substitui a antiga — é a que o usuário acabou de ver.
-- ============================================================

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
  if p_tipo not in ('titulo', 'descricao') then
    raise exception 'Tipo de geração inválido.';
  end if;

  insert into ia_sugestoes (user_id, tipo, contexto_hash, texto, palavras_chave, posicionamento, criado_em)
  values (v_uid, p_tipo, p_hash, left(p_texto, 4000), coalesce(p_palavras_chave, '{}'), left(p_posicionamento, 500), now())
  on conflict (user_id, tipo, contexto_hash) do update
     set texto          = excluded.texto,
         palavras_chave = excluded.palavras_chave,
         posicionamento = excluded.posicionamento,
         criado_em      = now();

  -- Limpeza oportunista: o projeto não tem cron, então a poda pega carona numa escrita
  -- que já está acontecendo. `random()` para não pagar o delete em toda geração.
  if random() < 0.02 then
    delete from ia_sugestoes where user_id = v_uid and criado_em < now() - interval '60 days';
  end if;
end;
$$;

-- ============================================================
-- 7) ia_estornar — devolve UMA geração.
--
-- Só para falha de infraestrutura (chave recusada, 5xx, rede). Nunca abaixo de zero,
-- nunca de outro dia.
-- ============================================================

create or replace function ia_estornar()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update ia_uso
     set geracoes = greatest(geracoes - 1, 0),
         atualizado_em = now()
   where user_id = auth.uid()
     and dia = (now() at time zone 'America/Sao_Paulo')::date;
end;
$$;

-- ============================================================
-- 8) admin_definir_limite_ia — master ajusta a cota de uma conta.
-- ============================================================

create or replace function admin_definir_limite_ia(p_user_id uuid, p_limite integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
  v_alvo_email  text;
  v_antes       integer;
begin
  if not e_master() then
    raise exception 'Só a conta master pode alterar a cota de IA.';
  end if;
  if p_limite < 0 or p_limite > 1000 then
    raise exception 'Cota fora do intervalo permitido (0 a 1000).';
  end if;

  select p.email, p.ia_limite_diario into v_alvo_email, v_antes
    from perfis_acesso p where p.user_id = p_user_id;
  if v_alvo_email is null then
    raise exception 'Conta não encontrada.';
  end if;

  if v_antes is distinct from p_limite then
    update perfis_acesso set ia_limite_diario = p_limite where user_id = p_user_id;

    select p.email into v_admin_email from perfis_acesso p where p.user_id = auth.uid();
    insert into historico_admin (admin_user_id, admin_email, alvo_user_id, alvo_email, acao, detalhes)
    values (auth.uid(), coalesce(v_admin_email, ''), p_user_id, v_alvo_email, 'limite_ia',
            jsonb_build_object('ia_limite_diario', jsonb_build_object('de', v_antes, 'para', p_limite)));
  end if;
end;
$$;

grant execute on function ia_buscar_sugestao(text, text) to authenticated;
grant execute on function ia_consumir(text) to authenticated;
grant execute on function ia_guardar_sugestao(text, text, text, text[], text) to authenticated;
grant execute on function ia_estornar() to authenticated;
grant execute on function admin_definir_limite_ia(uuid, integer) to authenticated;

-- Sem isso o PostgREST não enxerga as funções novas e toda chamada volta PGRST202.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Conferência (as duas precisam voltar linha):
--
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and proname like 'ia_%';
--
--   select column_name from information_schema.columns
--    where table_name = 'perfis_acesso' and column_name = 'ia_limite_diario';
-- ============================================================

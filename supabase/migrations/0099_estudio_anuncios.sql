-- ============================================================
-- 0099 — Estúdio de anúncios: rascunhos, conversa com o assistente e tipos de IA novos.
--
-- Por quê: o estúdio (Produtos › Estúdio de anúncios) monta um anúncio por conversa: título,
-- capa, pesquisa de concorrentes e número de imagens. O estado do trabalho precisa sobreviver a
-- recarregar a página e a trocar de aparelho, e a conversa vira histórico.
--
--   anuncio_rascunhos          um rascunho por produto (e perfil de marca, opcional): título e
--                              descrição escolhidos, e `estado` (jsonb) com as variantes de título,
--                              os caminhos das capas, o número de imagens e os concorrentes.
--   anuncio_rascunho_mensagens a conversa com o assistente, com as ações que ele propôs.
--
-- Nada é publicado aqui: o rascunho é só do Painel. A criação do anúncio na Shopee é outra fase.
--
-- IA: os tipos 'concorrentes' (pesquisa na web) e 'assistente' (a conversa) passam a ser aceitos
-- pelas RPCs `ia_*`, com o mesmo cache e a mesma cota dos outros tipos. As três funções são
-- cópias das da 0097, só com os tipos a mais; assinatura e retorno não mudam, então
-- CREATE OR REPLACE basta. A geração de imagem NÃO muda: usa o tipo 'livre' que já existe.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists anuncio_rascunhos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  produto_id    uuid not null references produtos(id) on delete cascade,
  perfil_id     uuid references perfis_marca(id) on delete set null,
  titulo        text check (titulo is null or length(titulo) <= 200),
  descricao     text check (descricao is null or length(descricao) <= 5000),
  estado        jsonb not null default '{}'::jsonb check (jsonb_typeof(estado) = 'object' and length(estado::text) <= 60000),
  status        text not null default 'rascunho' check (status in ('rascunho', 'pronto', 'publicado')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists anuncio_rascunhos_user_idx on anuncio_rascunhos (user_id, atualizado_em desc);
create index if not exists anuncio_rascunhos_produto_idx on anuncio_rascunhos (produto_id);

alter table anuncio_rascunhos enable row level security;
drop policy if exists "dono_anuncio_rascunhos" on anuncio_rascunhos;
create policy "dono_anuncio_rascunhos" on anuncio_rascunhos for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_rascunho_produto on anuncio_rascunhos;
create trigger trg_valida_vinculo_rascunho_produto
before insert or update of produto_id on anuncio_rascunhos
for each row execute function validar_vinculo_do_dono('produto_id', 'produtos');

drop trigger if exists trg_valida_vinculo_rascunho_perfil on anuncio_rascunhos;
create trigger trg_valida_vinculo_rascunho_perfil
before insert or update of perfil_id on anuncio_rascunhos
for each row execute function validar_vinculo_do_dono('perfil_id', 'perfis_marca');

create table if not exists anuncio_rascunho_mensagens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  rascunho_id uuid not null references anuncio_rascunhos(id) on delete cascade,
  papel       text not null check (papel in ('usuario', 'ia')),
  texto       text not null check (length(btrim(texto)) between 1 and 4000),
  acoes       jsonb not null default '[]'::jsonb check (jsonb_typeof(acoes) = 'array' and length(acoes::text) <= 8000),
  criado_em   timestamptz not null default now()
);
create index if not exists anuncio_rascunho_mensagens_idx on anuncio_rascunho_mensagens (rascunho_id, criado_em);

alter table anuncio_rascunho_mensagens enable row level security;
drop policy if exists "dono_anuncio_rascunho_mensagens" on anuncio_rascunho_mensagens;
create policy "dono_anuncio_rascunho_mensagens" on anuncio_rascunho_mensagens for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_mensagem_rascunho on anuncio_rascunho_mensagens;
create trigger trg_valida_vinculo_mensagem_rascunho
before insert or update of rascunho_id on anuncio_rascunho_mensagens
for each row execute function validar_vinculo_do_dono('rascunho_id', 'anuncio_rascunhos');

-- IA: tipos 'concorrentes' e 'assistente'
alter table ia_sugestoes drop constraint if exists ia_sugestoes_tipo_check;
alter table ia_sugestoes add constraint ia_sugestoes_tipo_check check (tipo in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos', 'relatorio', 'consultor', 'concorrentes', 'assistente'));

-- ia_buscar_sugestao: cópia da 0097; só acrescenta 'concorrentes' e 'assistente' à lista de tipos.
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
  if p_tipo not in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos', 'relatorio', 'consultor', 'concorrentes', 'assistente') then
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

-- ia_consumir: cópia da 0097; só acrescenta 'concorrentes' e 'assistente' à lista de tipos.
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
  if p_tipo not in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos', 'relatorio', 'consultor', 'concorrentes', 'assistente') then
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

-- ia_guardar_sugestao: cópia da 0097; só acrescenta 'concorrentes' e 'assistente' à lista de tipos.
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
  if p_tipo not in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos', 'relatorio', 'consultor', 'concorrentes', 'assistente') then
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

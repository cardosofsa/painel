-- ============================================================
-- 0028 — Aparência da vitrine + terceiro tipo de geração por IA ("tema")
--
-- Duas coisas nesta migração, uma dependendo da outra:
--
--   1. `ia_sugestoes.tipo` estava travado em `check (tipo in ('titulo', 'descricao'))`,
--      repetido dentro de `ia_buscar_sugestao`, `ia_consumir` e `ia_guardar_sugestao`
--      (0024). Gerar tema sem esta migração falha no banco com "Tipo de geração inválido."
--      O tema é guardado como JSON serializado dentro da coluna `texto` — a mesma tabela
--      serve, sem coluna nova, porque `palavras_chave`/`posicionamento` simplesmente ficam
--      vazios para esse tipo.
--
--   2. `catalogo_aparencia`, 1:1 com `catalogos`. Fica em tabela própria, e NÃO em colunas
--      de `catalogos`, porque `obter_catalogo_publico` repete as colunas do catálogo em
--      CADA linha de produto (até 500 por chamada) — 7 campos de tema ali multiplicariam o
--      payload por 500. Em vez disso, `obter_aparencia_catalogo` é uma segunda RPC pública,
--      leve, que devolve uma linha só.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'ia_consumir'
  ) then
    raise exception 'Aplique 0024_ia_cota_e_cache.sql antes desta.';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'conta_ativa_de'
  ) then
    raise exception 'Aplique 0026_endurecimento_storage_vitrine_fks.sql antes desta.';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'validar_vinculo_do_dono'
  ) then
    raise exception 'Aplique 0026_endurecimento_storage_vitrine_fks.sql antes desta (trigger de FK ausente).';
  end if;
end $$;

-- ============================================================
-- 1) Libera 'tema' como tipo de geração.
-- ============================================================

do $$
declare
  v_nome text;
begin
  select conname into v_nome
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
   where t.relname = 'ia_sugestoes' and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%tipo%';
  if v_nome is not null then
    execute format('alter table ia_sugestoes drop constraint %I', v_nome);
  end if;
end $$;

alter table ia_sugestoes add constraint ia_sugestoes_tipo_check check (tipo in ('titulo', 'descricao', 'tema'));

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
  if p_tipo not in ('titulo', 'descricao', 'tema') then
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
  if p_tipo not in ('titulo', 'descricao', 'tema') then
    raise exception 'Tipo de geração inválido.';
  end if;

  select p.ia_limite_diario into v_limite from perfis_acesso p where p.user_id = v_uid;
  if v_limite is null then
    raise exception 'Conta sem perfil de acesso. Fale com o administrador.';
  end if;

  -- 'tema' conta em `geracoes` (a cota geral), sem coluna contadora própria — colunas
  -- fixas `titulos`/`descricoes` continuam servindo só a esses dois tipos.
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
  if p_tipo not in ('titulo', 'descricao', 'tema') then
    raise exception 'Tipo de geração inválido.';
  end if;

  insert into ia_sugestoes (user_id, tipo, contexto_hash, texto, palavras_chave, posicionamento, criado_em)
  values (v_uid, p_tipo, p_hash, left(p_texto, 4000), coalesce(p_palavras_chave, '{}'), left(p_posicionamento, 500), now())
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

-- ============================================================
-- 2) catalogo_aparencia.
--
-- Cor validada por regex hex, mesmo padrão de `canais.cor` (0004) — hex de 6 dígitos é o
-- que torna seguro aplicar o valor direto em `style={{ }}` no servidor, sem sanitizar HTML.
-- `fonte` é enum fechado porque a CSP não permite fonte de fora do build (font-src 'self').
-- ============================================================

create table if not exists catalogo_aparencia (
  catalogo_id           uuid primary key references catalogos(id) on delete cascade,
  user_id               uuid not null references auth.users on delete cascade,
  cor_primaria          text not null default '#3b4d1f' check (cor_primaria ~ '^#[0-9a-fA-F]{6}$'),
  cor_fundo             text not null default '#fafafa' check (cor_fundo ~ '^#[0-9a-fA-F]{6}$'),
  cor_superficie        text not null default '#ffffff' check (cor_superficie ~ '^#[0-9a-fA-F]{6}$'),
  cor_texto             text not null default '#18181b' check (cor_texto ~ '^#[0-9a-fA-F]{6}$'),
  fonte                 text not null default 'geist' check (fonte in ('geist', 'inter', 'lora', 'poppins')),
  logo_url              text,
  titulo                text check (titulo is null or length(titulo) <= 60),
  mensagem_boas_vindas  text check (mensagem_boas_vindas is null or length(mensagem_boas_vindas) <= 160),
  atualizado_em         timestamptz not null default now()
);

create index if not exists catalogo_aparencia_user_idx on catalogo_aparencia (user_id);

alter table catalogo_aparencia enable row level security;

drop policy if exists own_rows_catalogo_aparencia on catalogo_aparencia;
create policy own_rows_catalogo_aparencia on catalogo_aparencia
  for all to authenticated
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

-- Reusa o trigger genérico da 0026: sem isso, `with check (auth.uid() = user_id)` só
-- confere QUEM está escrevendo, não que `catalogo_id` aponte para um catálogo do próprio
-- escritor — o mesmo furo de FK cruzada que a 0026 fechou para outras 15 colunas.
drop trigger if exists trg_valida_vinculo_catalogo_aparencia on catalogo_aparencia;
create trigger trg_valida_vinculo_catalogo_aparencia
before insert or update of catalogo_id on catalogo_aparencia
for each row execute function validar_vinculo_do_dono('catalogo_id', 'catalogos');

-- ============================================================
-- 3) obter_aparencia_catalogo — segunda RPC pública, leve.
--
-- Mesmas duas condições de `obter_catalogo_publico` (0026): catálogo ativo e dono com
-- conta ativa. Sem linha de aparência cadastrada, devolve 0 linhas — a vitrine aplica os
-- tokens padrão do sistema, sem tratar isso como erro.
-- ============================================================

create or replace function obter_aparencia_catalogo(p_slug text)
returns table (
  cor_primaria text,
  cor_fundo text,
  cor_superficie text,
  cor_texto text,
  fonte text,
  logo_url text,
  titulo text,
  mensagem_boas_vindas text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogo record;
begin
  select id, user_id into v_catalogo from catalogos where slug = p_slug and ativo = true;

  if not found or not conta_ativa_de(v_catalogo.user_id) then
    return;
  end if;

  return query
    select a.cor_primaria, a.cor_fundo, a.cor_superficie, a.cor_texto, a.fonte, a.logo_url, a.titulo, a.mensagem_boas_vindas
      from catalogo_aparencia a
     where a.catalogo_id = v_catalogo.id;
end;
$$;

revoke execute on function obter_aparencia_catalogo(text) from public;
grant execute on function obter_aparencia_catalogo(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';

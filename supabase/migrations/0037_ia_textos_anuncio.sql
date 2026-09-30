-- ============================================================
-- 0037 — Textos de anúncio melhores (Fase 7.4).
--
-- 1) Limite de título e descrição por canal, editável: as plataformas mudam as regras.
-- 2) Descrição do anúncio na precificação individual e no anúncio com variações.
-- 3) Palavras-chave guardadas no produto, para reaproveitar no próximo título.
--
-- Tudo aditivo e idempotente: rodar duas vezes não muda nada.
-- ============================================================

-- 1) Limites por canal. null = sem limite próprio (vale o teto do sistema).
alter table canais
  add column if not exists limite_titulo integer,
  add column if not exists limite_descricao integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'canais_limite_titulo_check') then
    alter table canais add constraint canais_limite_titulo_check
      check (limite_titulo is null or limite_titulo between 20 and 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'canais_limite_descricao_check') then
    alter table canais add constraint canais_limite_descricao_check
      check (limite_descricao is null or limite_descricao between 100 and 10000);
  end if;
end $$;

-- Padrões conhecidos em set/2026, só onde ainda não há valor (não sobrescreve ajuste do dono).
update canais set limite_titulo = 100 where limite_titulo is null and lower(nome) = 'shopee';
update canais set limite_descricao = 5000 where limite_descricao is null and lower(nome) = 'shopee';
update canais set limite_titulo = 60 where limite_titulo is null and lower(nome) = 'mercado livre';
update canais set limite_descricao = 10000 where limite_descricao is null and lower(nome) = 'mercado livre';

-- 2) Descrição do anúncio.
alter table precificacoes add column if not exists descricao_anuncio text;
alter table anuncios add column if not exists descricao text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'precificacoes_descricao_anuncio_check') then
    alter table precificacoes add constraint precificacoes_descricao_anuncio_check
      check (descricao_anuncio is null or char_length(descricao_anuncio) <= 5000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'anuncios_descricao_check') then
    alter table anuncios add constraint anuncios_descricao_check
      check (descricao is null or char_length(descricao) <= 5000);
  end if;
end $$;

-- 3) Palavras-chave do produto.
alter table produtos add column if not exists palavras_chave text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_palavras_chave_check') then
    alter table produtos add constraint produtos_palavras_chave_check
      check (palavras_chave is null or cardinality(palavras_chave) <= 20);
  end if;
end $$;

-- 4) Cache de sugestões: a descrição do anúncio vai até 5000 caracteres, e o corte antigo
--    (4000) truncava. Mesma assinatura da 0028; só muda o `left(p_texto, …)`.
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

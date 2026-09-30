-- ============================================================
-- 0040 — Seções da vitrine montadas pela Vixe (Fase 7.9).
--
-- `secoes` guarda CONFIGURAÇÃO (textos curtos por seção), nunca HTML: a vitrine renderiza
-- com componentes fixos e trata tudo como texto. O app valida o formato (zod) antes de
-- gravar e de novo ao ler; aqui o banco só garante que é um objeto de tamanho razoável.
--
-- `obter_aparencia_catalogo` ganha a coluna `secoes`. Mudar o RETURNS TABLE exige DROP
-- antes do CREATE (CREATE OR REPLACE não troca o tipo de retorno).
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table catalogo_aparencia add column if not exists secoes jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalogo_aparencia_secoes_check') then
    alter table catalogo_aparencia add constraint catalogo_aparencia_secoes_check
      check (secoes is null or (jsonb_typeof(secoes) = 'object' and pg_column_size(secoes) <= 8192));
  end if;
end $$;

drop function if exists obter_aparencia_catalogo(text);

create function obter_aparencia_catalogo(p_slug text)
returns table (
  cor_primaria text,
  cor_fundo text,
  cor_superficie text,
  cor_texto text,
  fonte text,
  logo_url text,
  titulo text,
  mensagem_boas_vindas text,
  secoes jsonb
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
    select a.cor_primaria, a.cor_fundo, a.cor_superficie, a.cor_texto, a.fonte, a.logo_url, a.titulo, a.mensagem_boas_vindas, a.secoes
      from catalogo_aparencia a
     where a.catalogo_id = v_catalogo.id;
end;
$$;

revoke execute on function obter_aparencia_catalogo(text) from public;
grant execute on function obter_aparencia_catalogo(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';

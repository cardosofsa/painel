-- ============================================================
-- 0103 — Termos do perfil de marca: presets ligados e termos que BLOQUEIAM.
--
-- Por quê: a conferência de termos (lib/conformidade/termos.ts) nunca bloqueava nada que fosse
-- do usuário — todo termo dele era só "revisar" — e os presets de nicho (ex.: alegações de
-- saúde) existiam no código mas sempre chegavam vazios, porque não havia onde guardar quais
-- estão ligados. Agora, por perfil:
--
--   presets              ids dos conjuntos opcionais ligados ("saude"...). O que cada id
--                        significa mora no código; aqui só a lista de ids.
--   presets_gravidade    se os termos dos presets ligados só pedem revisão ou bloqueiam.
--   termos_bloqueados    termos do usuário que BLOQUEIAM (título com eles não vai para a
--                        Shopee nem para o rascunho). `termos_proibidos` continua existindo e
--                        passa a significar "revisar".
--
-- O código no ar continua funcionando antes e depois: só acrescenta colunas com padrão vazio.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table perfis_marca add column if not exists presets text[] not null default '{}';
alter table perfis_marca add column if not exists presets_gravidade text not null default 'revisar';
alter table perfis_marca add column if not exists termos_bloqueados text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_marca_presets_check') then
    -- Até 20 ids curtos, só letras minúsculas, números, _ e - (sem nulos).
    alter table perfis_marca add constraint perfis_marca_presets_check
      check (cardinality(presets) <= 20 and array_position(presets, null) is null and array_to_string(presets, ',') ~ '^[a-z0-9_,-]*$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfis_marca_presets_gravidade_check') then
    alter table perfis_marca add constraint perfis_marca_presets_gravidade_check
      check (presets_gravidade in ('revisar', 'bloquear'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfis_marca_termos_bloqueados_check') then
    alter table perfis_marca add constraint perfis_marca_termos_bloqueados_check
      check (cardinality(termos_bloqueados) <= 100 and array_position(termos_bloqueados, null) is null and length(array_to_string(termos_bloqueados, '|')) <= 6500);
  end if;
end $$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Rastrear a origem de cada precificação salva (Individual vs Em Massa),
-- pra cada aba mostrar sua própria lista de "salvos recentes" sem misturar.
-- ============================================================

alter table precificacoes
  add column if not exists origem text not null default 'individual' check (origem in ('individual', 'em_massa'));

NOTIFY pgrst, 'reload schema';

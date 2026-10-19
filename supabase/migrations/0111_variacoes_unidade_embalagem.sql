-- ============================================================
-- 0111 — Variações: unidade de medida, quantidade fracionada, embalagem e insumos.
--
-- Por quê: na Precificação › Variações o custo base era sempre "por unidade" e a quantidade
-- de cada variação era um inteiro (Unidade, Kit 2, Kit 3). Produto vendido a granel (kg,
-- litro) ou por caixa não cabia: "500 g" de um produto de R$ 40/kg era impossível de
-- montar, e o custo da embalagem e dos insumos de cada variação (pote, saco, etiqueta) não
-- tinha onde entrar. Agora, em `anuncio_variacoes`:
--
--   multiplicador     integer → numeric(12,3): a quantidade na unidade do custo base
--                     (0,5 = meio kg). Inteiros existentes viram o mesmo número.
--   unidade           'un' | 'cx' | 'kg' | 'l': a unidade a que o custo base se refere.
--   custo_embalagem   R$ por variação (não multiplica pela quantidade).
--   custo_insumos     R$ por variação (etiqueta, fita, brinde…).
--
-- `custo` continua sendo o custo TOTAL da variação (produto + embalagem + insumos), como
-- antes: quem lê `custo` (criar produtos a partir das variações, exportação) não muda.
-- RLS: a policy da 0004/0021 vale para as colunas novas; nada muda nela.
-- O código no ar continua funcionando antes e depois: colunas novas com default, e o
-- inteiro que ele grava cabe no numeric. Idempotente. Termina com NOTIFY.
-- ============================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'anuncio_variacoes' and column_name = 'multiplicador' and data_type = 'integer'
  ) then
    alter table anuncio_variacoes alter column multiplicador type numeric(12,3) using multiplicador::numeric(12,3);
  end if;
end $$;

alter table anuncio_variacoes add column if not exists unidade text not null default 'un';
alter table anuncio_variacoes add column if not exists custo_embalagem numeric(12,2) not null default 0;
alter table anuncio_variacoes add column if not exists custo_insumos numeric(12,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'anuncio_variacoes_unidade_check') then
    alter table anuncio_variacoes add constraint anuncio_variacoes_unidade_check check (unidade in ('un', 'cx', 'kg', 'l'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'anuncio_variacoes_extras_check') then
    alter table anuncio_variacoes add constraint anuncio_variacoes_extras_check
      check (custo_embalagem >= 0 and custo_insumos >= 0 and multiplicador >= 0);
  end if;
end $$;

NOTIFY pgrst, 'reload schema';

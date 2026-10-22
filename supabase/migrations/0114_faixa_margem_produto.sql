-- ============================================================
-- 0114 — Faixa de margem por produto (pai e variação).
--
-- Por quê: o dono vende o mesmo produto em vários anúncios da mesma loja e quer preços
-- diferentes entre eles, sempre dentro de uma faixa de margem que ele define no produto
-- (ex.: 20% a 30%). A aba "Faixas de margem" da Precificação grava aqui; o preço mínimo e o
-- máximo de cada loja saem da faixa com as taxas daquela loja (não são gravados).
--
--   produtos.margem_minima / margem_maxima   frações (0,20 = 20%), anuláveis.
--
-- Nada existente muda; o código no ar continua funcionando antes e depois.
-- RLS: a policy de `produtos` já cobre as colunas novas.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table produtos add column if not exists margem_minima numeric(5,4);
alter table produtos add column if not exists margem_maxima numeric(5,4);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_faixa_margem_check') then
    alter table produtos add constraint produtos_faixa_margem_check
      check ((margem_minima is null or (margem_minima >= 0 and margem_minima < 0.9))
             and (margem_maxima is null or (margem_maxima >= 0 and margem_maxima < 0.9))
             and (margem_minima is null or margem_maxima is null or margem_minima <= margem_maxima));
  end if;
end $$;

NOTIFY pgrst, 'reload schema';

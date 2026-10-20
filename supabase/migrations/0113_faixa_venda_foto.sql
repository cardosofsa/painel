-- ============================================================
-- 0113 — Faixa de venda (preço mínimo e máximo) e foto do anúncio com variações.
--
-- Por quê: na Precificação o vendedor define o menor e o maior preço que aceita vender
-- (para negociar sem perder dinheiro). Na Individual isso ficava só na tela; agora Kits e
-- Variações também têm a faixa, e ela é gravada junto com a precificação salva:
--
--   precificacoes.preco_minimo / preco_maximo       Individual e Kits.
--   anuncio_variacoes.preco_minimo / preco_maximo   cada variação tem a sua faixa.
--   anuncios.imagem_url                             foto do anúncio com variações (ex.: item
--                                                    puxado de "Custo", que não tem foto de
--                                                    produto), usada na imagem compartilhada.
--
-- Tudo anulável: o código no ar continua funcionando antes e depois. Nada existente muda.
-- RLS: as policies de precificacoes, anuncios e anuncio_variacoes já cobrem as colunas novas.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table precificacoes add column if not exists preco_minimo numeric(12,2);
alter table precificacoes add column if not exists preco_maximo numeric(12,2);
alter table anuncio_variacoes add column if not exists preco_minimo numeric(12,2);
alter table anuncio_variacoes add column if not exists preco_maximo numeric(12,2);
alter table anuncios add column if not exists imagem_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'precificacoes_faixa_venda_check') then
    alter table precificacoes add constraint precificacoes_faixa_venda_check
      check ((preco_minimo is null or preco_minimo >= 0) and (preco_maximo is null or preco_maximo >= 0)
             and (preco_minimo is null or preco_maximo is null or preco_minimo <= preco_maximo));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'anuncio_variacoes_faixa_venda_check') then
    alter table anuncio_variacoes add constraint anuncio_variacoes_faixa_venda_check
      check ((preco_minimo is null or preco_minimo >= 0) and (preco_maximo is null or preco_maximo >= 0)
             and (preco_minimo is null or preco_maximo is null or preco_minimo <= preco_maximo));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'anuncios_imagem_url_tamanho') then
    alter table anuncios add constraint anuncios_imagem_url_tamanho check (imagem_url is null or length(imagem_url) <= 1000);
  end if;
end $$;

NOTIFY pgrst, 'reload schema';

-- 0045 — Precificação: anúncio pago (ROAS), estratégia da Vixe e imagem própria.
--
-- anuncio     {tipo: 'percentual'|'valor', valor, margem_alvo_pct} — o investimento por venda
--             que o dono informou ao precificar.
-- estrategia  a resposta da Vixe salva junto (diagnóstico, estratégias, preço sugerido).
-- imagem_url  foto enviada na própria precificação (sem produto vinculado, ou para trocar
--             a do produto na imagem compartilhada).
--
-- Idempotente: pode rodar mais de uma vez.

alter table precificacoes add column if not exists anuncio jsonb;
alter table precificacoes add column if not exists estrategia jsonb;
alter table precificacoes add column if not exists imagem_url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'precificacoes_imagem_url_tamanho') then
    alter table precificacoes add constraint precificacoes_imagem_url_tamanho check (imagem_url is null or length(imagem_url) <= 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'precificacoes_anuncio_objeto') then
    alter table precificacoes add constraint precificacoes_anuncio_objeto check (anuncio is null or jsonb_typeof(anuncio) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'precificacoes_estrategia_objeto') then
    alter table precificacoes add constraint precificacoes_estrategia_objeto check (estrategia is null or jsonb_typeof(estrategia) = 'object');
  end if;
end $$;

NOTIFY pgrst, 'reload schema';

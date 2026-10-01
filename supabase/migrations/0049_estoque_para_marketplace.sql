-- ============================================================
-- 0049 — Estoque do SERTÃO enviado para os anúncios da Shopee (Fase 9.7).
--
-- * marketplace_anuncios: cada anúncio (item_id + model_id da variação; 0 sem variação)
--   de cada loja conectada, casado com um produto pelo SKU ou pelo vínculo manual.
--   `pendente` = o saldo do produto mudou e ainda não foi enviado.
-- * marketplace_conexoes.estoque_auto / estoque_confirmado_em: o envio automático só
--   acontece depois que o dono conferiu a prévia "SERTÃO × Shopee" e ativou, por loja.
-- * Gatilhos: mudou `produtos.estoque` ou o saldo de um armazém → anúncios do produto
--   ficam pendentes. O envio em si é do servidor (cron de 15 min, Sincronizar, PDV).
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists marketplace_anuncios (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade default auth.uid(),
  loja_id        uuid not null references lojas_canal(id) on delete cascade,
  item_id        bigint not null,
  model_id       bigint not null default 0,
  sku            text,
  nome           text,
  produto_id     uuid references produtos(id) on delete set null,
  estoque_shopee integer,
  estoque_enviado integer,
  pendente       boolean not null default true,
  enviado_em     timestamptz,
  ultimo_erro    text,
  atualizado_em  timestamptz not null default now(),
  unique (loja_id, item_id, model_id)
);
create index if not exists marketplace_anuncios_produto_idx on marketplace_anuncios (produto_id) where produto_id is not null;
create index if not exists marketplace_anuncios_pendente_idx on marketplace_anuncios (loja_id) where pendente;

alter table marketplace_anuncios enable row level security;
drop policy if exists "dono_marketplace_anuncios" on marketplace_anuncios;
create policy "dono_marketplace_anuncios" on marketplace_anuncios for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_anuncio_loja on marketplace_anuncios;
create trigger trg_valida_vinculo_anuncio_loja
before insert or update of loja_id on marketplace_anuncios
for each row execute function validar_vinculo_do_dono('loja_id', 'lojas_canal');

drop trigger if exists trg_valida_vinculo_anuncio_produto on marketplace_anuncios;
create trigger trg_valida_vinculo_anuncio_produto
before insert or update of produto_id on marketplace_anuncios
for each row execute function validar_vinculo_do_dono('produto_id', 'produtos');

alter table marketplace_conexoes add column if not exists estoque_auto boolean not null default false;
alter table marketplace_conexoes add column if not exists estoque_confirmado_em timestamptz;
alter table marketplace_conexoes add column if not exists anuncios_atualizados_em timestamptz;

-- Saldo mudou → anúncios do produto pendentes. `security definer`: a baixa pode vir de uma
-- RPC (venda, recebimento, importação) e o anúncio é marcado independentemente de quem mexeu.
create or replace function marcar_anuncios_pendentes_produto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estoque is distinct from old.estoque then
    update marketplace_anuncios set pendente = true, atualizado_em = now() where produto_id = new.id and not pendente;
  end if;
  return new;
end;
$$;

create or replace function marcar_anuncios_pendentes_armazem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update marketplace_anuncios set pendente = true, atualizado_em = now() where produto_id = new.produto_id and not pendente;
  return new;
end;
$$;

drop trigger if exists trg_anuncios_pendentes_produto on produtos;
create trigger trg_anuncios_pendentes_produto
after update of estoque on produtos
for each row execute function marcar_anuncios_pendentes_produto();

drop trigger if exists trg_anuncios_pendentes_armazem on estoque_armazem;
create trigger trg_anuncios_pendentes_armazem
after insert or update of quantidade on estoque_armazem
for each row execute function marcar_anuncios_pendentes_armazem();

NOTIFY pgrst, 'reload schema';

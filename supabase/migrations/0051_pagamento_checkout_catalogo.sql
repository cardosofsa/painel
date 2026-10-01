-- ============================================================
-- 0051 — Forma de pagamento no checkout do catálogo (Fase 9.10).
--
-- * catalogos.formas_pagamento: o que o catálogo aceita (Pix, Cartão, Dinheiro...).
--   Vazio = o checkout não pergunta (como antes).
-- * pedidos_vitrine.forma_pagamento: a escolha do comprador; vai na mensagem do WhatsApp
--   e já vem marcada ao aprovar o pedido em Vendas.
-- * formas_pagamento_catalogo(slug): pública (anon) — a vitrine mostra as opções.
-- * definir_pagamento_pedido_vitrine(slug, idempotencia, forma): pública — grava a escolha
--   no pedido recém-criado. Só quem tem a chave de idempotência DAQUELE checkout (gerada no
--   navegador do comprador) consegue, só na primeira hora e só com forma aceita.
--   (Assim `criar_pedido_vitrine`, grande e com todas as travas, não precisa mudar.)
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table catalogos add column if not exists formas_pagamento text[] not null default '{}';
alter table pedidos_vitrine add column if not exists forma_pagamento text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'catalogos_formas_pagamento_limite') then
    alter table catalogos add constraint catalogos_formas_pagamento_limite check (cardinality(formas_pagamento) <= 8);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_vitrine_forma_pagamento_tamanho') then
    alter table pedidos_vitrine add constraint pedidos_vitrine_forma_pagamento_tamanho check (forma_pagamento is null or length(forma_pagamento) <= 40);
  end if;
end $$;

create or replace function formas_pagamento_catalogo(p_slug text)
returns text[]
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(c.formas_pagamento, '{}')
    from catalogos c
   where c.slug = p_slug and c.ativo
   limit 1;
$$;

revoke execute on function formas_pagamento_catalogo(text) from public;
grant execute on function formas_pagamento_catalogo(text) to anon, authenticated;

create or replace function definir_pagamento_pedido_vitrine(p_slug text, p_idempotencia uuid, p_forma text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat record;
begin
  select id, formas_pagamento into v_cat from catalogos where slug = p_slug and ativo limit 1;
  if v_cat.id is null or not (trim(coalesce(p_forma, '')) = any(coalesce(v_cat.formas_pagamento, '{}'))) then
    return false;
  end if;
  update pedidos_vitrine
     set forma_pagamento = left(trim(p_forma), 40)
   where catalogo_id = v_cat.id
     and idempotencia = p_idempotencia
     and status = 'pendente'
     and criado_em > now() - interval '1 hour';
  return found;
end;
$$;

revoke execute on function definir_pagamento_pedido_vitrine(text, uuid, text) from public;
grant execute on function definir_pagamento_pedido_vitrine(text, uuid, text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';

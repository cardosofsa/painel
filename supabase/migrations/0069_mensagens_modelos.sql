-- ============================================================
-- 0069 — Vixe → Mensagens: modelos próprios, histórico e recompra.
--
-- 1) `mensagens_modelos`: o texto de cada tipo de aviso escrito pela conta, com variáveis
--    ({cliente}, {valor}, {vencimento}, {pix}, {loja}…). Sem linha, vale o texto padrão
--    do sistema (`lib/vixe/modelos.ts`). Uma linha por (conta, assunto).
-- 2) `mensagens_enviadas` ganha os detalhes do que foi enviado (assunto, cliente,
--    referência, WhatsApp e o texto), para a aba "Enviadas" mostrar e reenviar. As colunas
--    são opcionais: linhas antigas (0061) ficam só com a chave.
-- 3) `historico_compras_clientes()`: compras, primeira e última data de cada cliente, para
--    saber quem está na hora de comprar de novo e quem sumiu. Soma no banco, não na tela.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Modelos
create table if not exists mensagens_modelos (
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  assunto       text not null check (assunto in ('pedido', 'pago', 'enviado', 'fiado_vence', 'fiado_vencido', 'data_comercial', 'recompra')),
  texto         text not null check (length(btrim(texto)) between 1 and 1000),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, assunto)
);

alter table mensagens_modelos enable row level security;
drop policy if exists "dono_mensagens_modelos" on mensagens_modelos;
create policy "dono_mensagens_modelos" on mensagens_modelos for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

-- 2) Histórico do que foi enviado
alter table mensagens_enviadas add column if not exists assunto text;
alter table mensagens_enviadas add column if not exists cliente text;
alter table mensagens_enviadas add column if not exists referencia text;
alter table mensagens_enviadas add column if not exists whatsapp text;
alter table mensagens_enviadas add column if not exists texto text;
-- "pulada" = saiu da lista sem abrir o WhatsApp.
alter table mensagens_enviadas add column if not exists pulada boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mensagens_enviadas_detalhes_tamanho') then
    alter table mensagens_enviadas add constraint mensagens_enviadas_detalhes_tamanho check (
      coalesce(length(assunto), 0) <= 30
      and coalesce(length(cliente), 0) <= 120
      and coalesce(length(referencia), 0) <= 60
      and coalesce(length(whatsapp), 0) <= 30
      and coalesce(length(texto), 0) <= 2000
    );
  end if;
end $$;

create index if not exists mensagens_enviadas_recentes_idx on mensagens_enviadas (user_id, enviada_em desc);

-- 3) Histórico de compra por cliente
create or replace function historico_compras_clientes()
returns table (cliente_id uuid, compras bigint, primeira timestamptz, ultima timestamptz, total numeric)
language sql
security invoker
stable
set search_path = public
as $$
  select v.cliente_id, count(*)::bigint, min(v.data_venda), max(v.data_venda), coalesce(sum(v.total), 0)
    from vendas v
   where v.user_id = auth.uid()
     and v.status <> 'cancelada'
     and v.cliente_id is not null
   group by v.cliente_id;
$$;

revoke execute on function historico_compras_clientes() from public, anon;
grant execute on function historico_compras_clientes() to authenticated;

NOTIFY pgrst, 'reload schema';

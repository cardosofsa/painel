-- ============================================================
-- 0061 — WhatsApp semi-automático (Fase 11.6).
--
-- O SERTÃO monta a mensagem certa na hora certa (pedido recebido, pagamento confirmado,
-- enviado com rastreio, fiado vencendo/vencido) e a pessoa envia com um clique pelo próprio
-- WhatsApp (wa.me — grátis, sem API). Aqui fica só o REGISTRO do que já foi enviado, para
-- a mesma mensagem não aparecer de novo. A chave diz o assunto: "enviado:<venda>",
-- "fiado:<parcela>:vencido" etc.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists mensagens_enviadas (
  user_id   uuid not null references auth.users on delete cascade default auth.uid(),
  chave     text not null check (length(chave) between 3 and 120),
  enviada_em timestamptz not null default now(),
  primary key (user_id, chave)
);

alter table mensagens_enviadas enable row level security;
drop policy if exists "dono_mensagens_enviadas" on mensagens_enviadas;
create policy "dono_mensagens_enviadas" on mensagens_enviadas for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

NOTIFY pgrst, 'reload schema';

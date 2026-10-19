-- ============================================================
-- 0100 — Rascunho da Precificação (e o modo de cálculo de cada precificação salva).
--
-- Por quê: trocar de página ou fechar a aba no meio de uma precificação perdia tudo o que foi
-- digitado. A tela passa a guardar o trabalho em andamento sozinha (a cada 5 s, só quando
-- muda) e pelo botão "Salvar rascunho"; ao voltar, oferece "Continuar rascunho". O rascunho
-- é apagado quando a precificação é salva de verdade.
--
--   precificacao_rascunhos   um rascunho por trabalho em andamento: a aba (individual,
--                            variações, kits ou em massa), o produto (opcional), um título
--                            para a lista ("Kit Chá · Shopee A") e o estado da tela em `dados`.
--
-- E, em `precificacoes`, duas colunas opcionais: `modo_calculo` e `parametro` (margem, lucro,
-- markup ou preço fixo, e o número digitado). Sem elas, "Duplicar" adivinha o modo pela margem
-- gravada. Linhas antigas ficam com as duas nulas e continuam funcionando como hoje.
--
-- O código no ar continua funcionando antes e depois: nada é removido nem renomeado.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists precificacao_rascunhos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  visao         text not null check (visao in ('individual', 'variacoes', 'kits', 'massa')),
  produto_id    uuid references produtos(id) on delete set null,
  titulo        text not null default '' check (length(titulo) <= 200),
  dados         jsonb not null default '{}'::jsonb check (jsonb_typeof(dados) = 'object' and length(dados::text) <= 200000),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists precificacao_rascunhos_user_idx on precificacao_rascunhos (user_id, atualizado_em desc);

alter table precificacao_rascunhos enable row level security;
drop policy if exists "dono_precificacao_rascunhos" on precificacao_rascunhos;
create policy "dono_precificacao_rascunhos" on precificacao_rascunhos for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_rascunho_precificacao_produto on precificacao_rascunhos;
create trigger trg_valida_vinculo_rascunho_precificacao_produto
before insert or update of produto_id on precificacao_rascunhos
for each row execute function validar_vinculo_do_dono('produto_id', 'produtos');

-- Modo de cálculo da precificação salva (opcional; nulo = linha antiga).
alter table precificacoes add column if not exists modo_calculo text;
alter table precificacoes add column if not exists parametro numeric;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'precificacoes_modo_calculo_check') then
    alter table precificacoes add constraint precificacoes_modo_calculo_check
      check (modo_calculo is null or modo_calculo in ('margem', 'lucro', 'preco', 'markup'));
  end if;
end $$;

NOTIFY pgrst, 'reload schema';

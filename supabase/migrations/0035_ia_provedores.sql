-- ============================================================
-- 0035 — IAs cadastradas por cada conta (Gemini, OpenAI, Anthropic, OpenRouter).
--
-- A chave NUNCA é guardada em texto: `chave_cifrada` é AES-256-GCM feito no servidor com a
-- chave-mestra IA_CHAVE_COFRE (variável de ambiente; não existe no banco). Vazar só o banco
-- não entrega nenhuma chave, e o texto cifrado é amarrado ao user_id da conta.
-- `chave_final` são os 4 últimos caracteres, só para a tela mostrar "••••1a2b".
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists ia_provedores (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users on delete cascade default auth.uid(),
  provedor        text not null check (provedor in ('gemini', 'openai', 'anthropic', 'openrouter')),
  modelo          text not null check (length(modelo) between 1 and 200),
  chave_cifrada   text not null,
  chave_final     text not null check (length(chave_final) <= 8),
  padrao          boolean not null default false,
  ultimo_teste_em timestamptz,
  ultimo_erro     text,
  criado_em       timestamptz not null default now()
);

create index if not exists ia_provedores_user_idx on ia_provedores (user_id);

-- No máximo UMA IA padrão por conta.
create unique index if not exists ia_provedores_padrao_unico on ia_provedores (user_id) where padrao;

alter table ia_provedores enable row level security;

drop policy if exists "own_rows_ia_provedores" on ia_provedores;
create policy "own_rows_ia_provedores" on ia_provedores for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

-- Trocar a IA padrão: dois passos na mesma função (desmarca, depois marca), porque o índice
-- único parcial não aceita duas linhas `padrao` nem por um instante.
create or replace function ia_definir_padrao(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from ia_provedores where id = p_id and user_id = auth.uid()) then
    raise exception 'IA não encontrada.';
  end if;
  update ia_provedores set padrao = false where user_id = auth.uid() and padrao;
  update ia_provedores set padrao = true where id = p_id and user_id = auth.uid();
end;
$$;

grant execute on function ia_definir_padrao(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';

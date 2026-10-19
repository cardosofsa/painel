-- ============================================================
-- 0109 — Instruções de base e exemplos para a IA do Anúncio.
--
-- Por quê: a IA do Anúncio Infinito só sabia o nicho, a memória curta (frases de até 240
-- caracteres) e os termos proibidos. O vendedor quer (1) escrever uma direção fixa para
-- títulos e descrições, (2) que a descrição que ele corrigiu vire aprendizado e (3) que a IA
-- conheça os anúncios que a loja já tem antes de gerar. Agora, por perfil:
--
--   perfis_marca.instrucoes_titulo     texto livre (até 2.000) que entra em toda geração de
--   perfis_marca.instrucoes_descricao  título / descrição desse perfil.
--   marca_exemplos                     textos de referência, por tipo (titulo | descricao):
--                                       origem 'edicao' = o vendedor editou o que a IA
--                                       escreveu e salvou (guarda as duas versões);
--                                       origem 'loja'   = lido dos anúncios da loja ligada
--                                       ao perfil (Shopee/Mercado Livre), com o id do item.
--
-- A IA recebe só alguns exemplos, cortados, a cada geração (o código escolhe). O código no ar
-- continua funcionando antes e depois: só acrescenta colunas anuláveis e uma tabela nova.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table perfis_marca add column if not exists instrucoes_titulo text;
alter table perfis_marca add column if not exists instrucoes_descricao text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfis_marca_instrucoes_titulo_check') then
    alter table perfis_marca add constraint perfis_marca_instrucoes_titulo_check
      check (instrucoes_titulo is null or length(instrucoes_titulo) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfis_marca_instrucoes_descricao_check') then
    alter table perfis_marca add constraint perfis_marca_instrucoes_descricao_check
      check (instrucoes_descricao is null or length(instrucoes_descricao) <= 2000);
  end if;
end $$;

create table if not exists marca_exemplos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade default auth.uid(),
  perfil_id  uuid references perfis_marca(id) on delete cascade,
  tipo       text not null check (tipo in ('titulo', 'descricao')),
  origem     text not null check (origem in ('edicao', 'loja')),
  texto      text not null check (length(btrim(texto)) between 10 and 5000),
  -- O que a IA tinha escrito antes da edição (só origem 'edicao').
  texto_ia   text check (texto_ia is null or length(texto_ia) <= 5000),
  -- Id do item na loja (só origem 'loja'), para mostrar e não repetir.
  referencia text check (referencia is null or length(referencia) <= 200),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
create index if not exists marca_exemplos_perfil_idx on marca_exemplos (user_id, perfil_id, tipo, criado_em desc);

alter table marca_exemplos enable row level security;
drop policy if exists "dono_marca_exemplos" on marca_exemplos;
create policy "dono_marca_exemplos" on marca_exemplos for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_marca_exemplo_perfil on marca_exemplos;
create trigger trg_valida_vinculo_marca_exemplo_perfil
before insert or update of perfil_id on marca_exemplos
for each row execute function validar_vinculo_do_dono('perfil_id', 'perfis_marca');

NOTIFY pgrst, 'reload schema';

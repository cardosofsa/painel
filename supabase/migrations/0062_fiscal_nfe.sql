-- ============================================================
-- 0062 — NF-e pronta para ligar (Fase 11.7).
--
-- A etapa Emitir pergunta "comprovante do sistema ou NF-e?", com um padrão por canal.
-- A NF-e sai por um emissor (Focus NFe primeiro, num adaptador) e fica DESLIGADA até a conta
-- configurar o token em Configurações → Fiscal (certificado A1 é cadastrado no emissor).
--
--   fiscal_config  — uma por conta: emissor, ambiente, token CIFRADO, série, regras padrão
--                    (CFOP, CSOSN, PIS/COFINS) e o padrão por canal;
--   produtos       — ganham NCM, origem e CFOP opcional (sobrepõe o padrão);
--   notas_fiscais  — cada emissão (comprovante ou NF-e), com status, número, chave e links.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists fiscal_config (
  user_id           uuid primary key references auth.users on delete cascade default auth.uid(),
  provedor          text not null default 'focusnfe' check (provedor in ('focusnfe')),
  ambiente          text not null default 'homologacao' check (ambiente in ('homologacao', 'producao')),
  token_cifrado     text,
  serie             integer not null default 1 check (serie between 1 and 999),
  inscricao_estadual text check (inscricao_estadual is null or length(inscricao_estadual) <= 20),
  crt               integer not null default 1 check (crt in (1, 2, 3)),
  cfop_padrao       text not null default '5102' check (cfop_padrao ~ '^\d{4}$'),
  cfop_fora_estado  text not null default '6102' check (cfop_fora_estado ~ '^\d{4}$'),
  csosn_padrao      text not null default '102' check (csosn_padrao ~ '^\d{3}$'),
  pis_cofins_cst    text not null default '07' check (pis_cofins_cst ~ '^\d{2}$'),
  natureza          text not null default 'Venda de mercadoria' check (length(natureza) between 1 and 60),
  -- Padrão na etapa Emitir: 'comprovante' | 'nfe' | 'perguntar'.
  padrao_pdv        text not null default 'comprovante' check (padrao_pdv in ('comprovante', 'nfe', 'perguntar')),
  padrao_catalogo   text not null default 'perguntar' check (padrao_catalogo in ('comprovante', 'nfe', 'perguntar')),
  atualizado_em     timestamptz not null default now()
);

alter table fiscal_config enable row level security;
drop policy if exists "dono_fiscal_config" on fiscal_config;
create policy "dono_fiscal_config" on fiscal_config for all
  using (auth.uid() = user_id and conta_ativa()) with check (auth.uid() = user_id and conta_ativa());

alter table produtos add column if not exists ncm text;
alter table produtos add column if not exists origem_fiscal integer not null default 0;
alter table produtos add column if not exists cfop text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_fiscal_check') then
    alter table produtos add constraint produtos_fiscal_check check (
      (ncm is null or ncm ~ '^\d{8}$') and origem_fiscal between 0 and 8 and (cfop is null or cfop ~ '^\d{4}$'));
  end if;
end $$;

-- CPF/CNPJ do cliente: `clientes.documento` já existe (pode estar formatado); a NF-e
-- usa só os dígitos na hora de emitir.

create table if not exists notas_fiscais (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade default auth.uid(),
  venda_id   uuid not null references vendas(id) on delete cascade,
  tipo       text not null check (tipo in ('comprovante', 'nfe')),
  status     text not null default 'pendente' check (status in ('pendente', 'processando', 'autorizada', 'rejeitada', 'cancelada')),
  ambiente   text,
  ref        text unique,
  numero     text,
  serie      text,
  chave      text,
  danfe_url  text,
  xml_url    text,
  mensagem   text check (mensagem is null or length(mensagem) <= 1000),
  criado_em  timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists notas_fiscais_venda_idx on notas_fiscais (venda_id);

alter table notas_fiscais enable row level security;
drop policy if exists "dono_notas_fiscais" on notas_fiscais;
create policy "dono_notas_fiscais" on notas_fiscais for all
  using (auth.uid() = user_id and conta_ativa()) with check (auth.uid() = user_id and conta_ativa());

NOTIFY pgrst, 'reload schema';

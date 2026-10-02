-- ============================================================
-- 0055 — Frete com Melhor Envio (Fase 10.6).
--
-- frete_conexoes: uma por conta. Token do provedor CIFRADO pelo servidor (AES-GCM com a
-- chave-mestra do cofre, nunca em texto puro), CEP de origem e as regras: serviços aceitos,
-- acréscimo por envio, frete grátis a partir de um valor e se a vitrine cota frete.
--
-- pedidos_vitrine ganha o frete escolhido no checkout (gravado pelo servidor com a service
-- key, depois de conferir a assinatura da cotação — o navegador não define valor).
-- vendas ganha o serviço, a etiqueta comprada e o rastreio.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists frete_conexoes (
  user_id            uuid primary key references auth.users on delete cascade default auth.uid(),
  provedor           text not null default 'melhorenvio' check (provedor in ('melhorenvio')),
  ambiente           text not null default 'producao' check (ambiente in ('sandbox', 'producao')),
  token_cifrado      text,
  cep_origem         text check (cep_origem is null or cep_origem ~ '^\d{8}$'),
  servicos           integer[] not null default '{}',
  acrescimo          numeric(10,2) not null default 0 check (acrescimo between 0 and 1000),
  frete_gratis_acima numeric(12,2) check (frete_gratis_acima is null or frete_gratis_acima >= 0),
  na_vitrine         boolean not null default false,
  atualizado_em      timestamptz not null default now()
);

alter table frete_conexoes enable row level security;
drop policy if exists "dono_frete_conexoes" on frete_conexoes;
create policy "dono_frete_conexoes" on frete_conexoes for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

alter table pedidos_vitrine add column if not exists frete_servico text;
alter table pedidos_vitrine add column if not exists frete_servico_id integer;
alter table pedidos_vitrine add column if not exists frete_valor numeric(12,2) check (frete_valor is null or frete_valor >= 0);
alter table pedidos_vitrine add column if not exists frete_prazo_dias integer;

alter table vendas add column if not exists frete_servico text;
alter table vendas add column if not exists frete_servico_id integer;
alter table vendas add column if not exists frete_etiqueta_id text;
alter table vendas add column if not exists frete_custo numeric(12,2);
alter table vendas add column if not exists rastreio text;

-- A vitrine pública só precisa saber SE o catálogo cota frete (para mostrar o bloco).
create or replace function vitrine_tem_frete(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from catalogos c
      join frete_conexoes f on f.user_id = c.user_id
     where c.slug = p_slug and c.ativo and f.na_vitrine and f.token_cifrado is not null and f.cep_origem is not null
  );
$$;

revoke execute on function vitrine_tem_frete(text) from public;
grant execute on function vitrine_tem_frete(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';

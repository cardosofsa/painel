-- ============================================================
-- 0112 — Custos avulsos: itens com custo, sem virar produto.
--
-- Por quê: o vendedor tem custos de itens que ainda não cadastrou (ou cujo preço avulso é
-- outro) e quer usá-los na hora de precificar, montar variações ou um kit, sem lançar um
-- produto. Produto (mesmo insumo/embalagem, 0096) entra em estoque, compras, inventário e
-- alertas; aqui é só uma lista de custos para consultar e puxar.
--
--   custos_avulsos            nome, unidade do custo (un, cx, kg, L), custo, grupo e observação.
--                             Nome único por conta (sem diferenciar maiúscula): colar a lista
--                             de novo atualiza o preço em vez de duplicar.
--   custos_avulsos_historico  cada mudança de custo (de → para), gravada por trigger. Só
--                             leitura para o dono: a escrita é do trigger (security definer).
--
-- Quem usa o custo COPIA o valor na hora (precificação, kit, variações): mudar aqui não
-- altera o que já foi salvo. Nada existente muda. Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists custos_avulsos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  nome          text not null check (length(btrim(nome)) between 1 and 120),
  unidade       text not null default 'un' check (unidade in ('un', 'cx', 'kg', 'l')),
  custo         numeric(12,4) not null check (custo >= 0 and custo <= 1000000),
  grupo         text check (grupo is null or length(grupo) <= 60),
  observacao    text check (observacao is null or length(observacao) <= 500),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists custos_avulsos_nome_idx on custos_avulsos (user_id, lower(btrim(nome)));

alter table custos_avulsos enable row level security;
drop policy if exists "dono_custos_avulsos" on custos_avulsos;
create policy "dono_custos_avulsos" on custos_avulsos for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

create table if not exists custos_avulsos_historico (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  custo_id       uuid not null references custos_avulsos(id) on delete cascade,
  custo_anterior numeric(12,4) not null,
  custo_novo     numeric(12,4) not null,
  alterado_em    timestamptz not null default now()
);
create index if not exists custos_avulsos_historico_idx on custos_avulsos_historico (custo_id, alterado_em desc);

-- Só leitura: não há policy de escrita, quem grava é o trigger abaixo.
alter table custos_avulsos_historico enable row level security;
drop policy if exists "dono_le_custos_avulsos_historico" on custos_avulsos_historico;
create policy "dono_le_custos_avulsos_historico" on custos_avulsos_historico for select
  using (auth.uid() = user_id and conta_ativa());

create or replace function registrar_historico_custo_avulso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.atualizado_em := now();
  if new.custo is distinct from old.custo then
    insert into custos_avulsos_historico (user_id, custo_id, custo_anterior, custo_novo)
    values (old.user_id, old.id, old.custo, new.custo);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_historico_custo_avulso on custos_avulsos;
create trigger trg_historico_custo_avulso
before update on custos_avulsos
for each row execute function registrar_historico_custo_avulso();

NOTIFY pgrst, 'reload schema';

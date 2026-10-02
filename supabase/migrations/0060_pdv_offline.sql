-- ============================================================
-- 0060 — PDV sem internet (Fase 11.4).
--
-- A venda feita sem conexão fica no aparelho (IndexedDB) com uma CHAVE gerada lá e o
-- horário real. Quando a internet volta, o aparelho manda de novo — talvez mais de uma vez
-- (resposta perdida, duas abas). `registrar_venda_offline` garante UMA venda por chave:
-- trava pela chave, devolve a venda já criada se houver, senão chama `registrar_venda`
-- (todas as regras de estoque, caixa e fiado continuam lá) e grava a data real.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists vendas_offline (
  chave     uuid primary key,
  user_id   uuid not null references auth.users on delete cascade default auth.uid(),
  venda_id  uuid references vendas(id) on delete set null,
  criado_em timestamptz not null default now()
);

alter table vendas_offline enable row level security;
drop policy if exists "dono_vendas_offline" on vendas_offline;
create policy "dono_vendas_offline" on vendas_offline for select using (auth.uid() = user_id);

create or replace function registrar_venda_offline(
  p_chave uuid,
  p_feita_em timestamptz,
  p_itens jsonb,
  p_status text default 'paga',
  p_cliente_id uuid default null,
  p_conta_id uuid default null,
  p_forma_pagamento text default null,
  p_desconto numeric default 0,
  p_valor_entrega numeric default 0,
  p_observacao text default null,
  p_data_vencimento date default null,
  p_entrada_valor numeric default 0,
  p_entrada_forma text default null,
  p_forma_pagamento_2 text default null,
  p_parcelas_cartao integer default null,
  p_taxa_maquineta_pct numeric default 0,
  p_parcelas_fiado integer default 1,
  p_dias_entre_parcelas integer default 30
)
returns table (venda_id uuid, venda_numero text, venda_total numeric, venda_lucro numeric, ja_enviada boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
  v_r    record;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  -- Duas tentativas com a mesma chave ao mesmo tempo: a segunda espera a primeira.
  perform pg_advisory_xact_lock(hashtext(p_chave::text));

  select vo.venda_id into v_id from vendas_offline vo where vo.chave = p_chave and vo.user_id = v_user;
  if v_id is not null then
    return query select v.id, v.numero, v.total, v.lucro, true from vendas v where v.id = v_id;
    return;
  end if;

  select * into v_r from registrar_venda(
    p_itens => p_itens, p_status => p_status, p_cliente_id => p_cliente_id, p_conta_id => p_conta_id,
    p_forma_pagamento => p_forma_pagamento, p_desconto => p_desconto, p_valor_entrega => p_valor_entrega,
    p_observacao => p_observacao, p_data_vencimento => p_data_vencimento, p_entrada_valor => p_entrada_valor,
    p_entrada_forma => p_entrada_forma, p_forma_pagamento_2 => p_forma_pagamento_2, p_parcelas_cartao => p_parcelas_cartao,
    p_taxa_maquineta_pct => p_taxa_maquineta_pct, p_parcelas_fiado => p_parcelas_fiado, p_dias_entre_parcelas => p_dias_entre_parcelas
  );

  -- Data real da venda (até 30 dias para trás; nunca no futuro).
  if p_feita_em is not null and p_feita_em <= now() + interval '5 minutes' and p_feita_em > now() - interval '30 days' then
    update vendas set data_venda = p_feita_em where id = v_r.venda_id and user_id = v_user;
  end if;

  insert into vendas_offline (chave, user_id, venda_id) values (p_chave, v_user, v_r.venda_id);
  return query select v_r.venda_id, v_r.venda_numero, v_r.venda_total, v_r.venda_lucro, false;
end;
$$;

-- vendas_offline só tem leitura pela policy; a função grava como o usuário: precisa de insert.
drop policy if exists "dono_vendas_offline_insert" on vendas_offline;
create policy "dono_vendas_offline_insert" on vendas_offline for insert with check (auth.uid() = user_id);

grant execute on function registrar_venda_offline(uuid, timestamptz, jsonb, text, uuid, uuid, text, numeric, numeric, text, date, numeric, text, text, integer, numeric, integer, integer) to authenticated;

NOTIFY pgrst, 'reload schema';

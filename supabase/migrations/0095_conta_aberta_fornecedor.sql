-- ============================================================
-- 0095 — "Conta em aberto" com o fornecedor: saldo sem parcelas, pago quando você quiser.
--
-- Por quê: toda dívida com fornecedor virava parcela com data (`data_vencimento NOT NULL`).
-- Quem compra continuamente e abate com Pix, sem valor nem data fixos, não tinha onde lançar:
-- a dívida antiga pedia nº de parcelas e a compra nova era à vista ou parcelada.
--
-- Desenho: um EXTRATO por fornecedor (`fornecedor_lancamentos`). Saldo = compras + dívida
-- antiga − pagamentos. Fica de propósito FORA de `contas_a_pagar_receber`: ~10 pontos leem
-- aquela tabela e tratam a data como obrigação (alertas de vencida, calendário, "vence em
-- breve", saldo projetado, cobrança, fechamento). Uma conta sem data apareceria como atrasada
-- em todos. Aqui nada disso enxerga o saldo em aberto.
--
-- Regras:
--  * compra e dívida antiga só sobem o saldo; o caixa só mexe no PAGAMENTO (igual às parcelas);
--  * pagamento > saldo é recusado; ele debita a conta, grava a saída (categoria 'Compra de
--    mercadoria', `afeta_lucro = true`, mesma regra do `pagar_conta` da 0064) e o lançamento;
--  * estornar um pagamento devolve o saldo à conta; remover um débito só se o saldo não ficar
--    negativo;
--  * `em_aberto_por_fornecedor()` soma também esse saldo (sem atraso, sem vencimento).
--
-- Tabela só com SELECT por policy; toda escrita é por RPC security definer com o dono conferido.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists fornecedor_lancamentos (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade default auth.uid(),
  fornecedor_id    uuid not null references fornecedores(id) on delete cascade,
  tipo             text not null check (tipo in ('compra', 'divida_antiga', 'pagamento')),
  valor            numeric not null check (valor > 0),
  data             date not null default current_date,
  descricao        text,
  pedido_compra_id uuid references pedidos_compra(id) on delete set null,
  conta_id         uuid references contas(id) on delete set null,
  movimentacao_id  uuid references movimentacoes_financeiras(id) on delete set null,
  criado_em        timestamptz not null default now()
);
create index if not exists fornecedor_lancamentos_forn_idx on fornecedor_lancamentos (user_id, fornecedor_id, data desc, criado_em desc);
create index if not exists fornecedor_lancamentos_pedido_idx on fornecedor_lancamentos (pedido_compra_id) where pedido_compra_id is not null;

alter table fornecedor_lancamentos enable row level security;
drop policy if exists "dono_le_fornecedor_lancamentos" on fornecedor_lancamentos;
create policy "dono_le_fornecedor_lancamentos" on fornecedor_lancamentos for select
  using (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_forn_lanc on fornecedor_lancamentos;
create trigger trg_valida_vinculo_forn_lanc
before insert or update of fornecedor_id, pedido_compra_id, conta_id on fornecedor_lancamentos
for each row execute function validar_vinculo_do_dono('fornecedor_id', 'fornecedores', 'pedido_compra_id', 'pedidos_compra', 'conta_id', 'contas');

-- Saldo do fornecedor do usuário logado. Security invoker: o RLS (só as linhas dele) é a trava;
-- as RPCs abaixo também a chamam e a sessão (`auth.uid()`) continua a mesma.
create or replace function saldo_conta_aberta_fornecedor(p_fornecedor uuid)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum(case when tipo = 'pagamento' then -valor else valor end), 0)
    from fornecedor_lancamentos
   where user_id = auth.uid() and fornecedor_id = p_fornecedor;
$$;
revoke execute on function saldo_conta_aberta_fornecedor(uuid) from public, anon;
grant execute on function saldo_conta_aberta_fornecedor(uuid) to authenticated;

-- Lança um débito: compra deixada em aberto ou dívida antiga.
drop function if exists lancar_em_aberto_fornecedor(uuid, numeric, text, date, text, uuid);
create function lancar_em_aberto_fornecedor(
  p_fornecedor uuid,
  p_valor numeric,
  p_descricao text,
  p_data date default null,
  p_tipo text default 'compra',
  p_pedido uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_valor numeric := round(p_valor, 2);
  v_data  date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  v_nome  text;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not conta_ativa() then
    raise exception 'Conta sem acesso no momento.';
  end if;
  if p_tipo not in ('compra', 'divida_antiga') then
    raise exception 'Tipo de lançamento inválido.';
  end if;
  if v_valor is null or v_valor <= 0 or v_valor > 100000000 then
    raise exception 'Informe o valor que fica em aberto.';
  end if;
  if v_data > (now() at time zone 'America/Sao_Paulo')::date + 1 then
    raise exception 'A data não pode ser no futuro.';
  end if;
  select nome into v_nome from fornecedores where id = p_fornecedor and user_id = v_user;
  if not found then
    raise exception 'Fornecedor não encontrado.';
  end if;
  if p_pedido is not null and not exists (select 1 from pedidos_compra where id = p_pedido and user_id = v_user) then
    raise exception 'Pedido de compra não encontrado.';
  end if;

  insert into fornecedor_lancamentos (user_id, fornecedor_id, tipo, valor, data, descricao, pedido_compra_id)
  values (v_user, p_fornecedor, p_tipo, v_valor, v_data,
          left(coalesce(nullif(btrim(p_descricao), ''), case when p_tipo = 'divida_antiga' then 'Saldo anterior ao sistema' else 'Compra' end), 300),
          p_pedido);

  return jsonb_build_object('saldo', saldo_conta_aberta_fornecedor(p_fornecedor));
end;
$$;
revoke execute on function lancar_em_aberto_fornecedor(uuid, numeric, text, date, text, uuid) from public, anon;
grant execute on function lancar_em_aberto_fornecedor(uuid, numeric, text, date, text, uuid) to authenticated;

-- Pagamento avulso (Pix etc.): abate do saldo do fornecedor, sai de uma conta.
drop function if exists pagar_em_aberto_fornecedor(uuid, numeric, uuid, date, text);
create function pagar_em_aberto_fornecedor(
  p_fornecedor uuid,
  p_valor numeric,
  p_conta uuid,
  p_data date default null,
  p_descricao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_valor numeric := round(p_valor, 2);
  v_data  date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
  v_nome  text;
  v_saldo numeric;
  v_desc  text;
  v_mov   uuid;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not conta_ativa() then
    raise exception 'Conta sem acesso no momento.';
  end if;
  if v_valor is null or v_valor <= 0 or v_valor > 100000000 then
    raise exception 'Informe o valor pago.';
  end if;
  if v_data > (now() at time zone 'America/Sao_Paulo')::date + 1 then
    raise exception 'A data do pagamento não pode ser no futuro.';
  end if;
  -- Trava o fornecedor: dois pagamentos ao mesmo tempo não passam juntos do saldo.
  select nome into v_nome from fornecedores where id = p_fornecedor and user_id = v_user for update;
  if not found then
    raise exception 'Fornecedor não encontrado.';
  end if;
  if p_conta is null or not exists (select 1 from contas where id = p_conta and user_id = v_user) then
    raise exception 'Escolha a conta de onde saiu o dinheiro.';
  end if;
  v_saldo := saldo_conta_aberta_fornecedor(p_fornecedor);
  if v_valor > v_saldo + 0.004 then
    raise exception 'O valor passa do que você deve a este fornecedor (R$ %).', to_char(greatest(v_saldo, 0), 'FM999G999G990D00');
  end if;

  v_desc := left(coalesce(nullif(btrim(p_descricao), ''), format('Pagamento — %s', v_nome)), 300);

  insert into movimentacoes_financeiras (user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro, data_movimentacao)
  values (v_user, 'saida', -v_valor, v_desc, 'Pagamento de conta', 'Compra de mercadoria', p_conta, true, v_data)
  returning id into v_mov;

  update contas set saldo = saldo - v_valor where id = p_conta and user_id = v_user;

  insert into fornecedor_lancamentos (user_id, fornecedor_id, tipo, valor, data, descricao, conta_id, movimentacao_id)
  values (v_user, p_fornecedor, 'pagamento', v_valor, v_data, v_desc, p_conta, v_mov);

  return jsonb_build_object('pago', v_valor, 'saldo', round(v_saldo - v_valor, 2));
end;
$$;
revoke execute on function pagar_em_aberto_fornecedor(uuid, numeric, uuid, date, text) from public, anon;
grant execute on function pagar_em_aberto_fornecedor(uuid, numeric, uuid, date, text) to authenticated;

-- Desfaz um lançamento: pagamento (devolve o dinheiro à conta) ou débito (se o saldo não ficar negativo).
drop function if exists estornar_lancamento_fornecedor(uuid);
create function estornar_lancamento_fornecedor(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_l    fornecedor_lancamentos%rowtype;
  v_saldo numeric;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not conta_ativa() then
    raise exception 'Conta sem acesso no momento.';
  end if;
  select * into v_l from fornecedor_lancamentos where id = p_id and user_id = v_user for update;
  if not found then
    raise exception 'Lançamento não encontrado.';
  end if;
  perform 1 from fornecedores where id = v_l.fornecedor_id and user_id = v_user for update;

  if v_l.tipo = 'pagamento' then
    if v_l.movimentacao_id is not null then
      delete from movimentacoes_financeiras where id = v_l.movimentacao_id and user_id = v_user;
    end if;
    if v_l.conta_id is not null then
      update contas set saldo = saldo + v_l.valor where id = v_l.conta_id and user_id = v_user;
    end if;
  else
    v_saldo := saldo_conta_aberta_fornecedor(v_l.fornecedor_id);
    if v_saldo - v_l.valor < -0.004 then
      raise exception 'Não dá para remover: já foi pago mais do que sobraria. Estorne primeiro algum pagamento.';
    end if;
  end if;

  delete from fornecedor_lancamentos where id = p_id and user_id = v_user;
  return jsonb_build_object('saldo', saldo_conta_aberta_fornecedor(v_l.fornecedor_id));
end;
$$;
revoke execute on function estornar_lancamento_fornecedor(uuid) from public, anon;
grant execute on function estornar_lancamento_fornecedor(uuid) to authenticated;

-- "Em aberto" por fornecedor: parcelas com data (0067) + saldo da conta em aberto (sem atraso nem vencimento).
drop function if exists em_aberto_por_fornecedor();
create function em_aberto_por_fornecedor()
returns table (fornecedor_id uuid, em_aberto numeric, atrasado numeric, proximo_vencimento date)
language sql
stable
security invoker
set search_path = public
as $$
  select t.fornecedor_id, sum(t.aberto), coalesce(sum(t.aberto) filter (where t.vencida), 0), min(t.data_vencimento)
    from (
      select coalesce(c.fornecedor_id, p.fornecedor_id) as fornecedor_id,
             c.valor - c.valor_pago as aberto,
             c.data_vencimento,
             c.data_vencimento < current_date as vencida
        from contas_a_pagar_receber c
        left join pedidos_compra p on p.id = c.referencia_pedido_compra_id
       where c.user_id = auth.uid() and c.tipo = 'pagar' and c.status = 'pendente'
      union all
      select l.fornecedor_id,
             sum(case when l.tipo = 'pagamento' then -l.valor else l.valor end),
             null::date,
             false
        from fornecedor_lancamentos l
       where l.user_id = auth.uid()
       group by l.fornecedor_id
    ) t
   where t.fornecedor_id is not null
   group by t.fornecedor_id
  having sum(t.aberto) > 0.004;
$$;
revoke execute on function em_aberto_por_fornecedor() from public, anon;
grant execute on function em_aberto_por_fornecedor() to authenticated;

NOTIFY pgrst, 'reload schema';

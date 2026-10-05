-- ============================================================
-- 0065 — Crediário completo: Pix, multa e juros por atraso, recebimento com valor livre;
-- parcelas com datas próprias (duplicatas da NF-e de compra); "primeiros passos" (Fase 13.2).
--
--   * perfil_negocio: chave Pix (+ nome e cidade do recebedor, exigidos pelo BR Code),
--     multa de atraso (teto de 2% do CDC) e juros ao mês; onboarding_oculto.
--   * marcar_parcela_paga: o que vier acima da parcela vira lançamento separado
--     ("Juros e multa de crediário"), para o relatório não confundir com venda.
--   * receber_conta: conta a receber (crediário de parcela única, avulsa) com valor livre —
--     menos que o devido deixa o resto em aberto; mais = juros; `p_quitar` fecha com desconto.
--   * gerar_pagamento_compra_parcelas: parcelas de compra com valor e vencimento de cada uma
--     (as duplicatas do XML), somando o total do pedido.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Perfil: Pix e encargos
alter table perfil_negocio add column if not exists pix_chave text;
alter table perfil_negocio add column if not exists pix_nome text;
alter table perfil_negocio add column if not exists pix_cidade text;
alter table perfil_negocio add column if not exists multa_atraso_pct numeric(5,2) not null default 0;
alter table perfil_negocio add column if not exists juros_mes_pct numeric(5,2) not null default 0;
alter table perfil_negocio add column if not exists onboarding_oculto boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'perfil_negocio_multa_cdc') then
    alter table perfil_negocio add constraint perfil_negocio_multa_cdc check (multa_atraso_pct between 0 and 2);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfil_negocio_juros_faixa') then
    alter table perfil_negocio add constraint perfil_negocio_juros_faixa check (juros_mes_pct between 0 and 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'perfil_negocio_pix_tamanhos') then
    alter table perfil_negocio add constraint perfil_negocio_pix_tamanhos check (
      (pix_chave is null or length(pix_chave) <= 77)
      and (pix_nome is null or length(pix_nome) <= 25)
      and (pix_cidade is null or length(pix_cidade) <= 15)
    );
  end if;
end $$;

-- 2) Parcela do crediário: o excedente é encargo, lançado à parte
create or replace function marcar_parcela_paga(
  p_parcela_id uuid,
  p_valor_pago numeric,
  p_data_pagamento date,
  p_conta_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_parcela venda_parcelas%rowtype;
  v_venda vendas%rowtype;
  v_todas_pagas boolean;
  v_data date := coalesce(p_data_pagamento, current_date);
  v_principal numeric;
  v_encargo numeric;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo para registrar o pagamento.';
  end if;

  select * into v_parcela from venda_parcelas where id = p_parcela_id and user_id = v_user for update;
  if not found then
    raise exception 'Parcela não encontrada ou não pertence a você.';
  end if;
  if v_parcela.status = 'paga' then
    raise exception 'Esta parcela já está paga.';
  end if;
  if p_valor_pago is null or p_valor_pago <= 0 then
    raise exception 'Informe o valor recebido.';
  end if;
  if p_conta_id is null then
    raise exception 'Escolha a conta que recebeu o pagamento.';
  end if;

  select * into v_venda from vendas where id = v_parcela.venda_id and user_id = v_user;

  v_principal := least(round(p_valor_pago, 2), v_parcela.valor);
  v_encargo := greatest(round(p_valor_pago, 2) - v_parcela.valor, 0);

  update venda_parcelas
  set status = 'paga', data_pagamento = v_data, valor_pago = round(p_valor_pago, 2), conta_id = p_conta_id
  where id = p_parcela_id;

  insert into movimentacoes_financeiras (
    user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
    data_movimentacao, referencia_venda_id
  ) values (
    v_user, 'entrada', v_principal,
    format('Venda %s — parcela %s/%s', v_venda.numero, v_parcela.numero, v_parcela.total_parcelas),
    'Crediário', 'Recebimento de crediário', p_conta_id, true, v_data, v_venda.id
  );

  if v_encargo > 0 then
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id
    ) values (
      v_user, 'entrada', v_encargo,
      format('Venda %s — multa e juros da parcela %s/%s', v_venda.numero, v_parcela.numero, v_parcela.total_parcelas),
      'Crediário', 'Juros e multa de crediário', p_conta_id, true, v_data, v_venda.id
    );
  end if;

  update contas set saldo = saldo + round(p_valor_pago, 2) where id = p_conta_id and user_id = v_user;
  if not found then
    raise exception 'Conta não encontrada ou não pertence ao usuário atual';
  end if;

  select not exists (
    select 1 from venda_parcelas where venda_id = v_parcela.venda_id and status = 'pendente'
  ) into v_todas_pagas;

  if v_todas_pagas then
    update contas_a_pagar_receber
    set status = 'recebido', valor_pago = valor, data_pagamento = v_data
    where referencia_venda_id = v_parcela.venda_id and tipo = 'receber' and user_id = v_user;
  end if;
end;
$$;

grant execute on function marcar_parcela_paga(uuid, numeric, date, uuid) to authenticated;

-- 3) Receber conta (crediário de parcela única ou avulsa) com valor livre
create or replace function receber_conta(
  p_id uuid,
  p_valor numeric,
  p_data date default null,
  p_conta_id uuid default null,
  p_quitar boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_cpr contas_a_pagar_receber%rowtype;
  v_conta uuid;
  v_data date := coalesce(p_data, current_date);
  v_restante numeric;
  v_principal numeric;
  v_encargo numeric;
  v_pago numeric;
  v_quitada boolean;
  v_crediario boolean;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo para registrar o recebimento.';
  end if;
  select * into v_cpr from contas_a_pagar_receber where id = p_id and user_id = v_user for update;
  if not found then
    raise exception 'Conta a receber não encontrada.';
  end if;
  if v_cpr.tipo <> 'receber' then
    raise exception 'Só contas a receber aceitam recebimento por aqui.';
  end if;
  if v_cpr.status <> 'pendente' then
    raise exception 'Esta conta já foi recebida.';
  end if;
  if v_cpr.referencia_venda_id is not null and exists (select 1 from venda_parcelas where venda_id = v_cpr.referencia_venda_id) then
    raise exception 'Este crediário é parcelado: receba pelas parcelas.';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'Informe o valor recebido.';
  end if;
  if v_data > current_date + 1 then
    raise exception 'A data do recebimento não pode ser no futuro.';
  end if;
  v_conta := coalesce(p_conta_id, v_cpr.conta_id);
  if v_conta is null then
    raise exception 'Escolha a conta que recebeu o dinheiro.';
  end if;

  v_restante := greatest(v_cpr.valor - v_cpr.valor_pago, 0);
  v_principal := least(round(p_valor, 2), v_restante);
  v_encargo := greatest(round(p_valor, 2) - v_restante, 0);
  v_crediario := v_cpr.referencia_venda_id is not null;

  if v_principal > 0 then
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id
    ) values (
      v_user, 'entrada', v_principal, v_cpr.descricao,
      case when v_crediario then 'Crediário' else 'Conta a receber recebida' end,
      case when v_crediario then 'Recebimento de crediário' end,
      v_conta, true, v_data, v_cpr.referencia_venda_id
    );
  end if;
  if v_encargo > 0 then
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id
    ) values (
      v_user, 'entrada', v_encargo, v_cpr.descricao || ' — multa e juros',
      case when v_crediario then 'Crediário' else 'Conta a receber recebida' end,
      'Juros e multa de crediário', v_conta, true, v_data, v_cpr.referencia_venda_id
    );
  end if;

  update contas set saldo = saldo + round(p_valor, 2) where id = v_conta and user_id = v_user;
  if not found then
    raise exception 'Conta não encontrada ou não pertence a você.';
  end if;

  v_pago := v_cpr.valor_pago + v_principal;
  v_quitada := p_quitar or v_pago >= v_cpr.valor - 0.005;
  update contas_a_pagar_receber
     set valor_pago = v_pago,
         data_pagamento = v_data,
         status = case when v_quitada then 'recebido' else 'pendente' end
   where id = p_id;

  return jsonb_build_object('valor_pago', v_pago, 'quitada', v_quitada, 'restante', greatest(v_cpr.valor - v_pago, 0));
end;
$$;

revoke execute on function receber_conta(uuid, numeric, date, uuid, boolean) from public, anon;
grant execute on function receber_conta(uuid, numeric, date, uuid, boolean) to authenticated;

-- 4) Compra a prazo com as parcelas da nota (valor e vencimento de cada uma)
create or replace function gerar_pagamento_compra_parcelas(
  p_pedido uuid,
  p_parcelas jsonb,
  p_conta_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_ped pedidos_compra%rowtype;
  v_n integer := coalesce(jsonb_array_length(p_parcelas), 0);
  v_soma numeric;
  v_item jsonb;
  i integer := 0;
begin
  if v_n < 1 then
    raise exception 'Informe ao menos uma parcela.';
  end if;
  if v_n > 48 then
    raise exception 'No máximo 48 parcelas.';
  end if;
  select * into v_ped from pedidos_compra where id = p_pedido and user_id = v_user;
  if not found then
    raise exception 'Pedido de compra não encontrado.';
  end if;
  if exists (select 1 from contas_a_pagar_receber where referencia_pedido_compra_id = p_pedido and user_id = v_user) then
    raise exception 'Este pedido já tem parcelas lançadas.';
  end if;
  select sum(round((x->>'valor')::numeric, 2)) into v_soma from jsonb_array_elements(p_parcelas) x;
  if v_soma is null or abs(v_soma - v_ped.valor_total) > 0.05 then
    raise exception 'As parcelas somam %, mas o pedido é de %.', coalesce(v_soma, 0), v_ped.valor_total;
  end if;

  for v_item in select value from jsonb_array_elements(p_parcelas) loop
    i := i + 1;
    if (v_item->>'valor')::numeric <= 0 or (v_item->>'vencimento') is null then
      raise exception 'Parcela % sem valor ou vencimento.', i;
    end if;
    insert into contas_a_pagar_receber (
      user_id, tipo, descricao, valor, data_vencimento, status, conta_id,
      referencia_pedido_compra_id, parcela_numero, total_parcelas
    ) values (
      v_user, 'pagar',
      case when v_n > 1 then format('Pedido %s — parcela %s/%s', v_ped.numero, i, v_n) else format('Pedido %s', v_ped.numero) end,
      round((v_item->>'valor')::numeric, 2), (v_item->>'vencimento')::date, 'pendente', p_conta_id,
      p_pedido, i, v_n
    );
  end loop;
end;
$$;

revoke execute on function gerar_pagamento_compra_parcelas(uuid, jsonb, uuid) from public, anon;
grant execute on function gerar_pagamento_compra_parcelas(uuid, jsonb, uuid) to authenticated;

NOTIFY pgrst, 'reload schema';

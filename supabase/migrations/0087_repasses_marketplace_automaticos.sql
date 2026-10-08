-- ============================================================
-- 0087 — Repasse de marketplace nunca "atrasa" e é recebido sozinho.
--
-- Na Shopee tudo acontece dentro da plataforma: o pedido feito já está pago e o repasse ou
-- é LIBERADO ou é ESTORNADO/REEMBOLSADO — a plataforma comunica os dois. Não existe
-- "repasse atrasado". A 0085 tirou do alerta só o repasse de pedido não concluído; o
-- concluído passava a vencer na data de liberação e, sem baixa manual, virava "Conta a
-- receber atrasada" na Vixe.
--
--   1. contas_a_pagar_receber.referencia_pedido_marketplace_id: identifica o repasse sem
--      depender do texto. Preenchida para as linhas existentes (pelo vínculo do pedido e,
--      na falta dele, pela descrição "Repasse <loja> — pedido <n>" + loja) e gravada pela
--      importação daqui em diante. Alertas, Dashboard, Calendário e "Vencidos" ignoram.
--   2. Baixa automática: pedido concluído com o escrow liberado → o repasse vira RECEBIDO
--      com o valor real e a entrada cai na conta financeira da loja (lojas_canal.
--      conta_financeira_id), criada na hora se não existir ("Shopee — <loja>"). Uma vez só:
--      a trava é pedidos_marketplace.repasse_recebido (+ repasse_conta_id = foi automático).
--      Repasse recebido à mão (ou conciliado pelo relatório, 0066) não é tocado.
--   3. Estorno/reembolso depois da baixa automática: o valor final que a Shopee informar
--      gera a saída (ou o ajuste) da diferença na mesma conta.
--   4. Dados existentes: repasses de pedidos concluídos com escrow liberado e ainda
--      pendentes viram recebidos (sem duplicar); repasse sem pedido encontrado fica
--      "aguardando" (não vence).
--
-- As funções novas são internas (sem EXECUTE para anon/authenticated): só a importação
-- (security definer, que confere sessão, conta_ativa() e o dono da loja) as chama.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Colunas
alter table contas_a_pagar_receber
  add column if not exists referencia_pedido_marketplace_id uuid references pedidos_marketplace(id) on delete set null;
create index if not exists contas_pr_pedido_mkt_idx on contas_a_pagar_receber (referencia_pedido_marketplace_id)
  where referencia_pedido_marketplace_id is not null;

alter table lojas_canal add column if not exists conta_financeira_id uuid references contas(id) on delete set null;
alter table pedidos_marketplace add column if not exists repasse_conta_id uuid references contas(id) on delete set null;

-- FK nova não pode apontar para linha de outra conta (mesma trava da 0026).
drop trigger if exists contas_pr_vinculo_pedido_mkt on contas_a_pagar_receber;
create trigger contas_pr_vinculo_pedido_mkt
  before insert or update of referencia_pedido_marketplace_id on contas_a_pagar_receber
  for each row execute function validar_vinculo_do_dono('referencia_pedido_marketplace_id', 'pedidos_marketplace');

drop trigger if exists lojas_canal_vinculo_conta_fin on lojas_canal;
create trigger lojas_canal_vinculo_conta_fin
  before insert or update of conta_financeira_id on lojas_canal
  for each row execute function validar_vinculo_do_dono('conta_financeira_id', 'contas');

-- 2) Conta financeira da loja: a gravada na loja ou, sem ela, "<Canal> — <loja>" (criada).
create or replace function conta_financeira_da_loja(p_user uuid, p_loja uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta uuid;
  v_loja  text;
  v_canal text;
  v_nome  text;
begin
  select l.conta_financeira_id, l.nome, c.nome into v_conta, v_loja, v_canal
    from lojas_canal l
    left join canais c on c.id = l.canal_id and c.user_id = l.user_id
   where l.id = p_loja and l.user_id = p_user
   for update of l;
  if v_loja is null then
    raise exception 'Loja não encontrada.';
  end if;
  if v_conta is not null and exists (select 1 from contas where id = v_conta and user_id = p_user) then
    return v_conta;
  end if;

  v_canal := coalesce(nullif(trim(v_canal), ''), 'Marketplace');
  v_nome := left(case when v_loja ilike v_canal || '%' then v_loja else v_canal || ' — ' || v_loja end, 80);
  select id into v_conta from contas where user_id = p_user and nome = v_nome order by criado_em limit 1;
  if v_conta is null then
    insert into contas (user_id, nome, saldo, detalhe)
    values (p_user, v_nome, 0, 'Carteira do marketplace — criada pela baixa automática dos repasses')
    returning id into v_conta;
  end if;
  update lojas_canal set conta_financeira_id = v_conta where id = p_loja and user_id = p_user;
  return v_conta;
end;
$$;

revoke execute on function conta_financeira_da_loja(uuid, uuid) from public, anon, authenticated;

-- 3) Baixa (e estorno) automática do repasse de um pedido. Devolve o que fez:
--    'recebido' | 'estornado' | 'ajustado' | 'manual' | 'aguardando' | 'sem_mudanca' | 'nao_encontrado'.
create or replace function liquidar_repasse_marketplace(p_user uuid, p_pedido uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p       pedidos_marketplace%rowtype;
  v_cpr     contas_a_pagar_receber%rowtype;
  v_tem_cpr boolean := false;
  v_loja    text;
  v_conta   uuid;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_data    date;
  v_valor   numeric;
  v_final   numeric;
  v_dif     numeric;
  v_cpr_id  uuid;
begin
  select * into v_p from pedidos_marketplace where id = p_pedido and user_id = p_user for update;
  if not found then
    return 'nao_encontrado';
  end if;
  select nome into v_loja from lojas_canal where id = v_p.loja_id and user_id = p_user;
  if v_p.conta_receber_id is not null then
    select * into v_cpr from contas_a_pagar_receber where id = v_p.conta_receber_id and user_id = p_user for update;
    v_tem_cpr := found;
  end if;

  -- a) Já recebido pela baixa automática: acompanha o valor final que a plataforma informa
  --    (cancelado/estornado → 0; devolução/reembolso → o que sobrou).
  if v_p.repasse_conta_id is not null and v_p.repasse_recebido is not null then
    v_final := case when v_p.status in ('cancelado', 'nao_pago') then 0 else greatest(coalesce(v_p.repasse, 0), 0) end;
    v_dif := round(v_final - v_p.repasse_recebido, 2);
    if abs(v_dif) < 0.01 then
      return 'sem_mudanca';
    end if;
    insert into movimentacoes_financeiras (user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro, data_movimentacao)
    values (
      p_user, case when v_dif > 0 then 'entrada' else 'saida' end, v_dif,
      left(format('%s do repasse %s — pedido %s', case when v_dif > 0 then 'Ajuste' else 'Estorno' end, v_loja, v_p.numero), 300),
      'Repasse automático', 'Repasse marketplace', v_p.repasse_conta_id, true, v_hoje
    );
    update contas set saldo = saldo + v_dif where id = v_p.repasse_conta_id and user_id = p_user;
    update pedidos_marketplace set repasse_recebido = v_final where id = v_p.id;
    if v_tem_cpr and v_cpr.status = 'recebido' and v_final > 0 then
      update contas_a_pagar_receber set valor = v_final, valor_pago = v_final where id = v_cpr.id;
    end if;
    return case when v_dif > 0 then 'ajustado' else 'estornado' end;
  end if;

  -- b) Receber: concluído (ou devolvido com o valor final) e escrow liberado pela Shopee.
  if v_p.status not in ('concluido', 'devolvido')
     or v_p.escrow_liberado_em is null or v_p.escrow_liberado_em > now()
     or v_p.repasse_recebido is not null
     or coalesce(v_p.repasse, 0) <= 0 then
    return 'aguardando';
  end if;
  if v_tem_cpr and (v_cpr.status <> 'pendente' or coalesce(v_cpr.valor_pago, 0) > 0) then
    return 'manual';  -- recebido (ou em parte) à mão: não toca
  end if;

  v_valor := round(v_p.repasse, 2);
  v_data := least((v_p.escrow_liberado_em at time zone 'America/Sao_Paulo')::date, v_hoje);
  v_conta := conta_financeira_da_loja(p_user, v_p.loja_id);

  insert into movimentacoes_financeiras (user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro, data_movimentacao)
  values (p_user, 'entrada', v_valor, left(format('Repasse %s — pedido %s', v_loja, v_p.numero), 300),
          'Repasse automático', 'Repasse marketplace', v_conta, true, v_data);
  update contas set saldo = saldo + v_valor where id = v_conta and user_id = p_user;

  if v_tem_cpr then
    update contas_a_pagar_receber
       set status = 'recebido', valor = v_valor, valor_pago = v_valor, data_pagamento = v_data,
           conta_id = v_conta, aguardando_liberacao = false, referencia_pedido_marketplace_id = v_p.id
     where id = v_cpr.id;
    v_cpr_id := v_cpr.id;
  else
    insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento, status, valor_pago, data_pagamento, conta_id, referencia_pedido_marketplace_id)
    values (p_user, 'receber', left(format('Repasse %s — pedido %s', v_loja, v_p.numero), 300), v_valor, v_data, 'recebido', v_valor, v_data, v_conta, v_p.id)
    returning id into v_cpr_id;
  end if;

  update pedidos_marketplace
     set repasse_recebido = v_valor, repasse_recebido_em = v_data, repasse_conta_id = v_conta, conta_receber_id = v_cpr_id
   where id = v_p.id;
  return 'recebido';
end;
$$;

revoke execute on function liquidar_repasse_marketplace(uuid, uuid) from public, anon, authenticated;

-- 4) Importação (planilha, API e cron): grava a referência e chama a baixa automática.
create or replace function importar_pedidos_marketplace(p_loja_id uuid, p_pedidos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_loja     text;
  v_armazem  uuid;
  v_p        jsonb;
  v_i        jsonb;
  v_id       uuid;
  v_antigo   record;
  v_status   text;
  v_baixa    boolean;
  v_baixado  boolean;
  v_reserva  boolean;
  v_reservado boolean;
  v_pago     boolean;
  v_devolvido boolean;
  v_conta    uuid;
  v_repasse  numeric;
  v_venc     date;
  v_prod     uuid;
  v_origem   text;
  v_manter   boolean;
  v_liberado timestamptz;
  v_aguarda  boolean;
  v_detalhe  jsonb;
  v_custo    numeric;
  v_imposto  numeric;
  v_novos    integer := 0;
  v_atual    integer := 0;
  v_baixas   integer := 0;
  v_estornos integer := 0;
  v_recebidos integer := 0;
  v_item     record;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not conta_ativa() then
    raise exception 'Conta inativa.';
  end if;
  select nome into v_loja from lojas_canal where id = p_loja_id and user_id = v_user;
  if v_loja is null then
    raise exception 'Loja não encontrada.';
  end if;
  if jsonb_typeof(p_pedidos) <> 'array' or jsonb_array_length(p_pedidos) > 2000 then
    raise exception 'Envie no máximo 2.000 pedidos por vez.';
  end if;

  select id into v_armazem from armazens
   where user_id = v_user and p_loja_id = any(coalesce(loja_ids, '{}'))
   order by criado_em limit 1;
  perform set_config('app.armazem_mov', coalesce(v_armazem::text, ''), true);

  for v_p in select * from jsonb_array_elements(p_pedidos)
  loop
    v_status := v_p->>'status';
    if v_status not in ('nao_pago', 'a_enviar', 'enviado', 'concluido', 'cancelado', 'devolvido') or coalesce(v_p->>'numero', '') = '' then
      continue;
    end if;
    -- 0052: pago e esperando envio só RESERVA; a baixa vem quando a plataforma processa
    -- (etiqueta gerada: PROCESSED) ou envia. Planilha "A Enviar" não diz se processou.
    v_baixa := v_status in ('enviado', 'concluido')
      or (v_status = 'a_enviar' and coalesce(v_p->>'status_original', '') ~* '(processed|retry_ship|processado)');
    v_reserva := v_status = 'a_enviar' and not v_baixa;
    v_pago := v_baixa or v_reserva;
    v_devolvido := v_status = 'devolvido';
    v_repasse := greatest(0, coalesce((v_p->>'repasse')::numeric, 0));
    v_origem := nullif(v_p->>'taxas_origem', '');
    if v_origem is not null and v_origem not in ('real', 'planilha', 'estimado') then
      v_origem := null;
    end if;
    v_detalhe := case when jsonb_typeof(v_p->'taxas_detalhe') = 'array' and jsonb_array_length(v_p->'taxas_detalhe') <= 30
                      then v_p->'taxas_detalhe' else '[]'::jsonb end;
    v_custo := coalesce((v_p->>'custo')::numeric, 0);
    v_imposto := coalesce((v_p->>'imposto')::numeric, 0);

    select id, estoque_baixado, estoque_reservado, conta_receber_id, taxas_origem, escrow_liberado_em, repasse,
           comissao, taxa_servico, taxa_transacao, taxa_outras, taxas_detalhe, cupom_vendedor
      into v_antigo
      from pedidos_marketplace
     where user_id = v_user and loja_id = p_loja_id and numero = v_p->>'numero'
     for update;

    if v_antigo.id is null then
      insert into pedidos_marketplace (user_id, loja_id, numero, status)
      values (v_user, p_loja_id, left(v_p->>'numero', 80), v_status)
      returning id into v_id;
      v_baixado := false;
      v_reservado := false;
      v_conta := null;
      v_novos := v_novos + 1;
    else
      v_id := v_antigo.id;
      v_baixado := v_antigo.estoque_baixado;
      v_reservado := coalesce(v_antigo.estoque_reservado, false);
      v_conta := v_antigo.conta_receber_id;
      v_atual := v_atual + 1;
    end if;

    -- 0085: taxa real já gravada não volta a ser estimativa porque o escrow falhou desta vez.
    v_manter := v_antigo.id is not null and v_antigo.taxas_origem = 'real' and v_origem = 'estimado' and v_status <> 'cancelado';
    if v_manter then
      v_repasse := v_antigo.repasse;
    end if;
    v_liberado := coalesce(nullif(v_p->>'escrow_liberado_em', '')::timestamptz, v_antigo.escrow_liberado_em);

    -- Estorno: já tinha saído do estoque e agora foi cancelado. Devolvido NÃO estorna (0085):
    -- a plataforma não diz se o item voltou — o pedido fica "a revisar".
    if v_baixado and not v_pago and not v_devolvido then
      for v_item in select produto_id, quantidade from pedidos_marketplace_itens where pedido_id = v_id and produto_id is not null
      loop
        perform registrar_movimentacao_estoque(v_item.produto_id, 'entrada', v_item.quantidade, left(format('Estorno %s %s pedido %s', 'Shopee', v_loja, v_p->>'numero'), 300));
      end loop;
      v_baixado := false;
      v_estornos := v_estornos + 1;
    end if;

    -- Reserva que não vale mais (cancelou, devolveu, ou vai baixar agora) sai.
    if v_reservado and not v_reserva then
      delete from estoque_reservas where pedido_marketplace_id = v_id;
      v_reservado := false;
    end if;

    delete from pedidos_marketplace_itens where pedido_id = v_id;
    for v_i in select * from jsonb_array_elements(coalesce(v_p->'itens', '[]'::jsonb))
    loop
      v_prod := nullif(v_i->>'produto_id', '')::uuid;
      if v_prod is not null and not exists (select 1 from produtos where id = v_prod and user_id = v_user) then
        v_prod := null;
      end if;
      insert into pedidos_marketplace_itens (user_id, pedido_id, produto_id, sku, sku_principal, nome, variacao, quantidade, preco_unitario, custo_unitario)
      values (
        v_user, v_id, v_prod,
        left(v_i->>'sku', 120), left(v_i->>'sku_principal', 120),
        left(coalesce(nullif(v_i->>'nome', ''), 'Produto'), 300), left(v_i->>'variacao', 200),
        greatest(1, coalesce((v_i->>'quantidade')::integer, 1)),
        coalesce((v_i->>'preco_unitario')::numeric, 0),
        nullif(v_i->>'custo_unitario', '')::numeric
      );
    end loop;

    -- Reserva: pago esperando envio, ainda não baixado.
    if v_reserva and not v_baixado and not v_reservado then
      insert into estoque_reservas (user_id, produto_id, quantidade, origem, pedido_marketplace_id)
      select v_user, produto_id, sum(quantidade)::integer, 'marketplace', v_id
        from pedidos_marketplace_itens where pedido_id = v_id and produto_id is not null
       group by produto_id;
      v_reservado := true;
    end if;

    -- Baixa: uma vez por pedido. Sem saldo suficiente, o estoque para em zero.
    if v_baixa and not v_baixado then
      for v_item in select produto_id, sum(quantidade)::integer as quantidade from pedidos_marketplace_itens
                     where pedido_id = v_id and produto_id is not null group by produto_id
      loop
        perform registrar_movimentacao_estoque(v_item.produto_id, 'saida', v_item.quantidade, left(format('Venda %s %s pedido %s', 'Shopee', v_loja, v_p->>'numero'), 300));
      end loop;
      v_baixado := true;
      v_baixas := v_baixas + 1;
    end if;

    -- Repasse no Financeiro (0085). A Shopee só paga depois de CONCLUÍDO: antes disso (e na
    -- devolução, até alguém revisar) a conta fica "aguardando liberação" e não vence. Com a
    -- data de liberação da Shopee, ela vira o vencimento; concluído sem a data, vence hoje.
    v_aguarda := v_liberado is null and v_status <> 'concluido';
    v_venc := case
      when v_liberado is not null then (v_liberado at time zone 'America/Sao_Paulo')::date
      when v_status = 'concluido' then (now() at time zone 'America/Sao_Paulo')::date
      else (coalesce(nullif(v_p->>'pago_em', '')::timestamptz, nullif(v_p->>'criado_em', '')::timestamptz, now()) at time zone 'America/Sao_Paulo')::date + 15
    end;
    if (v_pago or v_devolvido) and v_repasse > 0 then
      if v_conta is not null and exists (select 1 from contas_a_pagar_receber where id = v_conta and user_id = v_user) then
        update contas_a_pagar_receber set
          valor = v_repasse,
          data_vencimento = case
            when v_liberado is not null then v_venc
            when aguardando_liberacao and not v_aguarda then v_venc
            else data_vencimento end,
          aguardando_liberacao = v_aguarda,
          referencia_pedido_marketplace_id = v_id
         where id = v_conta and status = 'pendente';
      else
        insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento, status, aguardando_liberacao, referencia_pedido_marketplace_id)
        values (v_user, 'receber', left(format('Repasse Shopee %s — pedido %s', v_loja, v_p->>'numero'), 300), v_repasse, v_venc, 'pendente', v_aguarda, v_id)
        returning id into v_conta;
      end if;
    elsif v_conta is not null then
      -- Cancelado (ou devolvido com repasse zero): o repasse pendente sai. Já recebido, ou
      -- recebido em parte, fica como está (o dono resolve no Financeiro).
      delete from contas_a_pagar_receber
       where id = v_conta and user_id = v_user and status = 'pendente' and coalesce(valor_pago, 0) = 0;
      if found then
        v_conta := null;
      end if;
    end if;

    update pedidos_marketplace set
      status               = v_status,
      status_original      = left(v_p->>'status_original', 80),
      criado_em_plataforma = nullif(v_p->>'criado_em', '')::timestamptz,
      pago_em              = nullif(v_p->>'pago_em', '')::timestamptz,
      comprador            = left(v_p->>'comprador', 120),
      cidade               = left(v_p->>'cidade', 120),
      uf                   = left(upper(v_p->>'uf'), 2),
      rastreio             = left(v_p->>'rastreio', 80),
      subtotal             = coalesce((v_p->>'subtotal')::numeric, 0),
      desconto_vendedor    = coalesce((v_p->>'desconto_vendedor')::numeric, 0),
      cupom_vendedor       = case when v_manter then v_antigo.cupom_vendedor else coalesce((v_p->>'cupom_vendedor')::numeric, 0) end,
      comissao             = case when v_manter then v_antigo.comissao else coalesce((v_p->>'comissao')::numeric, 0) end,
      taxa_servico         = case when v_manter then v_antigo.taxa_servico else coalesce((v_p->>'taxa_servico')::numeric, 0) end,
      taxa_transacao       = case when v_manter then v_antigo.taxa_transacao else coalesce((v_p->>'taxa_transacao')::numeric, 0) end,
      taxa_outras          = case when v_manter then v_antigo.taxa_outras else coalesce((v_p->>'taxa_outras')::numeric, 0) end,
      taxas_detalhe        = case when v_manter then v_antigo.taxas_detalhe else v_detalhe end,
      taxas_origem         = case when v_manter then 'real' else v_origem end,
      escrow_liberado_em   = v_liberado,
      devolucao_revisar    = v_devolvido,
      frete_comprador      = coalesce((v_p->>'frete_comprador')::numeric, 0),
      repasse              = v_repasse,
      custo                = v_custo,
      imposto              = v_imposto,
      lucro                = case when v_manter then round(v_repasse - v_custo - v_imposto, 2) else coalesce((v_p->>'lucro')::numeric, 0) end,
      custo_incompleto     = coalesce((v_p->>'custo_incompleto')::boolean, false),
      estoque_baixado      = v_baixado,
      estoque_reservado    = v_reservado,
      conta_receber_id     = v_conta,
      atualizado_em        = now()
    where id = v_id;

    -- 0087: concluído e liberado pela Shopee → repasse recebido na conta da loja; estorno ou
    -- reembolso depois de recebido → saída na mesma conta. Idempotente.
    if liquidar_repasse_marketplace(v_user, v_id) = 'recebido' then
      v_recebidos := v_recebidos + 1;
    end if;
  end loop;

  return jsonb_build_object('novos', v_novos, 'atualizados', v_atual, 'baixas', v_baixas, 'estornos', v_estornos, 'recebidos', v_recebidos, 'armazem_id', v_armazem);
end;
$$;

revoke execute on function importar_pedidos_marketplace(uuid, jsonb) from public, anon;
grant execute on function importar_pedidos_marketplace(uuid, jsonb) to authenticated;

-- 5) Dados existentes (idempotente).
--    a) Referência pelo vínculo do pedido.
update contas_a_pagar_receber c
   set referencia_pedido_marketplace_id = p.id
  from pedidos_marketplace p
 where p.conta_receber_id = c.id
   and p.user_id = c.user_id
   and c.referencia_pedido_marketplace_id is null;

--    b) Sem vínculo: pela descrição + loja (as duas formas que a importação já gravou).
update contas_a_pagar_receber c
   set referencia_pedido_marketplace_id = p.id
  from pedidos_marketplace p
  join lojas_canal l on l.id = p.loja_id and l.user_id = p.user_id
 where c.user_id = p.user_id
   and c.tipo = 'receber'
   and c.referencia_pedido_marketplace_id is null
   and c.descricao in (format('Repasse %s — pedido %s', l.nome, p.numero), format('Repasse Shopee %s — pedido %s', l.nome, p.numero));

--    c) Pedido sem conta ligada que tem a conta achada em (b): liga, para a baixa achar.
update pedidos_marketplace p
   set conta_receber_id = c.id
  from contas_a_pagar_receber c
 where c.referencia_pedido_marketplace_id = p.id
   and c.user_id = p.user_id
   and p.conta_receber_id is null;

--    d) Repasse pendente cujo pedido não existe mais: não vence (aguarda), nunca "atrasado".
update contas_a_pagar_receber
   set aguardando_liberacao = true
 where tipo = 'receber'
   and status = 'pendente'
   and referencia_pedido_marketplace_id is null
   and not aguardando_liberacao
   and descricao ~ '^Repasse .+ — pedido \S+$';

--    e) Concluído com escrow liberado e repasse ainda pendente: recebido na conta da loja.
do $$
declare
  r record;
begin
  for r in
    select p.user_id, p.id
      from pedidos_marketplace p
     where p.repasse_recebido is null
       and p.escrow_liberado_em is not null
       and p.escrow_liberado_em <= now()
       and p.status in ('concluido', 'devolvido')
       and coalesce(p.repasse, 0) > 0
  loop
    perform liquidar_repasse_marketplace(r.user_id, r.id);
  end loop;
end $$;

NOTIFY pgrst, 'reload schema';

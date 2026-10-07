-- ============================================================
-- 0085 — Taxas REAIS da Shopee no pedido e repasse que não "vence" antes da hora.
--
--   1. pedidos_marketplace ganha o detalhamento das taxas que a plataforma cobrou de verdade
--      (get_escrow_detail → order_income): `taxa_outras` (recarga automática, afiliados,
--      frete líquido, reembolso, ajustes), `taxas_detalhe` (as linhas como a Shopee lista),
--      `taxas_origem` ('real' | 'planilha' | 'estimado') e `escrow_liberado_em`.
--      Pedido com taxa real nunca volta para "estimado" porque uma chamada falhou.
--   2. contas_a_pagar_receber.aguardando_liberacao: repasse de pedido que ainda não foi
--      concluído (ou devolvido, à espera de revisão) não está vencido. Alertas, Dashboard e
--      Calendário ignoram essas linhas; quando o pedido conclui (ou a Shopee libera), a
--      data passa a ser a da liberação.
--   3. importar_pedidos_marketplace: o repasse acompanha a renda real; cancelado remove o
--      repasse pendente; devolvido NÃO devolve o estoque sozinho (a API não diz se o item
--      voltou): o repasse fica com o valor final informado e o pedido "a revisar".
--   4. dre_mensal soma `taxa_outras` nas taxas do marketplace.
--   5. Dados existentes: repasses pendentes de pedidos não concluídos passam a aguardar;
--      os de pedidos cancelados saem. Conta já recebida (ou recebida em parte) não é tocada.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Colunas novas
alter table pedidos_marketplace add column if not exists taxa_outras numeric(12,2) not null default 0;
alter table pedidos_marketplace add column if not exists taxas_detalhe jsonb not null default '[]'::jsonb;
alter table pedidos_marketplace add column if not exists taxas_origem text;
alter table pedidos_marketplace add column if not exists escrow_liberado_em timestamptz;
alter table pedidos_marketplace add column if not exists devolucao_revisar boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_marketplace_taxas_origem_check') then
    alter table pedidos_marketplace add constraint pedidos_marketplace_taxas_origem_check
      check (taxas_origem is null or taxas_origem in ('real', 'planilha', 'estimado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pedidos_marketplace_taxas_detalhe_check') then
    alter table pedidos_marketplace add constraint pedidos_marketplace_taxas_detalhe_check
      check (jsonb_typeof(taxas_detalhe) = 'array' and jsonb_array_length(taxas_detalhe) <= 30);
  end if;
end $$;

alter table contas_a_pagar_receber add column if not exists aguardando_liberacao boolean not null default false;

-- 2) Importação (planilha e API) — mesma função da 0052, com as regras novas.
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
          aguardando_liberacao = v_aguarda
         where id = v_conta and status = 'pendente';
      else
        insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento, status, aguardando_liberacao)
        values (v_user, 'receber', left(format('Repasse Shopee %s — pedido %s', v_loja, v_p->>'numero'), 300), v_repasse, v_venc, 'pendente', v_aguarda)
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
  end loop;

  return jsonb_build_object('novos', v_novos, 'atualizados', v_atual, 'baixas', v_baixas, 'estornos', v_estornos, 'armazem_id', v_armazem);
end;
$$;

revoke execute on function importar_pedidos_marketplace(uuid, jsonb) from public, anon;
grant execute on function importar_pedidos_marketplace(uuid, jsonb) to authenticated;

-- 3) DRE: as taxas do marketplace incluem os encargos além de comissão/serviço/transação.
create or replace function dre_mensal(p_inicio date, p_fim date)
returns table (
  mes date,
  receita_bruta numeric,
  descontos numeric,
  devolucoes numeric,
  impostos numeric,
  taxas_marketplace numeric,
  taxa_maquininha numeric,
  frete numeric,
  cmv numeric,
  anuncios numeric,
  despesas numeric,
  outras_receitas numeric,
  lucro_liquido numeric,
  pedidos bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with meses as (
    select generate_series(date_trunc('month', p_inicio)::date, date_trunc('month', p_fim)::date, interval '1 month')::date as mes
  ),
  v as (
    select date_trunc('month', (data_venda at time zone 'America/Sao_Paulo'))::date as mes,
           sum(subtotal + coalesce(valor_entrega, 0)) as receita,
           sum(coalesce(desconto, 0)) as descontos,
           sum(coalesce(valor_devolvido, 0)) as devolucoes,
           sum(coalesce(imposto_valor, 0)) as impostos,
           sum(coalesce(taxa_maquineta_valor, 0)) as maquininha,
           sum(coalesce(frete_custo, 0)) as frete,
           sum(coalesce(custo_total, 0)) as cmv,
           count(*) as n
      from vendas
     where user_id = auth.uid() and status <> 'cancelada'
       and (data_venda at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
     group by 1
  ),
  m as (
    select date_trunc('month', (coalesce(pago_em, criado_em_plataforma) at time zone 'America/Sao_Paulo'))::date as mes,
           sum(subtotal) as receita,
           sum(coalesce(cupom_vendedor, 0)) as descontos,
           sum(coalesce(imposto, 0)) as impostos,
           sum(coalesce(comissao, 0) + coalesce(taxa_servico, 0) + coalesce(taxa_transacao, 0) + coalesce(taxa_outras, 0)) as taxas,
           sum(coalesce(custo, 0)) as cmv,
           count(*) as n
      from pedidos_marketplace
     where user_id = auth.uid() and status not in ('cancelado', 'devolvido', 'nao_pago')
       and coalesce(pago_em, criado_em_plataforma) is not null
       and (coalesce(pago_em, criado_em_plataforma) at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim
     group by 1
  ),
  -- Anúncio de um período que atravessa meses é rateado pelos dias de cada mês.
  a as (
    select ms.mes,
           sum(g.valor * (least(g.periodo_fim, (ms.mes + interval '1 month - 1 day')::date) - greatest(g.periodo_inicio, ms.mes) + 1)::numeric
               / (g.periodo_fim - g.periodo_inicio + 1)) as anuncios
      from meses ms
      join gastos_anuncios g on g.user_id = auth.uid()
       and g.periodo_inicio <= (ms.mes + interval '1 month - 1 day')::date
       and g.periodo_fim >= ms.mes
     group by 1
  ),
  -- Despesas que não são custo de mercadoria nem dinheiro de venda: fixas, avulsas,
  -- contas a pagar que não são compra. Compra de mercadoria entra como CMV na venda.
  d as (
    select date_trunc('month', data_movimentacao)::date as mes,
           sum(-valor) filter (where valor < 0) as despesas
      from movimentacoes_financeiras
     where user_id = auth.uid() and afeta_lucro
       and data_movimentacao between p_inicio and p_fim
       and referencia_venda_id is null
       and referencia_pedido_compra_id is null
       and coalesce(categoria, '') not in ('Compra de mercadoria', 'Devoluções', 'Repasse marketplace')
     group by 1
  ),
  juros as (
    select date_trunc('month', data_movimentacao)::date as mes, sum(valor) as outras
      from movimentacoes_financeiras
     where user_id = auth.uid() and categoria = 'Juros e multa de crediário' and valor > 0
       and data_movimentacao between p_inicio and p_fim
     group by 1
  )
  select ms.mes,
         round(coalesce(v.receita, 0) + coalesce(m.receita, 0), 2),
         round(coalesce(v.descontos, 0) + coalesce(m.descontos, 0), 2),
         round(coalesce(v.devolucoes, 0), 2),
         round(coalesce(v.impostos, 0) + coalesce(m.impostos, 0), 2),
         round(coalesce(m.taxas, 0), 2),
         round(coalesce(v.maquininha, 0), 2),
         round(coalesce(v.frete, 0), 2),
         round(coalesce(v.cmv, 0) + coalesce(m.cmv, 0), 2),
         round(coalesce(a.anuncios, 0), 2),
         round(coalesce(d.despesas, 0), 2),
         round(coalesce(juros.outras, 0), 2),
         round(
           coalesce(v.receita, 0) + coalesce(m.receita, 0)
           - coalesce(v.descontos, 0) - coalesce(m.descontos, 0)
           - coalesce(v.devolucoes, 0)
           - coalesce(v.impostos, 0) - coalesce(m.impostos, 0)
           - coalesce(m.taxas, 0) - coalesce(v.maquininha, 0) - coalesce(v.frete, 0)
           - coalesce(v.cmv, 0) - coalesce(m.cmv, 0)
           - coalesce(a.anuncios, 0) - coalesce(d.despesas, 0)
           + coalesce(juros.outras, 0), 2),
         coalesce(v.n, 0) + coalesce(m.n, 0)
    from meses ms
    left join v on v.mes = ms.mes
    left join m on m.mes = ms.mes
    left join a on a.mes = ms.mes
    left join d on d.mes = ms.mes
    left join juros on juros.mes = ms.mes
   order by ms.mes;
$$;

revoke execute on function dre_mensal(date, date) from public, anon;
grant execute on function dre_mensal(date, date) to authenticated;

-- 4) Dados existentes (idempotente; só conta PENDENTE e sem nada recebido).
--    a) Pedido ainda não concluído (ou devolvido): o repasse aguarda, sem vencer.
update contas_a_pagar_receber c
   set aguardando_liberacao = true
  from pedidos_marketplace p
 where p.conta_receber_id = c.id
   and p.user_id = c.user_id
   and c.status = 'pendente'
   and coalesce(c.valor_pago, 0) = 0
   and not c.aguardando_liberacao
   and p.status in ('a_enviar', 'enviado', 'devolvido')
   and p.escrow_liberado_em is null;

--    b) Pedido cancelado: o repasse pendente sai (a FK em pedidos_marketplace zera sozinha).
delete from contas_a_pagar_receber c
 using pedidos_marketplace p
 where p.conta_receber_id = c.id
   and p.user_id = c.user_id
   and c.status = 'pendente'
   and coalesce(c.valor_pago, 0) = 0
   and p.status in ('cancelado', 'nao_pago');

--    c) Devolvido: revisar (a plataforma não diz se o item voltou).
update pedidos_marketplace set devolucao_revisar = true
 where status = 'devolvido' and not devolucao_revisar;

create index if not exists contas_pr_aguardando_idx on contas_a_pagar_receber (user_id) where aguardando_liberacao;

NOTIFY pgrst, 'reload schema';

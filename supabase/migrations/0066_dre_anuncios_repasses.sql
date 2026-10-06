-- ============================================================
-- 0066 — Lucro de verdade: gasto com anúncios, conciliação de repasses dos marketplaces e
-- resultado do mês (DRE gerencial) (Fase 13.3).
--
--   * gastos_anuncios: o que foi gasto em anúncio por período (relatório do Shopee Ads
--     importado ou lançamento manual). Reimportar o mesmo período não duplica.
--   * pedidos_marketplace + repasse_recebido / repasse_recebido_em: o que a plataforma
--     pagou de verdade. `conciliar_repasses` grava, compara com o esperado e dá baixa na
--     conta a receber do repasse (o dinheiro entra na conta escolhida).
--   * dre_mensal: receita, deduções, custo, anúncios, despesas e lucro líquido por mês,
--     somados no banco (numeric é exato e não depende do que a tela carregou).
--   * Descrição do repasse deixa de dizer "Shopee" para pedido do Mercado Livre.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Gasto com anúncios
create table if not exists gastos_anuncios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  periodo_inicio date not null,
  periodo_fim date not null,
  loja_id uuid references lojas_canal(id) on delete set null,
  canal text not null default 'Shopee' check (length(canal) between 1 and 60),
  campanha text not null default '' check (length(campanha) <= 200),
  produto_id uuid references produtos(id) on delete set null,
  sku text check (sku is null or length(sku) <= 100),
  valor numeric(12,2) not null check (valor >= 0),
  pedidos integer check (pedidos is null or pedidos >= 0),
  vendas numeric(12,2) check (vendas is null or vendas >= 0),
  origem text not null default 'manual' check (origem in ('shopee_ads', 'manual')),
  criado_em timestamptz not null default now(),
  check (periodo_fim >= periodo_inicio)
);

-- Reimportar o mesmo relatório substitui em vez de somar de novo.
create unique index if not exists gastos_anuncios_unico
  on gastos_anuncios (user_id, periodo_inicio, periodo_fim, coalesce(loja_id, '00000000-0000-0000-0000-000000000000'::uuid), canal, campanha);
create index if not exists gastos_anuncios_periodo_idx on gastos_anuncios (user_id, periodo_inicio, periodo_fim);

alter table gastos_anuncios enable row level security;
drop policy if exists "dono_gastos_anuncios" on gastos_anuncios;
create policy "dono_gastos_anuncios" on gastos_anuncios for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists gastos_anuncios_vinculo on gastos_anuncios;
create trigger gastos_anuncios_vinculo before insert or update of loja_id, produto_id on gastos_anuncios
for each row execute function validar_vinculo_do_dono('loja_id', 'lojas_canal', 'produto_id', 'produtos');

-- 2) Repasse recebido de verdade
alter table pedidos_marketplace add column if not exists repasse_recebido numeric(12,2);
alter table pedidos_marketplace add column if not exists repasse_recebido_em date;
create index if not exists pedidos_marketplace_repasse_idx on pedidos_marketplace (user_id, repasse_recebido_em);

-- p_itens: [{"numero": "...", "valor": 12.34, "data": "2026-10-01"}]
-- pedidos_marketplace só tem policy de leitura (a escrita é sempre por RPC): por isso
-- security definer, com o dono conferido em cada linha.
create or replace function conciliar_repasses(p_itens jsonb, p_conta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_ped pedidos_marketplace%rowtype;
  v_valor numeric;
  v_data date;
  v_cpr contas_a_pagar_receber%rowtype;
  v_saida jsonb := '[]'::jsonb;
  v_status text;
  v_tem_cpr boolean;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not conta_ativa() then
    raise exception 'Conta sem acesso no momento.';
  end if;
  if p_conta_id is null or not exists (select 1 from contas where id = p_conta_id and user_id = v_user) then
    raise exception 'Escolha a conta onde o repasse caiu.';
  end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) > 5000 then
    raise exception 'No máximo 5.000 pedidos por vez.';
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_valor := round((v_item->>'valor')::numeric, 2);
    v_data := coalesce(nullif(v_item->>'data', '')::date, current_date);
    select * into v_ped from pedidos_marketplace
     where user_id = v_user and numero = trim(v_item->>'numero')
     order by criado_em_plataforma desc nulls last limit 1;

    if not found then
      v_status := 'nao_encontrado';
    elsif v_ped.repasse_recebido is not null then
      v_status := 'ja_conciliado';
    else
      update pedidos_marketplace set repasse_recebido = v_valor, repasse_recebido_em = v_data where id = v_ped.id;

      -- Baixa a conta a receber do repasse (se ainda estiver aberta) e põe o dinheiro na conta.
      select * into v_cpr from contas_a_pagar_receber where id = v_ped.conta_receber_id and user_id = v_user for update;
      v_tem_cpr := found;
      if v_tem_cpr and v_cpr.status = 'pendente' then
        update contas_a_pagar_receber
           set status = 'recebido', valor_pago = v_valor, data_pagamento = v_data, conta_id = p_conta_id
         where id = v_cpr.id;
      end if;
      -- Conta a receber já dada como recebida à mão: o dinheiro já entrou, não lança de novo.
      if not v_tem_cpr or v_cpr.status = 'pendente' then
        if v_valor > 0 then
          insert into movimentacoes_financeiras (user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro, data_movimentacao)
          values (v_user, 'entrada', v_valor, left(format('Repasse do pedido %s', v_ped.numero), 300), 'Repasse', 'Repasse marketplace', p_conta_id, true, v_data);
          update contas set saldo = saldo + v_valor where id = p_conta_id and user_id = v_user;
        end if;
      end if;
      v_status := case when abs(v_valor - coalesce(v_ped.repasse, 0)) <= 0.05 then 'conciliado' else 'divergente' end;
    end if;

    v_saida := v_saida || jsonb_build_object(
      'numero', v_item->>'numero',
      'status', v_status,
      'esperado', case when v_ped.id is not null then v_ped.repasse end,
      'recebido', v_valor
    );
    v_ped := null;
  end loop;
  return v_saida;
end;
$$;

revoke execute on function conciliar_repasses(jsonb, uuid) from public, anon;
grant execute on function conciliar_repasses(jsonb, uuid) to authenticated;

-- 3) Resultado do mês (DRE gerencial)
drop function if exists dre_mensal(date, date);
create function dre_mensal(p_inicio date, p_fim date)
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
           sum(coalesce(comissao, 0) + coalesce(taxa_servico, 0) + coalesce(taxa_transacao, 0)) as taxas,
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

-- 4) "Repasse Shopee <loja>" também saía em pedido do Mercado Livre: fica "Repasse <loja>".
create or replace function ajustar_descricao_repasse()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.descricao like 'Repasse Shopee %' then
    new.descricao := 'Repasse ' || substr(new.descricao, 16);
  end if;
  return new;
end;
$$;

drop trigger if exists contas_pr_descricao_repasse on contas_a_pagar_receber;
create trigger contas_pr_descricao_repasse before insert on contas_a_pagar_receber
for each row execute function ajustar_descricao_repasse();

NOTIFY pgrst, 'reload schema';

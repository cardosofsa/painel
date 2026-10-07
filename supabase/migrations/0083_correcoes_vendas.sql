-- ============================================================
-- 0083: correções de Vendas (auditoria de vendas).
--
--  1) editar_venda recalcula imposto (imposto_pct × (subtotal − desconto − devolvido)) e taxa
--     de maquininha (pct × (total − entrada)) e tira os dois do lucro — antes ficavam os da
--     venda original e o lucro voltava a ser só subtotal − desconto − custo.
--  2) editar_venda no crediário com entrada: a conta a receber vira total − entrada (antes
--     virava o total cheio e o cliente devia a entrada duas vezes). No ramo "já recebido",
--     ajusta o lançamento de recebimento, não o primeiro lançamento qualquer da venda.
--  3) editar_venda RECUSA venda parcelada no crediário, venda com devolução e venda paga com
--     crédito de troca: as parcelas, o estorno e o crédito não seriam refeitos. Cancele e refaça.
--  4) cancelar_venda depois de devolução: repõe só o que não foi devolvido e o reembolso já
--     feito não sai do caixa duas vezes.
--  5) Crédito de troca vira forma de pagamento (vendas.credito_troca), não desconto: a nova
--     venda tem receita e lucro cheios e o crédito não entra no caixa.
--  6) Custo de kit/insumo que aponta para outro produto (produtoId) usa o custo ATUAL do
--     componente, e mudar o custo do componente recalcula quem o usa (sem recursão infinita).
--  7) marcar_parcela_paga aceita pagamento parcial: a parcela segue pendente acumulando
--     valor_pago até quitar; a conta a receber grava a soma real recebida.
--  8) Datas em Brasília nos lançamentos (registrar_venda, marcar_parcela_paga, receber_conta,
--     registrar_devolucao) e, na venda offline, a data em que ela foi feita.
--  9) raio_x_vendas ignora pedido de marketplace 'nao_pago', como o DRE.
-- 10) vendas.lucro igual ao DRE (decisão do dono):
--       lucro = subtotal − desconto + entrega − custo_total − imposto − taxa_maquineta
--               − frete_custo − valor_devolvido
--     Um gatilho em `vendas` aplica a conta em toda gravação (inclusive quando a etiqueta
--     grava frete_custo), e as vendas existentes são recalculadas uma vez.
-- 11) Troco no PDV: vendas.valor_recebido e vendas.troco (o caixa recebe o valor da venda;
--     o troco só vai para o comprovante).
-- 12) Devolução estorna o imposto: imposto_valor cai na proporção do valor devolvido.
--
-- Fora daqui (decisão do dono): as regras de marketplace não mudam.
--
-- Idempotente: pode rodar de novo por cima. Termina com NOTIFY.
-- ============================================================

-- ------------------------------------------------------------
-- 0) Colunas do crédito de troca
-- ------------------------------------------------------------
alter table vendas add column if not exists credito_troca numeric(12,2) not null default 0;
alter table vendas add column if not exists troca_devolucao_id uuid references devolucoes(id) on delete set null;
-- Troco (só informativo: o caixa recebe o valor da venda, não o que o cliente entregou).
alter table vendas add column if not exists valor_recebido numeric(12,2);
alter table vendas add column if not exists troco numeric(12,2) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vendas_credito_troca_nao_negativo') then
    alter table vendas add constraint vendas_credito_troca_nao_negativo check (credito_troca >= 0);
  end if;
end $$;

create index if not exists vendas_troca_devolucao_idx on vendas (troca_devolucao_id) where troca_devolucao_id is not null;

-- A troca de origem tem que ser da mesma conta (mesmo padrão da 0026).
drop trigger if exists trg_valida_vinculo_vendas_troca on vendas;
create trigger trg_valida_vinculo_vendas_troca
  before insert or update of troca_devolucao_id on vendas
  for each row execute function validar_vinculo_do_dono('troca_devolucao_id', 'devolucoes');

-- ------------------------------------------------------------
-- 0b) vendas.lucro = a conta do DRE, sempre.
--     O DRE (dre_mensal) soma, por venda: subtotal + entrega − desconto − devolvido − imposto
--     − maquininha − frete − custo. O lucro gravado passa a ser exatamente isso, calculado
--     por um gatilho em toda gravação que mexe num desses campos: as RPCs, a etiqueta de
--     frete (frete-actions grava frete_custo direto pelo PostgREST) e qualquer UPDATE de
--     `lucro` feito à mão — o valor escrito é ignorado, como `produtos.custo` (0029).
-- ------------------------------------------------------------
create or replace function calcular_lucro_venda()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.lucro := round(
      coalesce(new.subtotal, 0) - coalesce(new.desconto, 0) + coalesce(new.valor_entrega, 0)
    - coalesce(new.custo_total, 0) - coalesce(new.imposto_valor, 0) - coalesce(new.taxa_maquineta_valor, 0)
    - coalesce(new.frete_custo, 0) - coalesce(new.valor_devolvido, 0), 2);
  return new;
end;
$$;

revoke execute on function calcular_lucro_venda() from public, anon, authenticated;

drop trigger if exists trg_lucro_venda on vendas;
create trigger trg_lucro_venda
  before insert or update of subtotal, desconto, valor_entrega, custo_total, imposto_valor,
    taxa_maquineta_valor, frete_custo, valor_devolvido, lucro
  on vendas
  for each row execute function calcular_lucro_venda();

-- Uma vez: as vendas existentes passam a valer a mesma conta. Um UPDATE só, que reescreve a
-- conta inteira a partir das colunas (não do lucro antigo): rodar de novo não muda nada.
update vendas
   set lucro = round(
         coalesce(subtotal, 0) - coalesce(desconto, 0) + coalesce(valor_entrega, 0)
       - coalesce(custo_total, 0) - coalesce(imposto_valor, 0) - coalesce(taxa_maquineta_valor, 0)
       - coalesce(frete_custo, 0) - coalesce(valor_devolvido, 0), 2)
 where status <> 'cancelada'
   and lucro is distinct from round(
         coalesce(subtotal, 0) - coalesce(desconto, 0) + coalesce(valor_entrega, 0)
       - coalesce(custo_total, 0) - coalesce(imposto_valor, 0) - coalesce(taxa_maquineta_valor, 0)
       - coalesce(frete_custo, 0) - coalesce(valor_devolvido, 0), 2);

-- ------------------------------------------------------------
-- 1) registrar_venda: crédito de troca, troco, lucro com entrega + datas em Brasília
--    Ganha três parâmetros no fim (com default): a assinatura muda, então DROP explícito
--    antes — senão ficariam duas versões e a chamada por nome daria "ambígua".
-- ------------------------------------------------------------
drop function if exists registrar_venda(jsonb, text, uuid, uuid, text, numeric, numeric, text, date, numeric, text, text, integer, numeric, integer, integer, boolean);
drop function if exists registrar_venda(jsonb, text, uuid, uuid, text, numeric, numeric, text, date, numeric, text, text, integer, numeric, integer, integer, boolean, numeric, uuid);

create or replace function registrar_venda(
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
  p_dias_entre_parcelas integer default 30,
  p_reservar boolean default false,
  p_credito_troca numeric default 0,
  p_troca_devolucao_id uuid default null,
  p_valor_recebido numeric default null
)
returns table (venda_id uuid, venda_numero text, venda_total numeric, venda_lucro numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user             uuid := auth.uid();
  v_hoje             date := (now() at time zone 'America/Sao_Paulo')::date;
  v_venda            vendas%rowtype;
  v_subtotal         numeric := 0;
  v_custo_total      numeric := 0;
  v_desconto         numeric := round(coalesce(p_desconto, 0), 2);
  v_entrega          numeric := round(coalesce(p_valor_entrega, 0), 2);
  v_total            numeric;
  v_lucro            numeric;
  v_aliquota         numeric;
  v_imposto          numeric;
  v_cliente_nome     text;
  v_permite_fiado    boolean;
  v_produtos_ok      integer;
  v_produtos_pedidos integer;
  v_falta_nome       text;
  v_falta_estoque    integer;
  v_falta_qtd        integer;
  v_entrada          numeric := round(coalesce(p_entrada_valor, 0), 2);
  v_credito          numeric := round(coalesce(p_credito_troca, 0), 2);
  v_credito_livre    numeric;
  v_troca_numero     text;
  v_troca            record;
  v_restante         numeric;
  v_taxa_maquineta   numeric := 0;
  v_forma_e_cartao   boolean;
  v_forma_label      text;
  v_limite_fiado     numeric;
  v_fiado_em_uso     numeric;
  v_parcela_valor    numeric;
  v_i                integer;
  v_falta            boolean := false;
  v_em_dinheiro      numeric := 0;
  v_recebido         numeric := round(p_valor_recebido, 2);
  v_troco            numeric := 0;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo para registrar a venda.';
  end if;

  if p_status not in ('paga', 'fiado') then
    raise exception 'Status de venda inválido: %', p_status;
  end if;

  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'A venda precisa ter pelo menos um item.';
  end if;

  if v_desconto < 0 or v_entrega < 0 then
    raise exception 'Desconto e entrega não podem ser negativos.';
  end if;

  if v_entrada < 0 then
    raise exception 'O valor da entrada não pode ser negativo.';
  end if;

  if v_entrada > 0 and p_entrada_forma not in ('dinheiro', 'pix') then
    raise exception 'A entrada só pode ser em dinheiro ou pix.';
  end if;

  -- 0083: crédito de troca. É pagamento (o cliente já pagou na venda de origem), não
  -- desconto: a venda nova fica com receita e lucro cheios e o crédito não entra no caixa.
  if v_credito < 0 then
    raise exception 'O crédito de troca não pode ser negativo.';
  end if;
  if v_credito > 0 then
    if p_troca_devolucao_id is null then
      raise exception 'Informe de qual troca vem o crédito.';
    end if;
    -- Duas vendas usando o mesmo crédito ao mesmo tempo: a segunda espera a primeira.
    perform pg_advisory_xact_lock(hashtext('credito_troca:' || p_troca_devolucao_id::text));
    select d.id, d.numero, d.forma, d.valor_estorno into v_troca
      from devolucoes d where d.id = p_troca_devolucao_id and d.user_id = v_user;
    if not found then
      raise exception 'A troca do crédito não foi encontrada.';
    end if;
    if v_troca.forma <> 'troca' then
      raise exception 'A devolução % não gerou crédito de troca.', v_troca.numero;
    end if;
    select v_troca.valor_estorno - coalesce(sum(v.credito_troca), 0) into v_credito_livre
      from vendas v
     where v.troca_devolucao_id = p_troca_devolucao_id and v.user_id = v_user and v.status <> 'cancelada';
    if v_credito > v_credito_livre + 0.005 then
      raise exception 'O crédito da troca % tem só R$ % disponível.', v_troca.numero, to_char(greatest(v_credito_livre, 0), 'FM999G999G990D00');
    end if;
    v_troca_numero := v_troca.numero;
  end if;

  if p_parcelas_fiado is null or p_parcelas_fiado < 1 then
    p_parcelas_fiado := 1;
  end if;
  if p_parcelas_fiado > 24 then
    raise exception 'Máximo de 24 parcelas.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_itens) i
    where (i->>'quantidade')::integer <= 0 or (i->>'preco_unitario')::numeric < 0
  ) then
    raise exception 'Todo item precisa de quantidade maior que zero e preço não negativo.';
  end if;

  -- 1. Trava as linhas de produto da venda em ordem crescente de id. A ordem
  --    importa: dois caixas vendendo itens em comum travariam em ordens
  --    diferentes e dariam deadlock.
  perform 1
  from produtos p
  where p.user_id = v_user
    and p.id in (select distinct (i->>'produto_id')::uuid from jsonb_array_elements(p_itens) i)
  order by p.id
  for update;

  -- Item apagado, ou de outro usuário, sai do join em silêncio e ficaria sem
  -- baixa de estoque. Conferir a contagem fecha esse buraco.
  select count(*) into v_produtos_ok
  from produtos p
  where p.user_id = v_user
    and p.id in (select distinct (i->>'produto_id')::uuid from jsonb_array_elements(p_itens) i);

  select count(distinct (i->>'produto_id')::uuid) into v_produtos_pedidos
  from jsonb_array_elements(p_itens) i;

  if v_produtos_ok <> v_produtos_pedidos then
    raise exception 'Um ou mais produtos da venda não existem mais ou não pertencem a você.';
  end if;

  -- 2. Valida o saldo com as quantidades AGREGADAS por produto: o mesmo SKU
  --    pode entrar em mais de uma linha do carrinho, e validar linha a linha
  --    deixaria passar 3 + 3 com estoque 5.
  -- 0052: o que vale é o DISPONÍVEL (físico − reservado por pedidos na esteira).
  select p.nome || coalesce(' — ' || p.variante_nome, ''),
         p.estoque - coalesce((select sum(r.quantidade) from estoque_reservas r where r.produto_id = p.id), 0),
         agg.qtd
  into v_falta_nome, v_falta_estoque, v_falta_qtd
  from (
    select (i->>'produto_id')::uuid as produto_id,
           sum((i->>'quantidade')::integer) as qtd
    from jsonb_array_elements(p_itens) i
    group by 1
  ) agg
  join produtos p on p.id = agg.produto_id and p.user_id = v_user
  where p.estoque - coalesce((select sum(r.quantidade) from estoque_reservas r where r.produto_id = p.id), 0) < agg.qtd
  limit 1;

  if found then
    if p_reservar then
      -- Pedido da esteira sem estoque não trava: entra em "Para Reservar" sem reserva.
      v_falta := true;
    else
      raise exception 'Estoque insuficiente de "%": disponível %, pedido %.',
        v_falta_nome, v_falta_estoque, v_falta_qtd;
    end if;
  end if;

  -- 3. Totais. O custo vem das linhas já travadas.
  select coalesce(sum(round((i->>'preco_unitario')::numeric * (i->>'quantidade')::integer, 2)), 0)
  into v_subtotal
  from jsonb_array_elements(p_itens) i;

  select coalesce(sum(round(p.custo * (i->>'quantidade')::integer, 2)), 0)
  into v_custo_total
  from jsonb_array_elements(p_itens) i
  join produtos p on p.id = (i->>'produto_id')::uuid and p.user_id = v_user;

  if v_desconto > v_subtotal then
    raise exception 'O desconto (%) é maior que o valor dos itens (%).', v_desconto, v_subtotal;
  end if;

  select aliquota_das into v_aliquota from perfil_negocio where user_id = v_user;
  v_imposto := round(coalesce(v_aliquota, 0) / 100 * (v_subtotal - v_desconto), 2);

  v_total := round(v_subtotal - v_desconto + v_entrega, 2);

  if v_entrada > v_total then
    raise exception 'A entrada (%) não pode ser maior que o total da venda (%).', v_entrada, v_total;
  end if;
  if v_credito > 0 and v_entrada + v_credito > v_total + 0.005 then
    raise exception 'O crédito de troca (%) mais a entrada (%) passam do total da venda (%).', v_credito, v_entrada, v_total;
  end if;
  v_restante := greatest(round(v_total - v_entrada - v_credito, 2), 0);

  -- Taxa de maquineta: só faz sentido quando a forma que fecha o restante é cartão de
  -- crédito. Reduz o lucro, não o valor creditado no caixa — mesmo padrão do imposto: o
  -- caixa recebe o valor cheio, é o lucro que sente o desconto.
  if p_taxa_maquineta_pct > 0 then
    select exists (
      select 1 from formas_pagamento
      where user_id = v_user
        and nome = coalesce(p_forma_pagamento_2, p_forma_pagamento)
        and tipo = 'cartao_credito'
    ) into v_forma_e_cartao;

    if not v_forma_e_cartao then
      raise exception 'Taxa de maquineta só se aplica a cartão de crédito.';
    end if;

    v_taxa_maquineta := round(v_restante * p_taxa_maquineta_pct / 100, 2);
  end if;

  -- 0083: a conta do DRE (o gatilho trg_lucro_venda grava a mesma; aqui é para o retorno).
  v_lucro := round(v_subtotal - v_desconto + v_entrega - v_custo_total - v_imposto - v_taxa_maquineta, 2);

  -- 0083: troco. Vale só para a parte paga AGORA em dinheiro (entrada em dinheiro e/ou o
  -- restante, quando a venda é paga e a forma do restante é do tipo dinheiro). O caixa
  -- recebe o valor da venda; o troco fica gravado só para o comprovante.
  if v_recebido is not null and v_recebido > 0 then
    v_em_dinheiro := case when v_entrada > 0 and p_entrada_forma = 'dinheiro' then v_entrada else 0 end;
    if p_status = 'paga' and v_restante > 0 and exists (
      select 1 from formas_pagamento
       where user_id = v_user and nome = coalesce(p_forma_pagamento_2, p_forma_pagamento) and tipo = 'dinheiro'
    ) then
      v_em_dinheiro := v_em_dinheiro + v_restante;
    end if;
    if v_em_dinheiro <= 0 then
      v_recebido := null;
    elsif v_recebido + 0.005 < v_em_dinheiro then
      raise exception 'O valor recebido (R$ %) é menor que a parte em dinheiro (R$ %).',
        to_char(v_recebido, 'FM999G999G990D00'), to_char(v_em_dinheiro, 'FM999G999G990D00');
    else
      v_troco := round(v_recebido - v_em_dinheiro, 2);
    end if;
  else
    v_recebido := null;
  end if;

  -- Rótulo pronto para exibir em Vendas e no comprovante — o resto do sistema que já lê
  -- `vendas.forma_pagamento` continua funcionando sem mudança nenhuma.
  if v_entrada > 0 then
    v_forma_label := initcap(p_entrada_forma) || ' (entrada)';
    if p_forma_pagamento_2 is not null then
      v_forma_label := v_forma_label || ' + ' || p_forma_pagamento_2;
    end if;
  else
    v_forma_label := p_forma_pagamento;
  end if;
  if p_parcelas_cartao is not null and p_parcelas_cartao > 1 then
    v_forma_label := v_forma_label || ' ' || p_parcelas_cartao::text || 'x';
  end if;
  if v_taxa_maquineta > 0 then
    v_forma_label := v_forma_label || format(' — taxa maquineta %s%%', p_taxa_maquineta_pct);
  end if;
  if v_credito > 0 then
    v_forma_label := 'Crédito de troca ' || v_troca_numero
      || case when (v_restante > 0 or v_entrada > 0) and v_forma_label is not null then ' + ' || v_forma_label else '' end;
  end if;

  -- 4. Cliente e regras de fiado.
  if p_cliente_id is not null then
    select nome, permite_fiado into v_cliente_nome, v_permite_fiado
    from clientes
    where id = p_cliente_id and user_id = v_user;

    if not found then
      raise exception 'Cliente não encontrado ou não pertence a você.';
    end if;
  end if;

  if p_status = 'fiado' then
    if p_cliente_id is null then
      raise exception 'Venda fiado precisa de um cliente identificado.';
    end if;
    if not v_permite_fiado then
      raise exception 'O cliente "%" não está autorizado a comprar fiado.', v_cliente_nome;
    end if;

    if v_restante > 0 then
      select limite_fiado into v_limite_fiado from clientes where id = p_cliente_id and user_id = v_user;
      select fiado_em_uso_cliente(p_cliente_id) into v_fiado_em_uso;

      if v_restante + coalesce(v_fiado_em_uso, 0) > coalesce(v_limite_fiado, 0) then
        raise exception 'Limite de fiado insuficiente para "%": disponível %, necessário %.',
          v_cliente_nome, coalesce(v_limite_fiado, 0) - coalesce(v_fiado_em_uso, 0), v_restante;
      end if;
    end if;
  elsif p_conta_id is null and v_restante > 0 then
    raise exception 'Escolha a conta que vai receber o valor da venda.';
  end if;

  if v_entrada > 0 and p_conta_id is null then
    raise exception 'Escolha a conta que vai receber a entrada.';
  end if;

  -- 5. A venda (o número vem do trigger).
  insert into vendas (
    user_id, cliente_id, cliente_nome, status, subtotal, desconto, valor_entrega,
    total, custo_total, lucro, forma_pagamento, conta_id, observacao,
    imposto_pct, imposto_valor,
    entrada_valor, entrada_forma, forma_pagamento_2, parcelas_cartao,
    taxa_maquineta_pct, taxa_maquineta_valor,
    etapa, estoque_baixado,
    credito_troca, troca_devolucao_id,
    valor_recebido, troco
  ) values (
    v_user, p_cliente_id, v_cliente_nome, p_status, v_subtotal, v_desconto, v_entrega,
    v_total, v_custo_total, v_lucro, v_forma_label, p_conta_id, p_observacao,
    coalesce(v_aliquota, 0) / 100, v_imposto,
    v_entrada, p_entrada_forma, p_forma_pagamento_2, p_parcelas_cartao,
    p_taxa_maquineta_pct, v_taxa_maquineta,
    -- Balcão (sem reserva): o gatilho decide (com entrega = Enviado, sem = Concluído).
    case when p_reservar then (case when v_falta then 'reservar' else 'enviar' end) else null end,
    not p_reservar,
    v_credito, case when v_credito > 0 then p_troca_devolucao_id end,
    v_recebido, v_troco
  )
  returning * into v_venda;

  -- 6. Itens, com snapshot de nome (já com a variante), SKU, preço e custo.
  insert into venda_itens (
    venda_id, produto_id, produto_nome, produto_sku, quantidade, preco_unitario, custo_unitario,
    garantia_dias
  )
  select v_venda.id,
         p.id,
         p.nome || coalesce(' — ' || p.variante_nome, ''),
         p.sku,
         (i->>'quantidade')::integer,
         round((i->>'preco_unitario')::numeric, 2),
         p.custo,
         nullif((i->>'garantia_dias')::integer, 0)
  from jsonb_array_elements(p_itens) i
  join produtos p on p.id = (i->>'produto_id')::uuid and p.user_id = v_user;

  -- 7. Baixa de estoque — sem greatest(0, ...): se chegou aqui há saldo, e a
  --    constraint produtos_estoque_nao_negativo aborta a transação se não houver.
  --    0052: pedido da esteira só RESERVA; a baixa acontece ao passar para Imprimir.
  if p_reservar then
    if not v_falta then
      insert into estoque_reservas (user_id, produto_id, quantidade, origem, venda_id)
      select v_user, (i->>'produto_id')::uuid, sum((i->>'quantidade')::integer), 'venda', v_venda.id
        from jsonb_array_elements(p_itens) i
       group by (i->>'produto_id')::uuid;
    end if;
  else
  update produtos p
  set estoque = p.estoque - agg.qtd
  from (
    select (i->>'produto_id')::uuid as produto_id,
           sum((i->>'quantidade')::integer) as qtd
    from jsonb_array_elements(p_itens) i
    group by 1
  ) agg
  where p.id = agg.produto_id and p.user_id = v_user;

  insert into estoque_movimentacoes (
    user_id, produto_id, produto_nome, tipo, quantidade, motivo, data_movimentacao
  )
  select v_user,
         p.id,
         p.nome || coalesce(' — ' || p.variante_nome, ''),
         'saida',
         (i->>'quantidade')::integer,
         'Venda ' || v_venda.numero,
         now()
  from jsonb_array_elements(p_itens) i
  join produtos p on p.id = (i->>'produto_id')::uuid and p.user_id = v_user;
  end if;

  -- 8a. Entrada: dinheiro que já entrou de verdade, registrada na hora, independente do
  --     status final da venda (paga ou fiado).
  if v_entrada > 0 then
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id
    ) values (
      v_user, 'entrada', v_entrada,
      'Entrada — venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
      'PDV', 'Entrada de venda', p_conta_id, true, v_hoje, v_venda.id
    );

    update contas set saldo = saldo + v_entrada where id = p_conta_id and user_id = v_user;
    if not found then
      raise exception 'Conta não encontrada ou não pertence ao usuário atual';
    end if;
  end if;

  -- 8b. O restante: entra agora (paga) ou vira dívida do cliente (fiado), parcelada ou não.
  --     O crédito de troca já saiu do restante: não entra no caixa nem vira dívida.
  if p_status = 'paga' then
    if v_restante > 0 then
      insert into movimentacoes_financeiras (
        user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
        data_movimentacao, referencia_venda_id
      ) values (
        v_user, 'entrada', v_restante,
        'Venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
        'PDV', 'Vendas', p_conta_id, true, v_hoje, v_venda.id
      );

      update contas set saldo = saldo + v_restante where id = p_conta_id and user_id = v_user;
      if not found then
        raise exception 'Conta não encontrada ou não pertence ao usuário atual';
      end if;
    end if;
  elsif v_restante > 0 then
    if p_parcelas_fiado <= 1 then
      -- Fiado sem parcelamento: exatamente como sempre foi.
      insert into contas_a_pagar_receber (
        user_id, tipo, descricao, valor, data_vencimento, status, conta_id,
        cliente_id, referencia_venda_id
      ) values (
        v_user, 'receber',
        'Fiado — venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
        v_restante, coalesce(p_data_vencimento, v_hoje + 30), 'pendente', p_conta_id,
        p_cliente_id, v_venda.id
      );
    else
      -- Fiado parcelado: uma linha "pai" em contas_a_pagar_receber (é a que aparece na
      -- lista principal do Financeiro) e uma linha por parcela em venda_parcelas. O resto
      -- do arredondamento (centavos que não dividem exato) vai pra última parcela.
      v_parcela_valor := round(v_restante / p_parcelas_fiado, 2);
      for v_i in 1..p_parcelas_fiado loop
        insert into venda_parcelas (user_id, venda_id, numero, total_parcelas, valor, data_vencimento)
        values (
          v_user, v_venda.id, v_i, p_parcelas_fiado,
          case
            when v_i = p_parcelas_fiado then round(v_restante - v_parcela_valor * (p_parcelas_fiado - 1), 2)
            else v_parcela_valor
          end,
          coalesce(p_data_vencimento, v_hoje + 30) + (v_i - 1) * p_dias_entre_parcelas
        );
      end loop;

      insert into contas_a_pagar_receber (
        user_id, tipo, descricao, valor, data_vencimento, status, conta_id,
        cliente_id, referencia_venda_id
      ) values (
        v_user, 'receber',
        format('Fiado — venda %s%s (%s parcelas)', v_venda.numero, coalesce(' — ' || v_cliente_nome, ''), p_parcelas_fiado),
        v_restante, coalesce(p_data_vencimento, v_hoje + 30), 'pendente', p_conta_id,
        p_cliente_id, v_venda.id
      );

      update vendas set total_parcelas_fiado = p_parcelas_fiado where id = v_venda.id;
    end if;
  end if;

  return query select v_venda.id, v_venda.numero, v_total, v_lucro;
end;
$$;

-- ------------------------------------------------------------
-- 2) registrar_venda_offline: lançamentos e vencimentos na data em que a venda foi feita,
--    e o valor recebido (troco). Mesmo retorno da 0060; o parâmetro novo muda a assinatura,
--    então DROP explícito da versão antiga.
-- ------------------------------------------------------------
drop function if exists registrar_venda_offline(uuid, timestamptz, jsonb, text, uuid, uuid, text, numeric, numeric, text, date, numeric, text, text, integer, numeric, integer, integer);

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
  p_dias_entre_parcelas integer default 30,
  p_valor_recebido numeric default null
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
  v_dia  date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
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
    p_taxa_maquineta_pct => p_taxa_maquineta_pct, p_parcelas_fiado => p_parcelas_fiado, p_dias_entre_parcelas => p_dias_entre_parcelas,
    p_valor_recebido => p_valor_recebido
  );

  -- Data real da venda (até 30 dias para trás; nunca no futuro).
  if p_feita_em is not null and p_feita_em <= now() + interval '5 minutes' and p_feita_em > now() - interval '30 days' then
    update vendas set data_venda = p_feita_em where id = v_r.venda_id and user_id = v_user;
    -- 0083: o caixa e o crediário também ficam no dia (de Brasília) em que a venda foi feita.
    v_dia := (p_feita_em at time zone 'America/Sao_Paulo')::date;
    if v_dia <> v_hoje then
      update movimentacoes_financeiras set data_movimentacao = v_dia
       where referencia_venda_id = v_r.venda_id and user_id = v_user;
      if p_data_vencimento is null then
        update contas_a_pagar_receber set data_vencimento = data_vencimento + (v_dia - v_hoje)
         where referencia_venda_id = v_r.venda_id and user_id = v_user;
        update venda_parcelas vp set data_vencimento = vp.data_vencimento + (v_dia - v_hoje)
         where vp.venda_id = v_r.venda_id and vp.user_id = v_user;
      end if;
    end if;
  end if;

  insert into vendas_offline (chave, user_id, venda_id) values (p_chave, v_user, v_r.venda_id);
  return query select v_r.venda_id, v_r.venda_numero, v_r.venda_total, v_r.venda_lucro, false;
end;
$$;

-- ------------------------------------------------------------
-- 3) editar_venda (0077 + remendo da 0081: PIN pelo `tem_pin_admin()`, erro de PIN no corpo
--    com status 400). Mesmo retorno (jsonb): create or replace basta.
-- ------------------------------------------------------------
create or replace function editar_venda(
  p_venda_id uuid,
  p_cliente_id uuid,
  p_forma_pagamento text,
  p_observacao text,
  p_desconto numeric,
  p_valor_entrega numeric,
  p_pin text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_user         uuid := auth.uid();
  v_hoje         date := (now() at time zone 'America/Sao_Paulo')::date;
  v_hash         text;
  v_pin          text;
  v_venda        vendas%rowtype;
  v_cliente_nome text;
  v_desconto     numeric := round(coalesce(p_desconto, 0), 2);
  v_entrega      numeric := round(coalesce(p_valor_entrega, 0), 2);
  v_total_novo   numeric;
  v_lucro_novo   numeric;
  v_imposto_novo numeric;
  v_taxa_nova    numeric;
  v_receber_novo numeric;
  v_delta        numeric;
  v_mov          record;
  v_cpr          record;
begin
  -- O PIN é conferido ANTES de qualquer leitura ou escrita.
  v_hash := case when tem_pin_admin() then 'cadastrado' end;
  if v_hash is null then
    raise exception 'Cadastre um PIN de administração em Configurações → Conta antes de editar uma venda.';
  end if;
  v_pin := pin_admin_checar(p_pin);
  if v_pin = 'bloqueado' then
    raise exception 'Muitas tentativas erradas: o PIN de administrador está bloqueado por até 15 minutos.';
  end if;
  if v_pin in ('incorreto', 'bloqueou') then
    perform set_config('response.status', '400', true);
    return jsonb_build_object(
      'code', 'P0001',
      'message', case when v_pin = 'bloqueou'
                      then 'PIN incorreto. Foram 5 tentativas erradas seguidas: o PIN de administrador ficou bloqueado por 15 minutos.'
                      else 'PIN incorreto.' end,
      'details', null,
      'hint', null
    );
  end if;

  select * into v_venda from vendas where id = p_venda_id and user_id = v_user for update;
  if not found then
    raise exception 'Venda não encontrada ou não pertence a você.';
  end if;
  if v_venda.status = 'cancelada' then
    raise exception 'A venda % está cancelada e não pode ser editada.', v_venda.numero;
  end if;

  -- 0083: o que a edição não sabe refazer é recusado, em vez de deixar parcela, estorno ou
  -- crédito valendo o valor antigo.
  if coalesce(v_venda.total_parcelas_fiado, 0) > 1
     or exists (select 1 from venda_parcelas where venda_id = p_venda_id and user_id = v_user) then
    raise exception 'Venda com parcelas ou devolução não pode ser editada: cancele e refaça a venda (%).', v_venda.numero;
  end if;
  if coalesce(v_venda.valor_devolvido, 0) > 0
     or exists (select 1 from devolucoes where venda_id = p_venda_id and user_id = v_user) then
    raise exception 'Venda com parcelas ou devolução não pode ser editada: cancele e refaça a venda (%).', v_venda.numero;
  end if;
  if coalesce(v_venda.credito_troca, 0) > 0 then
    raise exception 'Venda paga com crédito de troca não pode ser editada: cancele e refaça a venda (%).', v_venda.numero;
  end if;

  if v_desconto < 0 or v_entrega < 0 then
    raise exception 'Desconto e entrega não podem ser negativos.';
  end if;
  if v_desconto > v_venda.subtotal then
    raise exception 'O desconto (%) é maior que o valor dos itens (%).', v_desconto, v_venda.subtotal;
  end if;

  if p_cliente_id is not null then
    select nome into v_cliente_nome from clientes where id = p_cliente_id and user_id = v_user;
    if not found then
      raise exception 'Cliente não encontrado ou não pertence a você.';
    end if;
  end if;

  v_total_novo := round(v_venda.subtotal - v_desconto + v_entrega, 2);
  if v_total_novo < coalesce(v_venda.entrada_valor, 0) then
    raise exception 'O novo total (%) fica menor que a entrada já recebida (%).', v_total_novo, v_venda.entrada_valor;
  end if;

  -- Imposto e taxa de maquininha acompanham o novo valor, com os percentuais gravados na
  -- venda (registrar_venda: imposto_pct em fração, taxa_maquineta_pct em %). Venda antiga
  -- sem percentual guardado mantém o valor que tinha. O devolvido sai da base do imposto
  -- (hoje é sempre 0 aqui: venda com devolução é recusada acima).
  v_imposto_novo := case when coalesce(v_venda.imposto_pct, 0) > 0
                         then round(v_venda.imposto_pct * greatest(v_venda.subtotal - v_desconto - coalesce(v_venda.valor_devolvido, 0), 0), 2)
                         else coalesce(v_venda.imposto_valor, 0) end;
  v_taxa_nova := case when coalesce(v_venda.taxa_maquineta_pct, 0) > 0
                      then round((v_total_novo - coalesce(v_venda.entrada_valor, 0)) * v_venda.taxa_maquineta_pct / 100, 2)
                      else coalesce(v_venda.taxa_maquineta_valor, 0) end;
  -- A conta do DRE (o gatilho trg_lucro_venda grava a mesma).
  v_lucro_novo := round(v_venda.subtotal - v_desconto + v_entrega - v_venda.custo_total - v_imposto_novo - v_taxa_nova
                        - coalesce(v_venda.frete_custo, 0) - coalesce(v_venda.valor_devolvido, 0), 2);
  v_delta := v_total_novo - v_venda.total;

  if v_venda.status = 'paga' then
    if v_delta <> 0 then
      -- O lançamento do restante ('Vendas'), não a entrada nem outro qualquer.
      select id, conta_id, valor into v_mov
        from movimentacoes_financeiras
       where referencia_venda_id = p_venda_id and user_id = v_user and categoria = 'Vendas'
       order by criado_em, id
       limit 1;

      if found then
        if v_mov.valor + v_delta < 0 then
          raise exception 'A entrada no caixa da venda % ficaria negativa. Ajuste manualmente no Financeiro.', v_venda.numero;
        end if;
        update movimentacoes_financeiras set valor = valor + v_delta where id = v_mov.id;
        if v_mov.conta_id is not null then
          update contas set saldo = saldo + v_delta where id = v_mov.conta_id and user_id = v_user;
        end if;
      elsif v_delta > 0 and v_venda.conta_id is not null then
        -- Venda que tinha sido toda paga na entrada: a diferença entra como o restante.
        insert into movimentacoes_financeiras (
          user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
          data_movimentacao, referencia_venda_id
        ) values (
          v_user, 'entrada', v_delta,
          'Venda ' || v_venda.numero || coalesce(' — ' || v_venda.cliente_nome, '') || ' (ajuste da edição)',
          'PDV', 'Vendas', v_venda.conta_id, true, v_hoje, v_venda.id
        );
        update contas set saldo = saldo + v_delta where id = v_venda.conta_id and user_id = v_user;
      else
        raise exception
          'A entrada no caixa da venda % não foi encontrada. Ajuste manualmente no Financeiro em vez de editar aqui.',
          v_venda.numero;
      end if;
    end if;
  else -- fiado (sem parcelas: recusado acima)
    -- O cliente deve o total menos a entrada que já pagou.
    v_receber_novo := round(v_total_novo - coalesce(v_venda.entrada_valor, 0), 2);

    select id, status, conta_id, valor, valor_pago into v_cpr
      from contas_a_pagar_receber
     where referencia_venda_id = p_venda_id and user_id = v_user and tipo = 'receber'
     order by criado_em, id
     limit 1
     for update;

    if not found then
      if v_delta <> 0 then
        raise exception 'A conta a receber da venda % não foi encontrada.', v_venda.numero;
      end if;
    elsif v_cpr.status = 'pendente' then
      if v_receber_novo + 0.005 < coalesce(v_cpr.valor_pago, 0) then
        raise exception 'O cliente já pagou % desta venda: o novo valor não pode ficar abaixo disso.', v_cpr.valor_pago;
      end if;
      update contas_a_pagar_receber
         set valor = v_receber_novo,
             status = case when coalesce(valor_pago, 0) >= v_receber_novo - 0.005 then 'recebido' else 'pendente' end,
             data_pagamento = case when coalesce(valor_pago, 0) >= v_receber_novo - 0.005 then coalesce(data_pagamento, v_hoje) else data_pagamento end
       where id = v_cpr.id;
    elsif v_delta > 0 then
      -- Já tinha sido recebido e a venda ficou mais cara: o cliente passa a dever a
      -- diferença (a conta reabre), em vez de fingir que o dinheiro entrou no caixa.
      update contas_a_pagar_receber
         set valor = v_receber_novo, status = 'pendente', data_pagamento = null
       where id = v_cpr.id;
    elsif v_delta < 0 then
      -- Já foi recebido e a venda ficou mais barata: o dinheiro está no caixa. Ajusta o
      -- último recebimento do crediário DESTA venda (não a entrada, nem multa e juros).
      select id, conta_id, valor into v_mov from movimentacoes_financeiras
       where referencia_venda_id = p_venda_id and user_id = v_user
         and categoria = 'Recebimento de crediário'
       order by data_movimentacao desc, criado_em desc, id desc
       limit 1;

      if not found then
        raise exception
          'O crediário da venda % já foi recebido, mas o recebimento no caixa não foi localizado. Ajuste manualmente no Financeiro.',
          v_venda.numero;
      end if;
      if v_mov.valor + v_delta < 0 then
        raise exception 'O recebimento da venda % ficaria negativo. Ajuste manualmente no Financeiro.', v_venda.numero;
      end if;

      update movimentacoes_financeiras set valor = valor + v_delta where id = v_mov.id;
      if v_mov.conta_id is not null then
        update contas set saldo = saldo + v_delta where id = v_mov.conta_id and user_id = v_user;
      end if;
      update contas_a_pagar_receber
         set valor = v_receber_novo, valor_pago = greatest(coalesce(valor_pago, 0) + v_delta, 0)
       where id = v_cpr.id;
    end if;
  end if;

  update vendas
     set cliente_id = p_cliente_id,
         cliente_nome = v_cliente_nome,
         forma_pagamento = p_forma_pagamento,
         observacao = p_observacao,
         desconto = v_desconto,
         valor_entrega = v_entrega,
         total = v_total_novo,
         imposto_valor = v_imposto_novo,
         taxa_maquineta_valor = v_taxa_nova,
         lucro = v_lucro_novo
   where id = p_venda_id and user_id = v_user;

  return null;
end;
$$;

-- ------------------------------------------------------------
-- 4) cancelar_venda: devolução parcial antes do cancelamento
-- ------------------------------------------------------------
create or replace function cancelar_venda(p_venda_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user     uuid := auth.uid();
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_venda    vendas%rowtype;
  v_cpr      contas_a_pagar_receber%rowtype;
  v_mov      record;
  v_dev      record;
  v_estornos integer := 0;
begin
  select * into v_venda
  from vendas
  where id = p_venda_id and user_id = v_user
  for update;

  if not found then
    raise exception 'Venda não encontrada ou não pertence a você.';
  end if;

  if v_venda.status = 'cancelada' then
    raise exception 'A venda % já foi cancelada.', v_venda.numero;
  end if;

  -- 1. Devolve o estoque (itens cujo produto foi apagado só geram log).
  --    0052: se o pedido ainda estava só RESERVADO (não saiu do estoque), libera a reserva.
  --    0083: o que já foi devolvido não volta de novo (a devolução já repôs ou mandou para
  --    avaria) — repõe só quantidade − devolvida.
  if not coalesce(v_venda.estoque_baixado, true) then
    delete from estoque_reservas where venda_id = p_venda_id and user_id = v_user;
  else
    update produtos p
    set estoque = p.estoque + agg.qtd
    from (
      select vi.produto_id,
             sum(vi.quantidade - coalesce((select sum(di.quantidade) from devolucao_itens di where di.venda_item_id = vi.id), 0)) as qtd
      from venda_itens vi
      where vi.venda_id = p_venda_id and vi.produto_id is not null
      group by 1
    ) agg
    where p.id = agg.produto_id and p.user_id = v_user and agg.qtd > 0;

    insert into estoque_movimentacoes (
      user_id, produto_id, produto_nome, tipo, quantidade, motivo, data_movimentacao
    )
    select v_user, x.produto_id, x.produto_nome, 'entrada', x.qtd,
           'Cancelamento da venda ' || v_venda.numero, now()
    from (
      select vi.produto_id, vi.produto_nome,
             vi.quantidade - coalesce((select sum(di.quantidade) from devolucao_itens di where di.venda_item_id = vi.id), 0) as qtd
      from venda_itens vi
      where vi.venda_id = p_venda_id
    ) x
    where x.qtd > 0;
  end if;

  -- 2. Financeiro.
  if v_venda.status = 'paga' then
    for v_mov in
      select id from movimentacoes_financeiras
      where referencia_venda_id = p_venda_id and user_id = v_user
    loop
      perform desfazer_movimentacao_financeira(v_mov.id);
      v_estornos := v_estornos + 1;
    end loop;

    -- Venda toda paga com crédito de troca não tem lançamento no caixa: é normal.
    if v_estornos = 0
       and v_venda.total + coalesce(v_venda.valor_devolvido, 0) - coalesce(v_venda.credito_troca, 0) > 0.005 then
      raise exception
        'A entrada no caixa da venda % não foi encontrada. Estorne o lançamento manualmente no Financeiro antes de cancelar.',
        v_venda.numero;
    end if;
  else
    -- Fiado: reverte toda movimentação ligada à venda (entrada isolada, parcelas já
    -- pagas) — zero movimentações é um estado válido agora (fiado ainda 100% em aberto),
    -- então, diferente do ramo "paga" acima, não há exceção por "nada encontrado".
    for v_mov in
      select id from movimentacoes_financeiras
      where referencia_venda_id = p_venda_id and user_id = v_user
    loop
      perform desfazer_movimentacao_financeira(v_mov.id);
    end loop;

    delete from venda_parcelas where venda_id = p_venda_id and user_id = v_user;

    select * into v_cpr
    from contas_a_pagar_receber
    where referencia_venda_id = p_venda_id and user_id = v_user
    for update;

    if found then
      delete from contas_a_pagar_receber where id = v_cpr.id;
    end if;
  end if;

  -- 3. 0083: reembolso de devolução já saiu do caixa (lançamento próprio, sem vínculo com a
  --    venda). Como o recebimento da venda foi desfeito inteiro acima, o reembolso volta para
  --    a mesma conta — o cancelamento tira do caixa só o líquido (recebido − reembolsado).
  for v_dev in
    select numero, valor_estorno, conta_id
      from devolucoes
     where venda_id = p_venda_id and user_id = v_user
       and forma = 'reembolso' and valor_estorno > 0 and conta_id is not null
  loop
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro, data_movimentacao
    ) values (
      v_user, 'entrada', v_dev.valor_estorno,
      left(format('Cancelamento da venda %s — reembolso da devolução %s já pago', v_venda.numero, v_dev.numero), 200),
      'devolucao', 'Devoluções', v_dev.conta_id, true, v_hoje
    );
    update contas set saldo = saldo + v_dev.valor_estorno where id = v_dev.conta_id and user_id = v_user;
  end loop;

  update vendas
  set status = 'cancelada', cancelada_em = now()
  where id = p_venda_id and user_id = v_user;
end;
$$;

-- ------------------------------------------------------------
-- 5) registrar_devolucao: data em Brasília e abatimento que respeita o que já foi pago
--    (parcela/conta com pagamento parcial não é apagada: fica quitada com o que recebeu).
-- ------------------------------------------------------------
create or replace function registrar_devolucao(
  p_venda_id uuid,
  p_itens jsonb,
  p_valor_estorno numeric,
  p_forma text,
  p_conta_id uuid default null,
  p_motivo text default null,
  p_tipo text default 'devolucao'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_venda   vendas%rowtype;
  v_dev_id  uuid;
  v_numero  text;
  v_i       jsonb;
  v_item    record;
  v_qtd     integer;
  v_ja      integer;
  v_custo_volta numeric := 0;
  v_valor_itens numeric := 0;
  v_restante numeric;
  v_parc    record;
  v_tirar   numeric;
  v_aberto  numeric;
  v_cpr     record;
begin
  if v_user is null or not conta_ativa() then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if p_forma not in ('reembolso', 'abater', 'troca', 'nenhum') or p_tipo not in ('devolucao', 'troca') then
    raise exception 'Forma de estorno inválida.';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Escolha pelo menos um item para devolver.';
  end if;

  select * into v_venda from vendas where id = p_venda_id and user_id = v_user for update;
  if not found then
    raise exception 'Venda não encontrada.';
  end if;
  if v_venda.status = 'cancelada' then
    raise exception 'A venda % está cancelada.', v_venda.numero;
  end if;
  if coalesce(p_valor_estorno, 0) < 0 or coalesce(p_valor_estorno, 0) > v_venda.total + 0.005 then
    raise exception 'O estorno não pode passar do total que ainda resta na venda (R$ %).', to_char(v_venda.total, 'FM999G999G990D00');
  end if;
  if p_forma = 'reembolso' and coalesce(p_valor_estorno, 0) > 0 and p_conta_id is null then
    raise exception 'Escolha de qual conta sai o reembolso.';
  end if;

  select 'D-' || lpad((count(*) + 1)::text, 4, '0') into v_numero from devolucoes where user_id = v_user;
  insert into devolucoes (user_id, venda_id, numero, tipo, motivo, valor_estorno, forma, conta_id)
  values (v_user, p_venda_id, v_numero, p_tipo, nullif(left(trim(coalesce(p_motivo, '')), 500), ''), round(coalesce(p_valor_estorno, 0), 2), p_forma, p_conta_id)
  returning id into v_dev_id;

  for v_i in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_i->>'quantidade')::integer;
    if v_qtd is null or v_qtd <= 0 then
      continue;
    end if;
    select vi.* into v_item from venda_itens vi where vi.id = (v_i->>'venda_item_id')::uuid and vi.venda_id = p_venda_id;
    if not found then
      raise exception 'Item não pertence a esta venda.';
    end if;
    select coalesce(sum(di.quantidade), 0) into v_ja from devolucao_itens di where di.venda_item_id = v_item.id;
    if v_ja + v_qtd > v_item.quantidade then
      raise exception 'De "%" só restam % para devolver.', v_item.produto_nome, v_item.quantidade - v_ja;
    end if;

    insert into devolucao_itens (devolucao_id, venda_item_id, produto_id, produto_nome, quantidade, valor_unitario, custo_unitario, destino)
    values (v_dev_id, v_item.id, v_item.produto_id, v_item.produto_nome, v_qtd, v_item.preco_unitario, v_item.custo_unitario,
            case when v_i->>'destino' = 'avaria' then 'avaria' else 'estoque' end);
    v_valor_itens := v_valor_itens + v_item.preco_unitario * v_qtd;

    if v_item.produto_id is not null then
      if not coalesce(v_venda.estoque_baixado, true) then
        -- Ainda só reservado: a mercadoria nem saiu. Libera a reserva (kit: componentes).
        update estoque_reservas r set quantidade = r.quantidade - least(r.quantidade, v_qtd * coalesce(
                 (select c.quantidade from componentes_do_kit(v_item.produto_id) c where c.produto_id = r.produto_id), 1))
         where r.venda_id = p_venda_id
           and (r.produto_id = v_item.produto_id or r.produto_id in (select c.produto_id from componentes_do_kit(v_item.produto_id) c));
        delete from estoque_reservas where venda_id = p_venda_id and quantidade <= 0;
        v_custo_volta := v_custo_volta + v_item.custo_unitario * v_qtd;
      elsif v_i->>'destino' <> 'avaria' then
        update produtos set estoque = estoque + v_qtd where id = v_item.produto_id and user_id = v_user;
        insert into estoque_movimentacoes (user_id, produto_id, produto_nome, tipo, quantidade, motivo, data_movimentacao)
        values (v_user, v_item.produto_id, v_item.produto_nome, 'entrada', v_qtd, left(format('Devolução %s da venda %s', v_numero, v_venda.numero), 300), now());
        v_custo_volta := v_custo_volta + v_item.custo_unitario * v_qtd;
      end if;
    end if;
  end loop;

  -- Financeiro.
  v_restante := round(coalesce(p_valor_estorno, 0), 2);
  if p_forma = 'reembolso' and v_restante > 0 then
    perform registrar_movimentacao_financeira('saida', -v_restante, left(format('Devolução %s da venda %s', v_numero, v_venda.numero), 200),
                                              'devolucao', 'Devoluções', p_conta_id, true, v_hoje);
  elsif p_forma = 'abater' and v_restante > 0 then
    -- Venda parcelada: as parcelas e a conta a receber são o MESMO dinheiro (a conta a receber
    -- é o total). Abate do que está EM ABERTO nas parcelas (da última para a primeira) e reduz
    -- a conta a receber pelo mesmo valor. Sem parcelas, abate só da conta a receber.
    -- 0083: em aberto = valor − valor_pago (pagamento parcial).
    if exists (select 1 from venda_parcelas where venda_id = p_venda_id and status = 'pendente') then
      if (select coalesce(sum(valor - coalesce(valor_pago, 0)), 0) from venda_parcelas where venda_id = p_venda_id and status = 'pendente') + 0.005 < v_restante then
        raise exception 'Não há valor em aberto suficiente nesta venda para abater. Use reembolso.';
      end if;
      for v_parc in select * from venda_parcelas where venda_id = p_venda_id and status = 'pendente' order by numero desc for update loop
        exit when v_restante <= 0;
        v_aberto := v_parc.valor - coalesce(v_parc.valor_pago, 0);
        v_tirar := least(v_aberto, v_restante);
        if v_tirar >= v_aberto then
          if coalesce(v_parc.valor_pago, 0) > 0 then
            -- Já recebeu parte: fica quitada com o que recebeu.
            update venda_parcelas set valor = valor - v_tirar, status = 'paga', data_pagamento = coalesce(data_pagamento, v_hoje) where id = v_parc.id;
          else
            delete from venda_parcelas where id = v_parc.id;
          end if;
        else
          update venda_parcelas set valor = valor - v_tirar where id = v_parc.id;
        end if;
        v_restante := v_restante - v_tirar;
      end loop;
      v_restante := round(coalesce(p_valor_estorno, 0), 2);
    elsif (select coalesce(sum(valor - coalesce(valor_pago, 0)), 0) from contas_a_pagar_receber where referencia_venda_id = p_venda_id and status = 'pendente') + 0.005 < v_restante then
      raise exception 'Não há valor em aberto suficiente nesta venda para abater. Use reembolso.';
    end if;
    for v_cpr in select * from contas_a_pagar_receber where referencia_venda_id = p_venda_id and status = 'pendente' for update loop
      exit when v_restante <= 0;
      v_aberto := v_cpr.valor - coalesce(v_cpr.valor_pago, 0);
      v_tirar := least(v_aberto, v_restante);
      if v_tirar >= v_aberto then
        if coalesce(v_cpr.valor_pago, 0) > 0 then
          update contas_a_pagar_receber set valor = valor - v_tirar, status = 'recebido', data_pagamento = coalesce(data_pagamento, v_hoje) where id = v_cpr.id;
        else
          delete from contas_a_pagar_receber where id = v_cpr.id;
        end if;
      else
        update contas_a_pagar_receber set valor = valor - v_tirar where id = v_cpr.id;
      end if;
      v_restante := v_restante - v_tirar;
    end loop;
  end if;

  -- A venda passa a refletir o que ficou.
  -- 0083: o imposto acompanha a receita que sobrou (imposto_pct × (subtotal − desconto −
  -- devolvido)); venda antiga sem percentual guardado reduz na mesma proporção. O lucro é
  -- a conta do DRE (o gatilho trg_lucro_venda recalcula com os campos novos).
  update vendas set
    total = round(total - coalesce(p_valor_estorno, 0), 2),
    custo_total = round(greatest(0, custo_total - v_custo_volta), 2),
    imposto_valor = case
      when coalesce(imposto_valor, 0) = 0 or coalesce(p_valor_estorno, 0) = 0 then imposto_valor
      when coalesce(imposto_pct, 0) > 0
        then round(imposto_pct * greatest(subtotal - desconto - valor_devolvido - coalesce(p_valor_estorno, 0), 0), 2)
      when subtotal - desconto - valor_devolvido > 0
        then round(imposto_valor * greatest(1 - coalesce(p_valor_estorno, 0) / (subtotal - desconto - valor_devolvido), 0), 2)
      else imposto_valor end,
    valor_devolvido = round(valor_devolvido + coalesce(p_valor_estorno, 0), 2)
  where id = p_venda_id;

  return jsonb_build_object('id', v_dev_id, 'numero', v_numero, 'valor_itens', round(v_valor_itens, 2), 'estorno', round(coalesce(p_valor_estorno, 0), 2));
end;
$$;

-- ------------------------------------------------------------
-- 6) marcar_parcela_paga: pagamento parcial + data em Brasília
-- ------------------------------------------------------------
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
  v_data date := coalesce(p_data_pagamento, (now() at time zone 'America/Sao_Paulo')::date);
  v_valor numeric := round(p_valor_pago, 2);
  v_ja numeric;
  v_devido numeric;
  v_principal numeric;
  v_encargo numeric;
  v_quitada boolean;
  v_soma numeric;
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

  -- 0083: pagamento parcial. O que falta é valor − o que já foi pago; abaixo disso a parcela
  -- segue pendente acumulando, e o que passar do que falta é multa e juros (0065).
  v_ja := coalesce(v_parcela.valor_pago, 0);
  v_devido := greatest(v_parcela.valor - v_ja, 0);
  v_principal := least(v_valor, v_devido);
  v_encargo := greatest(v_valor - v_devido, 0);
  v_quitada := v_ja + v_principal >= v_parcela.valor - 0.005;

  update venda_parcelas
  set status = case when v_quitada then 'paga' else 'pendente' end,
      data_pagamento = v_data,
      valor_pago = v_ja + v_valor,
      conta_id = p_conta_id
  where id = p_parcela_id;

  if v_principal > 0 then
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id
    ) values (
      v_user, 'entrada', v_principal,
      format('Venda %s — parcela %s/%s%s', v_venda.numero, v_parcela.numero, v_parcela.total_parcelas,
             case when v_quitada then '' else ' (parcial)' end),
      'Crediário', 'Recebimento de crediário', p_conta_id, true, v_data, v_venda.id
    );
  end if;

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

  update contas set saldo = saldo + v_valor where id = p_conta_id and user_id = v_user;
  if not found then
    raise exception 'Conta não encontrada ou não pertence ao usuário atual';
  end if;

  -- A conta a receber "pai" grava o que foi recebido de verdade (sem multa e juros) e só
  -- fecha quando não sobra parcela pendente.
  select coalesce(sum(least(coalesce(valor_pago, 0), valor)), 0) into v_soma
    from venda_parcelas where venda_id = v_parcela.venda_id and user_id = v_user;
  select not exists (
    select 1 from venda_parcelas where venda_id = v_parcela.venda_id and status = 'pendente'
  ) into v_todas_pagas;

  update contas_a_pagar_receber
  set valor_pago = round(v_soma, 2),
      status = case when v_todas_pagas then 'recebido' else status end,
      data_pagamento = case when v_todas_pagas then v_data else data_pagamento end
  where referencia_venda_id = v_parcela.venda_id and tipo = 'receber' and user_id = v_user;
end;
$$;

-- ------------------------------------------------------------
-- 7) receber_conta (0067): só a data, agora em Brasília
-- ------------------------------------------------------------
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
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_cpr contas_a_pagar_receber%rowtype;
  v_conta uuid;
  v_data date := coalesce(p_data, (now() at time zone 'America/Sao_Paulo')::date);
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
  if v_data > v_hoje + 1 then
    raise exception 'A data do recebimento não pode ser no futuro.';
  end if;
  v_conta := coalesce(p_conta_id, v_cpr.conta_id);
  if v_conta is null then
    raise exception 'Escolha a conta que recebeu o dinheiro.';
  end if;

  v_restante := greatest(v_cpr.valor - v_cpr.valor_pago, 0);
  v_principal := least(round(p_valor, 2), v_restante);
  v_encargo := greatest(round(p_valor, 2) - v_restante, 0);
  v_crediario := v_cpr.referencia_venda_id is not null or v_cpr.cliente_id is not null;

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

-- ------------------------------------------------------------
-- 8) fiado_em_uso_cliente (0067): parcela com pagamento parcial conta só o que falta
-- ------------------------------------------------------------
create or replace function fiado_em_uso_cliente(p_cliente_id uuid)
returns numeric
language sql
security invoker
stable
set search_path = public
as $$
  select coalesce(sum(valor), 0) from (
    select vp.valor - coalesce(vp.valor_pago, 0) as valor
    from venda_parcelas vp
    join vendas v on v.id = vp.venda_id
    where v.cliente_id = p_cliente_id and v.user_id = auth.uid() and vp.status = 'pendente'
    union all
    select cpr.valor - cpr.valor_pago
    from contas_a_pagar_receber cpr
    join vendas v on v.id = cpr.referencia_venda_id
    where v.cliente_id = p_cliente_id and v.user_id = auth.uid()
      and cpr.tipo = 'receber' and cpr.status = 'pendente'
      and not exists (select 1 from venda_parcelas vp2 where vp2.venda_id = v.id)
    union all
    select cpr.valor - cpr.valor_pago
    from contas_a_pagar_receber cpr
    where cpr.cliente_id = p_cliente_id and cpr.user_id = auth.uid()
      and cpr.referencia_venda_id is null
      and cpr.tipo = 'receber' and cpr.status = 'pendente'
  ) t;
$$;

-- ------------------------------------------------------------
-- 9) Custo de kit/insumo pelo custo ATUAL do componente
--    Item do JSON com `produtoId` de um produto da mesma conta usa `produtos.custo` dele;
--    sem produto (insumo avulso, produto apagado, id inválido) segue o `custoUnitario` gravado.
--    A versão de 1 argumento (0029) fica como estava, para quem ainda a chamar.
-- ------------------------------------------------------------
create or replace function custo_de_insumos(p_insumos jsonb, p_user uuid, p_proprio uuid default null)
returns numeric
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(sum((i->>'quantidade')::numeric * coalesce(c.custo, (i->>'custoUnitario')::numeric)), 0)
    from jsonb_array_elements(coalesce(p_insumos, '[]'::jsonb)) i
    left join produtos c
      on c.user_id = p_user
     and c.id = case when (i->>'produtoId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     then (i->>'produtoId')::uuid end
     and c.id is distinct from p_proprio;
$$;

create or replace function recalcular_custo_produto()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.custo := round(coalesce(new.custo_base, 0) + custo_de_insumos(new.insumos, new.user_id, new.id), 2);
  return new;
end;
$$;

-- Mudou o custo de um produto: recalcula os produtos que o usam como componente. O "toque"
-- (`custo_base = custo_base`) passa pelo trigger acima; não mexe em `insumos` nem em
-- `estoque`, então os gatilhos de kit (0058) não disparam. Kit dentro de kit propaga em
-- cadeia. Ciclo (A usa B que usa A): cada produto entra uma vez só na cadeia em curso
-- (lista em `app.custo_propagando`, local à transação), e o limite de profundidade é a
-- segunda trava.
create or replace function propagar_custo_componente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cadeia text := coalesce(current_setting('app.custo_propagando', true), '');
begin
  if pg_trigger_depth() > 16 or position(new.id::text in v_cadeia) > 0 then
    return null;
  end if;
  perform set_config('app.custo_propagando', v_cadeia || ',' || new.id::text, true);
  update produtos k
     set custo_base = k.custo_base
   where k.user_id = new.user_id
     and k.id <> new.id
     and position(k.id::text in v_cadeia) = 0
     and k.insumos @> jsonb_build_array(jsonb_build_object('produtoId', new.id::text));
  perform set_config('app.custo_propagando', v_cadeia, true);
  return null;
end;
$$;

revoke execute on function propagar_custo_componente() from public, anon, authenticated;

drop trigger if exists produtos_propagar_custo on produtos;
create trigger produtos_propagar_custo
  after update on produtos
  for each row
  when (new.custo is distinct from old.custo)
  execute function propagar_custo_componente();

-- Uma vez: produtos que já apontam para componentes passam a valer o custo atual deles.
update produtos k
   set custo_base = k.custo_base
 where jsonb_typeof(k.insumos) = 'array'
   and exists (select 1 from jsonb_array_elements(k.insumos) i where coalesce(i->>'produtoId', '') <> '')
   and k.custo is distinct from round(coalesce(k.custo_base, 0) + custo_de_insumos(k.insumos, k.user_id, k.id), 2);

-- ------------------------------------------------------------
-- 10) raio_x_vendas (0071): fora 'nao_pago', como o DRE e os relatórios
-- ------------------------------------------------------------
create or replace function raio_x_vendas(p_dias integer default 30)
returns table (produto_id uuid, loja_id uuid, quantidade bigint, preco_medio numeric)
language sql
security invoker
stable
set search_path = public
as $$
  with mkt as (
    select i.produto_id, p.loja_id, i.quantidade, i.preco_unitario
      from pedidos_marketplace_itens i
      join pedidos_marketplace p on p.id = i.pedido_id
     where p.user_id = auth.uid()
       and i.produto_id is not null
       and p.status not in ('cancelado', 'devolvido', 'nao_pago')
       and coalesce(p.pago_em, p.criado_em_plataforma) >= now() - make_interval(days => greatest(coalesce(p_dias, 30), 1))
  ),
  proprias as (
    select vi.produto_id, null::uuid as loja_id, vi.quantidade, vi.preco_unitario
      from venda_itens vi
      join vendas v on v.id = vi.venda_id
     where v.user_id = auth.uid()
       and vi.produto_id is not null
       and v.status <> 'cancelada'
       and v.data_venda >= now() - make_interval(days => greatest(coalesce(p_dias, 30), 1))
  ),
  tudo as (select * from mkt union all select * from proprias)
  select produto_id, loja_id, sum(quantidade)::bigint, round(sum(preco_unitario * quantidade) / nullif(sum(quantidade), 0), 2)
    from tudo
   group by produto_id, loja_id;
$$;

-- ------------------------------------------------------------
-- 11) EXECUTE só para quem está logado (a 0077 fez isso; a recriação de registrar_venda
--     com assinatura nova volta ao padrão PUBLIC, então repete aqui para todas).
-- ------------------------------------------------------------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and p.proname = any (array[
         'registrar_venda', 'registrar_venda_offline', 'editar_venda', 'cancelar_venda',
         'registrar_devolucao', 'marcar_parcela_paga', 'receber_conta', 'fiado_em_uso_cliente',
         'raio_x_vendas', 'custo_de_insumos'
       ])
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

NOTIFY pgrst, 'reload schema';

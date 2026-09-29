-- ============================================================
-- 0032 — Endereço completo do cliente, garantia por item e dados da empresa.
--
-- Tudo aditivo e idempotente (`if not exists`): rodar duas vezes não muda nada.
-- ============================================================

-- 1) Cliente: número, bairro e complemento. `cep`, `endereco` (logradouro), `cidade` e
--    `uf` já existiam desde a 0001.
alter table clientes
  add column if not exists numero text,
  add column if not exists bairro text,
  add column if not exists complemento text;

-- 2) Garantia. null = sem garantia. O produto guarda o padrão; a venda congela o valor
--    usado em cada item (`venda_itens.garantia_dias`), editável na hora da venda.
alter table produtos
  add column if not exists garantia_dias integer
    check (garantia_dias is null or garantia_dias between 1 and 3650);

alter table venda_itens
  add column if not exists garantia_dias integer
    check (garantia_dias is null or garantia_dias between 1 and 3650);

-- 3) Dados da empresa, para o cabeçalho do comprovante. `nome_negocio`, `cnpj` e
--    `whatsapp` já existiam.
alter table perfil_negocio
  add column if not exists logo_url text,
  add column if not exists telefone text,
  add column if not exists email text,
  add column if not exists cep text,
  add column if not exists endereco text,
  add column if not exists numero text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text,
  add column if not exists instagram text;
-- 4) registrar_venda grava a garantia de cada item. Mesma assinatura e mesmo retorno da
--    0030 (copiada de lá; a única mudança está no insert em venda_itens, passo 6), então
--    CREATE OR REPLACE é seguro sem DROP. `p_itens[].garantia_dias` é opcional; 0 ou
--    ausente = sem garantia.
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
  p_dias_entre_parcelas integer default 30
)
returns table (venda_id uuid, venda_numero text, venda_total numeric, venda_lucro numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user             uuid := auth.uid();
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
  v_restante         numeric;
  v_taxa_maquineta   numeric := 0;
  v_forma_e_cartao   boolean;
  v_forma_label      text;
  v_limite_fiado     numeric;
  v_fiado_em_uso     numeric;
  v_parcela_valor    numeric;
  v_i                integer;
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
  select p.nome || coalesce(' — ' || p.variante_nome, ''), p.estoque, agg.qtd
  into v_falta_nome, v_falta_estoque, v_falta_qtd
  from (
    select (i->>'produto_id')::uuid as produto_id,
           sum((i->>'quantidade')::integer) as qtd
    from jsonb_array_elements(p_itens) i
    group by 1
  ) agg
  join produtos p on p.id = agg.produto_id and p.user_id = v_user
  where p.estoque < agg.qtd
  limit 1;

  if found then
    raise exception 'Estoque insuficiente de "%": disponível %, pedido %.',
      v_falta_nome, v_falta_estoque, v_falta_qtd;
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
  v_restante := round(v_total - v_entrada, 2);

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

  v_lucro := round(v_subtotal - v_desconto - v_custo_total - v_imposto - v_taxa_maquineta, 2);

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
  elsif p_conta_id is null then
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
    taxa_maquineta_pct, taxa_maquineta_valor
  ) values (
    v_user, p_cliente_id, v_cliente_nome, p_status, v_subtotal, v_desconto, v_entrega,
    v_total, v_custo_total, v_lucro, v_forma_label, p_conta_id, p_observacao,
    coalesce(v_aliquota, 0) / 100, v_imposto,
    v_entrada, p_entrada_forma, p_forma_pagamento_2, p_parcelas_cartao,
    p_taxa_maquineta_pct, v_taxa_maquineta
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

  -- 8a. Entrada: dinheiro que já entrou de verdade, registrada na hora, independente do
  --     status final da venda (paga ou fiado).
  if v_entrada > 0 then
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id
    ) values (
      v_user, 'entrada', v_entrada,
      'Entrada — venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
      'PDV', 'Entrada de venda', p_conta_id, true, current_date, v_venda.id
    );

    update contas set saldo = saldo + v_entrada where id = p_conta_id and user_id = v_user;
    if not found then
      raise exception 'Conta não encontrada ou não pertence ao usuário atual';
    end if;
  end if;

  -- 8b. O restante: entra agora (paga) ou vira dívida do cliente (fiado), parcelada ou não.
  if p_status = 'paga' then
    if v_restante > 0 then
      insert into movimentacoes_financeiras (
        user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
        data_movimentacao, referencia_venda_id
      ) values (
        v_user, 'entrada', v_restante,
        'Venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
        'PDV', 'Vendas', p_conta_id, true, current_date, v_venda.id
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
        v_restante, coalesce(p_data_vencimento, current_date + 30), 'pendente', p_conta_id,
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
          coalesce(p_data_vencimento, current_date + 30) + (v_i - 1) * p_dias_entre_parcelas
        );
      end loop;

      insert into contas_a_pagar_receber (
        user_id, tipo, descricao, valor, data_vencimento, status, conta_id,
        cliente_id, referencia_venda_id
      ) values (
        v_user, 'receber',
        format('Fiado — venda %s%s (%s parcelas)', v_venda.numero, coalesce(' — ' || v_cliente_nome, ''), p_parcelas_fiado),
        v_restante, coalesce(p_data_vencimento, current_date + 30), 'pendente', p_conta_id,
        p_cliente_id, v_venda.id
      );

      update vendas set total_parcelas_fiado = p_parcelas_fiado where id = v_venda.id;
    end if;
  end if;

  return query select v_venda.id, v_venda.numero, v_total, v_lucro;
end;
$$;

NOTIFY pgrst, 'reload schema';

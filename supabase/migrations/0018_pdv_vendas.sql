-- ============================================================
-- PDV (frente de caixa): clientes, vendas, itens de venda e variantes de produto.
--
-- Até aqui o sistema controlava tudo menos a venda: ela só existia como duas
-- ações desconexas (uma saída manual de estoque e uma entrada no financeiro),
-- sem cliente, sem documento e sem lucro apurado.
--
-- Decisões de modelagem registradas aqui porque não são óbvias lendo o schema:
--
-- 1) VARIANTE É UMA LINHA DE `produtos`. Tamanho/cor têm estoque, custo, preço,
--    SKU e código de barras próprios — que já são colunas de `produtos`. Assim
--    `estoque_movimentacoes`, `pedidos_compra_itens`, `precificacoes`,
--    `produto_lojas`, `produto_imagens`, `catalogo_precos`,
--    `registrar_movimentacao_estoque` e `marcar_pedido_recebido` continuam
--    funcionando sem nenhuma alteração.
--    O AGRUPAMENTO, porém, NÃO é um produto-pai auto-referenciado: é
--    `produto_grupos`, uma tabela magra só com o que é compartilhado. Um pai que
--    também fosse linha de `produtos` viraria uma linha-fantasma com
--    estoque = 0 e estoque_minimo = 0 — e o dashboard lista estoque baixo com
--    `estoque <= estoque_minimo`, onde `0 <= 0` é verdadeiro, então todo produto
--    com variantes apareceria para sempre como "estoque baixo". Além disso a
--    linha-pai queimaria um SKU no unique(user_id, sku), cascatearia delete
--    sobre variantes com estoque e não propagaria `ativo` para a vitrine.
--
-- 2) O status da venda é 'paga' | 'fiado' | 'cancelada'. Se um fiado já foi
--    recebido NÃO se descobre aqui: descobre-se em `contas_a_pagar_receber`
--    (status 'recebido') pela referencia_venda_id. Uma verdade só, um lugar só.
--
-- 3) `vendas` guarda snapshot de custo_total e lucro, e `venda_itens` guarda
--    custo_unitario — o relatório de margem de março não pode mudar porque o
--    fornecedor reajustou o custo em agosto.
--
-- 4) O frete (`valor_entrega`) entra no total e no caixa, mas NÃO entra no
--    lucro: é repasse do custo de entrega, que o sistema não modela.
--    lucro = (subtotal - desconto) - custo_total.
--
-- ANTES DE RODAR, confira que não há dado que viole as constraints novas:
--   select id, sku, estoque from produtos where estoque < 0;
--   select user_id, codigo_barras, count(*) from produtos
--    where codigo_barras is not null group by 1, 2 having count(*) > 1;
-- ============================================================

-- ============================================================
-- Agrupamento de variantes
-- ============================================================

create table produto_grupos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  nome text not null,
  descricao text,
  imagem_url text,
  categoria_id uuid references categorias(id) on delete set null,
  criado_em timestamptz not null default now()
);

create index produto_grupos_user_id_idx on produto_grupos (user_id);

alter table produto_grupos enable row level security;
create policy "own_rows_produto_grupos" on produto_grupos for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table produtos
  add column grupo_id uuid references produto_grupos(id) on delete set null,
  add column variante_nome text;

create index produtos_grupo_id_idx on produtos (grupo_id);

-- Duas variantes do mesmo grupo não podem ter o mesmo rótulo.
-- Índice parcial: produtos avulsos (grupo_id null) não são afetados.
create unique index produtos_grupo_variante_idx
  on produtos (grupo_id, lower(variante_nome)) where grupo_id is not null;

-- "variante exige rótulo" NÃO vira check constraint de propósito: o
-- `on delete set null` do grupo zeraria grupo_id com variante_nome ainda
-- preenchido e dispararia a check. A regra fica no Zod (lib/validacao.ts),
-- como o resto da validação de borda do projeto.

-- O PDV lê código de barras com leitor: a busca TEM que resolver para
-- exatamente uma linha. Hoje codigo_barras não tem unique nenhum.
create unique index produtos_user_codigo_barras_idx
  on produtos (user_id, codigo_barras) where codigo_barras is not null;

-- Piso rígido de estoque. registrar_movimentacao_estoque já clampa em
-- greatest(0, ...), então nenhuma linha legítima pode estar negativa hoje.
-- A venda confia nesta constraint como última linha de defesa.
alter table produtos
  add constraint produtos_estoque_nao_negativo check (estoque >= 0);

-- ============================================================
-- Clientes (molde: fornecedores, 0001)
-- ============================================================

create table clientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  nome text not null,
  whatsapp text,
  email text,
  documento text,
  data_nascimento date,
  cep text,
  endereco text,
  cidade text,
  uf text,
  observacao text,
  permite_fiado boolean not null default false,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  criado_em timestamptz not null default now()
);

create index clientes_user_id_idx on clientes (user_id);
create index clientes_nome_idx on clientes (user_id, lower(nome));

alter table clientes enable row level security;
create policy "own_rows_clientes" on clientes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Vendas
-- ============================================================

create table vendas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  numero text not null,
  cliente_id uuid references clientes(id) on delete set null,
  cliente_nome text,
  status text not null default 'paga' check (status in ('paga', 'fiado', 'cancelada')),
  subtotal numeric not null default 0,
  desconto numeric not null default 0,
  valor_entrega numeric not null default 0,
  total numeric not null default 0,
  custo_total numeric not null default 0,
  lucro numeric not null default 0,
  forma_pagamento text,
  conta_id uuid references contas(id) on delete set null,
  observacao text,
  data_venda timestamptz not null default now(),
  cancelada_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (user_id, numero)
);

create index vendas_user_id_idx on vendas (user_id);
create index vendas_data_venda_idx on vendas (user_id, data_venda desc);
create index vendas_cliente_id_idx on vendas (cliente_id);

alter table vendas enable row level security;
create policy "own_rows_vendas" on vendas for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Itens da venda (molde: pedidos_compra_itens — sem user_id, RLS pelo pai)
-- ============================================================

create table venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  produto_id uuid references produtos(id) on delete set null,
  produto_nome text not null,
  produto_sku text,
  quantidade integer not null check (quantidade > 0),
  preco_unitario numeric not null,
  custo_unitario numeric not null default 0
);

create index venda_itens_venda_id_idx on venda_itens (venda_id);
create index venda_itens_produto_id_idx on venda_itens (produto_id);

alter table venda_itens enable row level security;
create policy "own_rows_venda_itens" on venda_itens for all
  using (exists (select 1 from vendas v where v.id = venda_id and v.user_id = auth.uid()))
  with check (exists (select 1 from vendas v where v.id = venda_id and v.user_id = auth.uid()));

-- ============================================================
-- Vínculo da venda com o financeiro
-- ============================================================

alter table movimentacoes_financeiras
  add column referencia_venda_id uuid references vendas(id) on delete set null;

alter table contas_a_pagar_receber
  add column referencia_venda_id uuid references vendas(id) on delete set null,
  add column cliente_id uuid references clientes(id) on delete set null;

create index movimentacoes_financeiras_venda_idx
  on movimentacoes_financeiras (referencia_venda_id) where referencia_venda_id is not null;
create index contas_a_pagar_receber_venda_idx
  on contas_a_pagar_receber (referencia_venda_id) where referencia_venda_id is not null;

-- ============================================================
-- Numeração V-0001. Diferenças deliberadas em relação a gerar_numero_pedido:
--  - max()+1 em vez de count(*): count reusa número depois de um delete e
--    esbarra no unique (user_id, numero) — bug latente em pedidos_compra.
--  - lpad 4 em vez de 2: 'MV-99' + 1 vira 'MV-100' e quebra a ordenação
--    alfabética da tela; uma frente de caixa passa de 100 vendas rápido.
--  - advisory lock com chave de 2 inteiros: não serializa contra a criação
--    de pedidos de compra do mesmo usuário.
-- ============================================================

create or replace function gerar_numero_venda()
returns trigger
language plpgsql
security invoker
as $$
declare
  n integer;
begin
  if new.numero is null or new.numero = '' then
    perform pg_advisory_xact_lock(hashtext(new.user_id::text), hashtext('vendas'));

    select coalesce(max(nullif(regexp_replace(numero, '\D', '', 'g'), '')::integer), 0) + 1
    into n
    from vendas
    where user_id = new.user_id;

    new.numero := 'V-' || lpad(n::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_gerar_numero_venda
before insert on vendas
for each row execute function gerar_numero_venda();

-- ============================================================
-- registrar_venda: uma venda inteira numa transação só.
-- Ordem: trava+valida -> cria venda/itens -> baixa estoque -> caixa ou fiado.
--
-- security invoker: o RLS de produtos/vendas/contas continua valendo.
--
-- Não reusa registrar_movimentacao_estoque de propósito: o greatest(0, ...)
-- dela silenciaria a venda sem saldo (que aqui precisa falhar), ela faz um
-- UPDATE por chamada sem ordem determinística de lock (gerador de deadlock em
-- loop) e o `motivo` precisa do número da venda, que só existe após o insert.
--
-- Não reusa registrar_movimentacao_financeira de propósito: ela não aceita
-- referencia_venda_id, e acrescentar um parâmetro criaria uma SOBRECARGA nova
-- em vez de substituir — as chamadas existentes passariam a dar
-- "42725 function is not unique".
--
-- As mensagens de erro são escritas em pt-BR porque `raise exception` chega no
-- client como P0001 e traduzirErroSupabase() cai no fallback erro.message.
-- ============================================================

create or replace function registrar_venda(
  p_itens jsonb,
  p_status text default 'paga',
  p_cliente_id uuid default null,
  p_conta_id uuid default null,
  p_forma_pagamento text default null,
  p_desconto numeric default 0,
  p_valor_entrega numeric default 0,
  p_observacao text default null,
  p_data_vencimento date default null
)
returns table (venda_id uuid, venda_numero text, venda_total numeric, venda_lucro numeric)
language plpgsql
security invoker
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
  v_cliente_nome     text;
  v_permite_fiado    boolean;
  v_produtos_ok      integer;
  v_produtos_pedidos integer;
  v_falta_nome       text;
  v_falta_estoque    integer;
  v_falta_qtd        integer;
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

  v_total := round(v_subtotal - v_desconto + v_entrega, 2);
  v_lucro := round(v_subtotal - v_desconto - v_custo_total, 2);

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
  elsif p_conta_id is null then
    raise exception 'Escolha a conta que vai receber o valor da venda.';
  end if;

  -- 5. A venda (o número vem do trigger).
  insert into vendas (
    user_id, cliente_id, cliente_nome, status, subtotal, desconto, valor_entrega,
    total, custo_total, lucro, forma_pagamento, conta_id, observacao
  ) values (
    v_user, p_cliente_id, v_cliente_nome, p_status, v_subtotal, v_desconto, v_entrega,
    v_total, v_custo_total, v_lucro, p_forma_pagamento, p_conta_id, p_observacao
  )
  returning * into v_venda;

  -- 6. Itens, com snapshot de nome (já com a variante), SKU, preço e custo.
  insert into venda_itens (
    venda_id, produto_id, produto_nome, produto_sku, quantidade, preco_unitario, custo_unitario
  )
  select v_venda.id,
         p.id,
         p.nome || coalesce(' — ' || p.variante_nome, ''),
         p.sku,
         (i->>'quantidade')::integer,
         round((i->>'preco_unitario')::numeric, 2),
         p.custo
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

  -- 8. Dinheiro: entra no caixa agora, ou vira conta a receber.
  if p_status = 'paga' then
    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id
    ) values (
      v_user, 'entrada', v_total,
      'Venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
      'PDV', 'Vendas', p_conta_id, true, current_date, v_venda.id
    );

    -- ajustar_saldo_conta foi dropada na 0007; o update vai inline.
    update contas set saldo = saldo + v_total
    where id = p_conta_id and user_id = v_user;

    if not found then
      raise exception 'Conta não encontrada ou não pertence ao usuário atual';
    end if;
  else
    -- contas_a_pagar_receber.forma_pagamento foi dropada na 0007: a forma de
    -- pagamento do fiado fica só em vendas.forma_pagamento.
    insert into contas_a_pagar_receber (
      user_id, tipo, descricao, valor, data_vencimento, status, conta_id,
      cliente_id, referencia_venda_id
    ) values (
      v_user, 'receber',
      'Fiado — venda ' || v_venda.numero || coalesce(' — ' || v_cliente_nome, ''),
      v_total, coalesce(p_data_vencimento, current_date + 30), 'pendente', p_conta_id,
      p_cliente_id, v_venda.id
    );
  end if;

  return query select v_venda.id, v_venda.numero, v_total, v_lucro;
end;
$$;

-- ============================================================
-- quitar_conta_pagar_receber: propaga referencia_venda_id e
-- referencia_pedido_compra_id da conta para a movimentação financeira gerada.
-- Sem isso, cancelar uma venda fiado JÁ RECEBIDA não teria como localizar a
-- entrada no caixa para estornar, e o saldo ficaria com dinheiro fantasma.
-- (create or replace é seguro aqui: returns void, mesma assinatura.)
-- ============================================================

create or replace function quitar_conta_pagar_receber(p_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_tipo text;
  v_valor numeric;
  v_conta_id uuid;
  v_descricao text;
  v_ref_venda uuid;
  v_ref_pedido uuid;
  v_novo_status text;
  v_delta numeric;
begin
  select tipo, valor, conta_id, descricao, referencia_venda_id, referencia_pedido_compra_id
  into v_tipo, v_valor, v_conta_id, v_descricao, v_ref_venda, v_ref_pedido
  from contas_a_pagar_receber
  where id = p_id and user_id = auth.uid();

  if not found then
    raise exception 'Registro não encontrado ou não pertence ao usuário atual';
  end if;

  v_novo_status := case when v_tipo = 'pagar' then 'pago' else 'recebido' end;

  update contas_a_pagar_receber set status = v_novo_status where id = p_id and user_id = auth.uid();

  if v_conta_id is not null then
    v_delta := case when v_tipo = 'pagar' then -v_valor else v_valor end;

    insert into movimentacoes_financeiras (
      user_id, tipo, valor, descricao, origem, categoria, conta_id, afeta_lucro,
      data_movimentacao, referencia_venda_id, referencia_pedido_compra_id
    )
    values (
      auth.uid(),
      case when v_tipo = 'pagar' then 'saida' else 'entrada' end,
      v_delta,
      v_descricao,
      case when v_tipo = 'pagar' then 'Conta a pagar quitada' else 'Conta a receber recebida' end,
      null,
      v_conta_id,
      true,
      current_date,
      v_ref_venda,
      v_ref_pedido
    );

    update contas set saldo = saldo + v_delta where id = v_conta_id and user_id = auth.uid();
  end if;
end;
$$;

-- ============================================================
-- cancelar_venda: devolve estoque, estorna o financeiro e marca a venda como
-- cancelada. A venda NUNCA é apagada — o número precisa continuar queimado e o
-- histórico auditável.
-- ============================================================

create or replace function cancelar_venda(p_venda_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_user     uuid := auth.uid();
  v_venda    vendas%rowtype;
  v_cpr      contas_a_pagar_receber%rowtype;
  v_mov      record;
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
  update produtos p
  set estoque = p.estoque + agg.qtd
  from (
    select produto_id, sum(quantidade) as qtd
    from venda_itens
    where venda_id = p_venda_id and produto_id is not null
    group by 1
  ) agg
  where p.id = agg.produto_id and p.user_id = v_user;

  insert into estoque_movimentacoes (
    user_id, produto_id, produto_nome, tipo, quantidade, motivo, data_movimentacao
  )
  select v_user, vi.produto_id, vi.produto_nome, 'entrada', vi.quantidade,
         'Cancelamento da venda ' || v_venda.numero, now()
  from venda_itens vi
  where vi.venda_id = p_venda_id;

  -- 2. Financeiro.
  if v_venda.status = 'paga' then
    for v_mov in
      select id from movimentacoes_financeiras
      where referencia_venda_id = p_venda_id and user_id = v_user
    loop
      perform desfazer_movimentacao_financeira(v_mov.id);
      v_estornos := v_estornos + 1;
    end loop;

    if v_estornos = 0 then
      raise exception
        'A entrada no caixa da venda % não foi encontrada. Estorne o lançamento manualmente no Financeiro antes de cancelar.',
        v_venda.numero;
    end if;
  else
    select * into v_cpr
    from contas_a_pagar_receber
    where referencia_venda_id = p_venda_id and user_id = v_user
    for update;

    if found then
      if v_cpr.status = 'pendente' then
        -- Nada tocou o caixa ainda.
        delete from contas_a_pagar_receber where id = v_cpr.id;
      else
        for v_mov in
          select id from movimentacoes_financeiras
          where referencia_venda_id = p_venda_id and user_id = v_user
        loop
          perform desfazer_movimentacao_financeira(v_mov.id);
          v_estornos := v_estornos + 1;
        end loop;

        if v_estornos = 0 then
          raise exception
            'O fiado da venda % já foi recebido, mas a entrada no caixa não foi localizada. Estorne o recebimento manualmente no Financeiro e tente de novo.',
            v_venda.numero;
        end if;

        delete from contas_a_pagar_receber where id = v_cpr.id;
      end if;
    end if;
  end if;

  update vendas
  set status = 'cancelada', cancelada_em = now()
  where id = p_venda_id and user_id = v_user;
end;
$$;

-- ============================================================
-- Vitrine pública com variantes: continua UMA LINHA POR SKU (assim o filtro
-- estoque > 0 segue escondendo a variante esgotada, e o grupo só some da
-- vitrine quando todas as variantes zeram) + as colunas do grupo para o client
-- montar UM card com seletor de variante.
--
-- Muda a lista de colunas de uma RETURNS TABLE => DROP obrigatório antes de
-- recriar. Foi exatamente essa armadilha que derrubou a vitrine na 0016/0017.
--
-- Compatível com os dados de hoje: sem nenhum grupo cadastrado,
-- coalesce(g.nome, p.nome) = p.nome e as colunas novas vêm nulas.
-- ============================================================

drop function if exists obter_catalogo_publico(text);

create function obter_catalogo_publico(p_slug text)
returns table (
  catalogo_nome text,
  produto_id uuid,
  produto_nome text,
  grupo_id uuid,
  grupo_nome text,
  variante_nome text,
  descricao text,
  imagem_url text,
  categoria_nome text,
  preco numeric,
  imagens_extra text[],
  negocio_whatsapp text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogo record;
  v_whatsapp text;
begin
  select id, user_id, nome into v_catalogo
  from catalogos where slug = p_slug and ativo = true;

  if not found then
    return;
  end if;

  select whatsapp into v_whatsapp from perfil_negocio where user_id = v_catalogo.user_id;

  return query
  select
    v_catalogo.nome,
    p.id,
    coalesce(g.nome, p.nome),
    p.grupo_id,
    g.nome,
    p.variante_nome,
    coalesce(p.descricao, g.descricao),
    coalesce(p.imagem_url, g.imagem_url),
    c.nome,
    coalesce(cp.preco, p.preco_venda),
    coalesce(
      (select array_agg(pi.url order by pi.ordem) from produto_imagens pi where pi.produto_id = p.id),
      array[]::text[]
    ),
    v_whatsapp
  from (select 1) as catalogo_encontrado
  left join produtos p on p.user_id = v_catalogo.user_id and p.ativo = true and p.estoque > 0
  left join produto_grupos g on g.id = p.grupo_id
  left join categorias c on c.id = coalesce(p.categoria_id, g.categoria_id)
  left join catalogo_precos cp on cp.catalogo_id = v_catalogo.id and cp.produto_id = p.id
  order by c.nome nulls last, coalesce(g.nome, p.nome), p.variante_nome nulls first
  limit 500;
end;
$$;

grant execute on function obter_catalogo_publico(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';

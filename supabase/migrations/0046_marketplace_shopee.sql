-- ============================================================
-- 0046 — Marketplace (Shopee): pedidos importados da planilha, vínculo de SKU, baixa de
-- estoque no armazém que abastece a loja e repasse previsto no Financeiro (Fase 8.9).
--
-- * `pedidos_marketplace` + `pedidos_marketplace_itens`: um pedido por (conta, loja, número).
--   Reimportar ATUALIZA (status, taxas, margem) sem duplicar.
-- * `marketplace_vinculos`: SKU da Shopee → produto cadastrado, para quando o SKU não bate.
-- * `importar_pedidos_marketplace(loja, pedidos jsonb)`: a única porta de escrita dos pedidos.
--     - Status a_enviar/enviado/concluido → baixa do estoque (uma vez só por pedido), no
--       armazém que tem a loja em `armazens.loja_ids` (0041); sem nenhum, a regra padrão.
--     - Pedido que já baixou e virou cancelado/devolvido → estorno.
--     - Repasse > 0 → conta a receber pendente (vence 15 dias depois do pagamento); muda o
--       valor se a planilha mudar; cancelado remove a conta enquanto ainda estiver pendente.
--     Custo, imposto e lucro chegam calculados pela tela (`lib/marketplace/margem.ts`).
-- * `marketplace_conexoes`: tokens da API oficial (cifrados no app). Fica vazia até existir
--   SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists marketplace_vinculos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  loja_id     uuid not null references lojas_canal(id) on delete cascade,
  sku_externo text not null check (length(sku_externo) between 1 and 300),
  produto_id  uuid not null references produtos(id) on delete cascade,
  criado_em   timestamptz not null default now()
);
create unique index if not exists marketplace_vinculos_unico on marketplace_vinculos (user_id, loja_id, lower(sku_externo));

alter table marketplace_vinculos enable row level security;
drop policy if exists "dono_marketplace_vinculos" on marketplace_vinculos;
create policy "dono_marketplace_vinculos" on marketplace_vinculos for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_mkt_loja on marketplace_vinculos;
create trigger trg_valida_vinculo_mkt_loja
before insert or update of loja_id on marketplace_vinculos
for each row execute function validar_vinculo_do_dono('loja_id', 'lojas_canal');

drop trigger if exists trg_valida_vinculo_mkt_produto on marketplace_vinculos;
create trigger trg_valida_vinculo_mkt_produto
before insert or update of produto_id on marketplace_vinculos
for each row execute function validar_vinculo_do_dono('produto_id', 'produtos');

create table if not exists pedidos_marketplace (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users on delete cascade,
  loja_id              uuid not null references lojas_canal(id) on delete cascade,
  plataforma           text not null default 'shopee',
  numero               text not null,
  status               text not null check (status in ('nao_pago', 'a_enviar', 'enviado', 'concluido', 'cancelado', 'devolvido')),
  status_original      text,
  criado_em_plataforma timestamptz,
  pago_em              timestamptz,
  comprador            text,
  cidade               text,
  uf                   text,
  rastreio             text,
  subtotal             numeric not null default 0,
  desconto_vendedor    numeric not null default 0,
  cupom_vendedor       numeric not null default 0,
  comissao             numeric not null default 0,
  taxa_servico         numeric not null default 0,
  taxa_transacao       numeric not null default 0,
  frete_comprador      numeric not null default 0,
  repasse              numeric not null default 0,
  custo                numeric not null default 0,
  imposto              numeric not null default 0,
  lucro                numeric not null default 0,
  custo_incompleto     boolean not null default false,
  estoque_baixado      boolean not null default false,
  conta_receber_id     uuid references contas_a_pagar_receber(id) on delete set null,
  importado_em         timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  unique (user_id, loja_id, numero)
);
create index if not exists pedidos_marketplace_user_data_idx on pedidos_marketplace (user_id, criado_em_plataforma desc);

create table if not exists pedidos_marketplace_itens (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade,
  pedido_id      uuid not null references pedidos_marketplace(id) on delete cascade,
  produto_id     uuid references produtos(id) on delete set null,
  sku            text,
  sku_principal  text,
  nome           text not null,
  variacao       text,
  quantidade     integer not null check (quantidade > 0),
  preco_unitario numeric not null default 0,
  custo_unitario numeric
);
create index if not exists pedidos_marketplace_itens_pedido_idx on pedidos_marketplace_itens (pedido_id);
create index if not exists pedidos_marketplace_itens_produto_idx on pedidos_marketplace_itens (produto_id);

-- Leitura pelo dono; escrita só pela RPC abaixo (ou apagar o pedido inteiro).
alter table pedidos_marketplace enable row level security;
drop policy if exists "le_pedidos_marketplace" on pedidos_marketplace;
create policy "le_pedidos_marketplace" on pedidos_marketplace for select
  using (auth.uid() = user_id and conta_ativa());

alter table pedidos_marketplace_itens enable row level security;
drop policy if exists "le_pedidos_marketplace_itens" on pedidos_marketplace_itens;
create policy "le_pedidos_marketplace_itens" on pedidos_marketplace_itens for select
  using (auth.uid() = user_id and conta_ativa());

create table if not exists marketplace_conexoes (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users on delete cascade default auth.uid(),
  loja_id               uuid not null references lojas_canal(id) on delete cascade,
  plataforma            text not null default 'shopee',
  shop_id               text not null,
  access_token_cifrado  text,
  refresh_token_cifrado text,
  expira_em             timestamptz,
  ultima_sincronizacao  timestamptz,
  ultimo_erro           text,
  criado_em             timestamptz not null default now(),
  unique (user_id, loja_id)
);

alter table marketplace_conexoes enable row level security;
-- Os tokens chegam aqui já cifrados pelo servidor (AES-GCM, chave-mestra só no ambiente,
-- user_id como AAD): ler a linha não dá acesso à loja. As telas nem selecionam essas colunas.
drop policy if exists "le_marketplace_conexoes" on marketplace_conexoes;
drop policy if exists "apaga_marketplace_conexoes" on marketplace_conexoes;
drop policy if exists "dono_marketplace_conexoes" on marketplace_conexoes;
create policy "dono_marketplace_conexoes" on marketplace_conexoes for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_mkt_conexao_loja on marketplace_conexoes;
create trigger trg_valida_vinculo_mkt_conexao_loja
before insert or update of loja_id on marketplace_conexoes
for each row execute function validar_vinculo_do_dono('loja_id', 'lojas_canal');

-- ------------------------------------------------------------
-- Importação
-- ------------------------------------------------------------
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
  v_conta    uuid;
  v_repasse  numeric;
  v_venc     date;
  v_prod     uuid;
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
    v_baixa := v_status in ('a_enviar', 'enviado', 'concluido');
    v_repasse := greatest(0, coalesce((v_p->>'repasse')::numeric, 0));

    select id, estoque_baixado, conta_receber_id into v_antigo
      from pedidos_marketplace
     where user_id = v_user and loja_id = p_loja_id and numero = v_p->>'numero'
     for update;

    if v_antigo.id is null then
      insert into pedidos_marketplace (user_id, loja_id, numero, status)
      values (v_user, p_loja_id, left(v_p->>'numero', 80), v_status)
      returning id into v_id;
      v_baixado := false;
      v_conta := null;
      v_novos := v_novos + 1;
    else
      v_id := v_antigo.id;
      v_baixado := v_antigo.estoque_baixado;
      v_conta := v_antigo.conta_receber_id;
      v_atual := v_atual + 1;
    end if;

    -- Estorno: já tinha saído do estoque e agora foi cancelado/devolvido.
    if v_baixado and not v_baixa then
      for v_item in select produto_id, quantidade from pedidos_marketplace_itens where pedido_id = v_id and produto_id is not null
      loop
        perform registrar_movimentacao_estoque(v_item.produto_id, 'entrada', v_item.quantidade, left(format('Estorno %s %s pedido %s', 'Shopee', v_loja, v_p->>'numero'), 300));
      end loop;
      v_baixado := false;
      v_estornos := v_estornos + 1;
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

    -- Repasse previsto no Financeiro.
    if v_baixa and v_repasse > 0 then
      v_venc := (coalesce(nullif(v_p->>'pago_em', '')::timestamptz, nullif(v_p->>'criado_em', '')::timestamptz, now()) at time zone 'America/Sao_Paulo')::date + 15;
      if v_conta is not null and exists (select 1 from contas_a_pagar_receber where id = v_conta and user_id = v_user) then
        update contas_a_pagar_receber set valor = v_repasse
         where id = v_conta and status = 'pendente';
      else
        insert into contas_a_pagar_receber (user_id, tipo, descricao, valor, data_vencimento, status)
        values (v_user, 'receber', left(format('Repasse Shopee %s — pedido %s', v_loja, v_p->>'numero'), 300), v_repasse, v_venc, 'pendente')
        returning id into v_conta;
      end if;
    elsif not v_baixa and v_conta is not null then
      delete from contas_a_pagar_receber where id = v_conta and user_id = v_user and status = 'pendente';
      if not found then
        -- Já recebida: fica como está (o dono resolve a devolução no Financeiro).
        null;
      else
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
      cupom_vendedor       = coalesce((v_p->>'cupom_vendedor')::numeric, 0),
      comissao             = coalesce((v_p->>'comissao')::numeric, 0),
      taxa_servico         = coalesce((v_p->>'taxa_servico')::numeric, 0),
      taxa_transacao       = coalesce((v_p->>'taxa_transacao')::numeric, 0),
      frete_comprador      = coalesce((v_p->>'frete_comprador')::numeric, 0),
      repasse              = v_repasse,
      custo                = coalesce((v_p->>'custo')::numeric, 0),
      imposto              = coalesce((v_p->>'imposto')::numeric, 0),
      lucro                = coalesce((v_p->>'lucro')::numeric, 0),
      custo_incompleto     = coalesce((v_p->>'custo_incompleto')::boolean, false),
      estoque_baixado      = v_baixado,
      conta_receber_id     = v_conta,
      atualizado_em        = now()
    where id = v_id;
  end loop;

  return jsonb_build_object('novos', v_novos, 'atualizados', v_atual, 'baixas', v_baixas, 'estornos', v_estornos, 'armazem_id', v_armazem);
end;
$$;

revoke execute on function importar_pedidos_marketplace(uuid, jsonb) from public, anon;
grant execute on function importar_pedidos_marketplace(uuid, jsonb) to authenticated;

-- Sincronização automática (cron da Vercel, com a service key): roda a MESMA importação
-- como se fosse o dono da loja. Só o service_role executa.
create or replace function importar_pedidos_marketplace_servico(p_user uuid, p_loja_id uuid, p_pedidos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from lojas_canal where id = p_loja_id and user_id = p_user) then
    raise exception 'Loja não encontrada.';
  end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  return importar_pedidos_marketplace(p_loja_id, p_pedidos);
end;
$$;

revoke execute on function importar_pedidos_marketplace_servico(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function importar_pedidos_marketplace_servico(uuid, uuid, jsonb) to service_role;

-- Apagar um pedido importado: devolve o estoque (se baixou) e tira a conta pendente.
create or replace function remover_pedido_marketplace(p_pedido_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_p    record;
  v_item record;
  v_armazem uuid;
begin
  select * into v_p from pedidos_marketplace where id = p_pedido_id and user_id = v_user for update;
  if v_p.id is null then
    raise exception 'Pedido não encontrado.';
  end if;
  if v_p.estoque_baixado then
    select id into v_armazem from armazens where user_id = v_user and v_p.loja_id = any(coalesce(loja_ids, '{}')) order by criado_em limit 1;
    perform set_config('app.armazem_mov', coalesce(v_armazem::text, ''), true);
    for v_item in select produto_id, quantidade from pedidos_marketplace_itens where pedido_id = v_p.id and produto_id is not null
    loop
      perform registrar_movimentacao_estoque(v_item.produto_id, 'entrada', v_item.quantidade, left(format('Pedido Shopee %s removido', v_p.numero), 300));
    end loop;
  end if;
  if v_p.conta_receber_id is not null then
    delete from contas_a_pagar_receber where id = v_p.conta_receber_id and user_id = v_user and status = 'pendente';
  end if;
  delete from pedidos_marketplace where id = v_p.id;
end;
$$;

revoke execute on function remover_pedido_marketplace(uuid) from public, anon;
grant execute on function remover_pedido_marketplace(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';

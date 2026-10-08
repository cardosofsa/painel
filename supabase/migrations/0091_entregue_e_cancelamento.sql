-- ============================================================
-- 0091 — Etapa "Entregue" e quem cancelou o pedido.
--
-- Por quê: até aqui "Marcar entregue" levava o pedido direto de Enviado para Concluído, então não
-- havia como ver o que já chegou ao cliente e ainda não foi concluído. Agora a esteira tem
-- Enviado → Entregue → Concluído, e os cancelamentos mostram quem cancelou.
--
-- 1) Pedidos do SISTEMA (PDV, catálogo, manuais): 'entregue' passa a ser uma etapa válida de
--    `vendas` (constraint, trigger de sincronização com `status_envio` e RPC `avancar_etapa_vendas`).
--    Entregue conta como envio em aberto (`status_envio = 'enviado'`) até o dono concluir. Vendas já
--    Concluídas continuam Concluídas.
-- 2) Pedidos de MARKETPLACE: a função grande `importar_pedidos_marketplace` NÃO muda. `entregue_em`,
--    `cancelado_por` ('comprador' | 'vendedor' | 'sistema') e `motivo_cancelamento` são gravados por
--    uma RPC pequena, no mesmo padrão de `atualizar_envio_marketplace` (0047). A central deriva a
--    etapa Entregue de `status = 'enviado'` com `entregue_em` preenchido.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Etapa 'entregue' nas vendas do sistema -------------------------------------------------
alter table vendas drop constraint if exists vendas_etapa_valida;
alter table vendas add constraint vendas_etapa_valida
  check (etapa is null or etapa in ('reservar', 'emitir', 'enviar', 'imprimir', 'retirada', 'enviado', 'entregue', 'concluido'));

create or replace function sincronizar_etapa_venda()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.etapa is null then
      new.etapa := case
        when new.status_envio = 'separacao' then 'enviar'
        when new.status_envio = 'enviado' then 'enviado'
        when new.status_envio = 'concluido' then 'concluido'
        -- Balcão: com entrega já sai (Enviado); sem entrega, Concluído.
        when coalesce(new.valor_entrega, 0) > 0 then 'enviado'
        else 'concluido'
      end;
    end if;
    if new.status_envio is null then
      new.status_envio := case
        when new.etapa in ('reservar', 'emitir', 'enviar', 'imprimir', 'retirada') then 'separacao'
        when new.etapa in ('enviado', 'entregue') then 'enviado'
        else null
      end;
    end if;
  elsif new.etapa is distinct from old.etapa then
    new.status_envio := case new.etapa
      when 'enviado' then 'enviado'
      -- Entregue ainda não é o fim: segue como envio em aberto até o dono concluir.
      when 'entregue' then 'enviado'
      when 'concluido' then case when old.status_envio is null then null else 'concluido' end
      else 'separacao'
    end;
  elsif new.status_envio is distinct from old.status_envio then
    new.etapa := case new.status_envio
      when 'separacao' then case when old.etapa in ('reservar', 'emitir', 'enviar', 'imprimir', 'retirada') then old.etapa else 'enviar' end
      -- Envio em aberto com a venda já Entregue: continua Entregue.
      when 'enviado' then case when old.etapa = 'entregue' then 'entregue' else 'enviado' end
      else 'concluido'
    end;
  end if;
  return new;
end;
$$;

create or replace function avancar_etapa_vendas(p_ids uuid[], p_etapa text)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_venda record;
  v_falta text;
  v_n     integer := 0;
  v_baixa boolean := p_etapa in ('imprimir', 'retirada', 'enviado', 'entregue', 'concluido');
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if p_etapa not in ('reservar', 'emitir', 'enviar', 'imprimir', 'retirada', 'enviado', 'entregue', 'concluido') then
    raise exception 'Etapa inválida: %', p_etapa;
  end if;

  for v_venda in
    select id, numero, etapa, estoque_baixado from vendas
     where user_id = v_user and id = any(p_ids) and status <> 'cancelada'
     order by id
     for update
  loop
    if not v_venda.estoque_baixado then
      -- Saindo de Para Reservar: precisa conseguir reservar tudo.
      if v_venda.etapa = 'reservar' and p_etapa <> 'reservar'
         and not exists (select 1 from estoque_reservas where venda_id = v_venda.id) then
        select p.nome into v_falta
          from venda_itens vi join produtos p on p.id = vi.produto_id
         where vi.venda_id = v_venda.id
         group by p.id, p.nome, p.estoque
        having p.estoque - coalesce((select sum(r.quantidade) from estoque_reservas r where r.produto_id = p.id), 0) < sum(vi.quantidade)
         limit 1;
        if v_falta is not null then
          raise exception 'Sem estoque disponível de "%" para o pedido %.', v_falta, v_venda.numero;
        end if;
        insert into estoque_reservas (user_id, produto_id, quantidade, origem, venda_id)
        select v_user, produto_id, sum(quantidade), 'venda', v_venda.id
          from venda_itens where venda_id = v_venda.id and produto_id is not null group by produto_id;
      end if;

      -- Para Imprimir em diante: a reserva vira baixa.
      if v_baixa then
        delete from estoque_reservas where venda_id = v_venda.id;
        update produtos p set estoque = p.estoque - agg.qtd
          from (select produto_id, sum(quantidade) as qtd from venda_itens where venda_id = v_venda.id and produto_id is not null group by 1) agg
         where p.id = agg.produto_id and p.user_id = v_user;
        insert into estoque_movimentacoes (user_id, produto_id, produto_nome, tipo, quantidade, motivo, data_movimentacao)
        select v_user, vi.produto_id, vi.produto_nome, 'saida', vi.quantidade, 'Venda ' || v_venda.numero || ' (expedição)', now()
          from venda_itens vi where vi.venda_id = v_venda.id and vi.produto_id is not null;
        update vendas set estoque_baixado = true where id = v_venda.id;
      end if;
    end if;

    update vendas set etapa = p_etapa where id = v_venda.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

grant execute on function avancar_etapa_vendas(uuid[], text) to authenticated;

-- 2) Entrega e cancelamento dos pedidos de marketplace --------------------------------------
alter table pedidos_marketplace add column if not exists entregue_em timestamptz;
alter table pedidos_marketplace add column if not exists cancelado_por text;
alter table pedidos_marketplace add column if not exists motivo_cancelamento text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_marketplace_cancelado_por_check') then
    alter table pedidos_marketplace add constraint pedidos_marketplace_cancelado_por_check
      check (cancelado_por is null or cancelado_por in ('comprador', 'vendedor', 'sistema'));
  end if;
end $$;

-- p_situacoes: [{"numero": "...", "entregue_em": "2026-10-08T12:00:00Z", "cancelado_por": "comprador",
--                "motivo_cancelamento": "..."}]. Campo ausente não apaga o que já estava gravado.
create or replace function atualizar_situacao_marketplace(p_loja_id uuid, p_situacoes jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_s    jsonb;
  v_n    integer := 0;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not conta_ativa() then
    raise exception 'Conta sem acesso no momento.';
  end if;
  if not exists (select 1 from lojas_canal where id = p_loja_id and user_id = v_user) then
    raise exception 'Loja não encontrada.';
  end if;
  if jsonb_typeof(p_situacoes) <> 'array' or jsonb_array_length(p_situacoes) > 2000 then
    raise exception 'Envie no máximo 2.000 pedidos por vez.';
  end if;
  for v_s in select * from jsonb_array_elements(p_situacoes)
  loop
    update pedidos_marketplace
       set entregue_em = coalesce(nullif(v_s->>'entregue_em', '')::timestamptz, entregue_em),
           cancelado_por = coalesce(case when v_s->>'cancelado_por' in ('comprador', 'vendedor', 'sistema') then v_s->>'cancelado_por' end, cancelado_por),
           motivo_cancelamento = coalesce(left(nullif(v_s->>'motivo_cancelamento', ''), 300), motivo_cancelamento)
     where user_id = v_user and loja_id = p_loja_id and numero = v_s->>'numero';
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end;
$$;

revoke execute on function atualizar_situacao_marketplace(uuid, jsonb) from public, anon;
grant execute on function atualizar_situacao_marketplace(uuid, jsonb) to authenticated;

-- Mesma rotina pelo cron (service_role), como a importação.
create or replace function atualizar_situacao_marketplace_servico(p_user uuid, p_loja_id uuid, p_situacoes jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from lojas_canal where id = p_loja_id and user_id = p_user) then
    raise exception 'Loja não encontrada.';
  end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  return atualizar_situacao_marketplace(p_loja_id, p_situacoes);
end;
$$;

revoke execute on function atualizar_situacao_marketplace_servico(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function atualizar_situacao_marketplace_servico(uuid, uuid, jsonb) to service_role;

NOTIFY pgrst, 'reload schema';

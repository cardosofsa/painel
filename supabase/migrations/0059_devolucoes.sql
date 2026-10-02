-- ============================================================
-- 0059 — Devolução e troca com estorno parcial (Fase 11.3).
--
-- Cancelar desfaz a venda INTEIRA. Agora dá para devolver parte dela:
--   * por item e quantidade (até o que ainda não foi devolvido);
--   * cada item volta ao ESTOQUE ou vai para AVARIA (não volta); se o pedido ainda estava
--     só reservado (esteira 0052), libera a reserva;
--   * estorno: 'reembolso' (sai do caixa escolhido), 'abater' (reduz o fiado/parcelas em
--     aberto da venda), 'troca' (vira crédito para a nova venda no PDV) ou 'nenhum';
--   * a venda é ajustada (total, custo e lucro) para relatórios e Visão Geral baterem.
-- Kits (0058) funcionam igual: devolver o kit ao estoque devolve os componentes.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists devolucoes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  venda_id     uuid not null references vendas(id) on delete cascade,
  numero       text not null,
  tipo         text not null check (tipo in ('devolucao', 'troca')),
  motivo       text check (motivo is null or length(motivo) <= 500),
  valor_estorno numeric(12,2) not null default 0 check (valor_estorno >= 0),
  forma        text not null check (forma in ('reembolso', 'abater', 'troca', 'nenhum')),
  conta_id     uuid references contas(id) on delete set null,
  criado_em    timestamptz not null default now(),
  unique (user_id, numero)
);

create table if not exists devolucao_itens (
  id             uuid primary key default gen_random_uuid(),
  devolucao_id   uuid not null references devolucoes(id) on delete cascade,
  venda_item_id  uuid references venda_itens(id) on delete set null,
  produto_id     uuid references produtos(id) on delete set null,
  produto_nome   text not null,
  quantidade     integer not null check (quantidade > 0),
  valor_unitario numeric(12,2) not null default 0,
  custo_unitario numeric(12,2) not null default 0,
  destino        text not null check (destino in ('estoque', 'avaria'))
);
create index if not exists devolucao_itens_venda_item_idx on devolucao_itens (venda_item_id);
create index if not exists devolucoes_venda_idx on devolucoes (venda_id);

alter table devolucoes enable row level security;
drop policy if exists "dono_devolucoes" on devolucoes;
create policy "dono_devolucoes" on devolucoes for select using (auth.uid() = user_id and conta_ativa());
alter table devolucao_itens enable row level security;
drop policy if exists "dono_devolucao_itens" on devolucao_itens;
create policy "dono_devolucao_itens" on devolucao_itens for select
  using (exists (select 1 from devolucoes d where d.id = devolucao_id and d.user_id = auth.uid()) and conta_ativa());

alter table vendas add column if not exists valor_devolvido numeric(12,2) not null default 0;

-- p_itens: [{ "venda_item_id": uuid, "quantidade": int, "destino": "estoque"|"avaria" }]
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
-- definer: devolucoes/devolucao_itens só têm leitura para o dono; tudo aqui filtra por v_user.
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
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
                                              'devolucao', 'Devoluções', p_conta_id, true, current_date);
  elsif p_forma = 'abater' and v_restante > 0 then
    -- Venda parcelada: as parcelas e a conta a receber são o MESMO dinheiro (a conta a receber
    -- é o total). Abate das parcelas em aberto (da última para a primeira) e reduz a conta a
    -- receber pelo mesmo valor. Sem parcelas, abate só da conta a receber.
    if exists (select 1 from venda_parcelas where venda_id = p_venda_id and status = 'pendente') then
      if (select coalesce(sum(valor), 0) from venda_parcelas where venda_id = p_venda_id and status = 'pendente') + 0.005 < v_restante then
        raise exception 'Não há valor em aberto suficiente nesta venda para abater. Use reembolso.';
      end if;
      for v_parc in select * from venda_parcelas where venda_id = p_venda_id and status = 'pendente' order by numero desc for update loop
        exit when v_restante <= 0;
        v_tirar := least(v_parc.valor, v_restante);
        if v_tirar >= v_parc.valor then
          delete from venda_parcelas where id = v_parc.id;
        else
          update venda_parcelas set valor = valor - v_tirar where id = v_parc.id;
        end if;
        v_restante := v_restante - v_tirar;
      end loop;
      v_restante := round(coalesce(p_valor_estorno, 0), 2);
    elsif (select coalesce(sum(valor), 0) from contas_a_pagar_receber where referencia_venda_id = p_venda_id and status = 'pendente') + 0.005 < v_restante then
      raise exception 'Não há valor em aberto suficiente nesta venda para abater. Use reembolso.';
    end if;
    for v_cpr in select * from contas_a_pagar_receber where referencia_venda_id = p_venda_id and status = 'pendente' for update loop
      exit when v_restante <= 0;
      v_tirar := least(v_cpr.valor, v_restante);
      if v_tirar >= v_cpr.valor then
        delete from contas_a_pagar_receber where id = v_cpr.id;
      else
        update contas_a_pagar_receber set valor = valor - v_tirar where id = v_cpr.id;
      end if;
      v_restante := v_restante - v_tirar;
    end loop;
  end if;

  -- A venda passa a refletir o que ficou.
  update vendas set
    total = round(total - coalesce(p_valor_estorno, 0), 2),
    custo_total = round(greatest(0, custo_total - v_custo_volta), 2),
    lucro = round(lucro - coalesce(p_valor_estorno, 0) + v_custo_volta, 2),
    valor_devolvido = round(valor_devolvido + coalesce(p_valor_estorno, 0), 2)
  where id = p_venda_id;

  return jsonb_build_object('id', v_dev_id, 'numero', v_numero, 'valor_itens', round(v_valor_itens, 2), 'estorno', round(coalesce(p_valor_estorno, 0), 2));
end;
$$;

revoke execute on function registrar_devolucao(uuid, jsonb, numeric, text, uuid, text, text) from public, anon;
grant execute on function registrar_devolucao(uuid, jsonb, numeric, text, uuid, text, text) to authenticated;

NOTIFY pgrst, 'reload schema';

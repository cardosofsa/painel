-- ============================================================
-- 0106 — Valor, cliente e itens da venda só mudam pelas funções do banco.
--
-- Por quê: editar uma venda pede o PIN de administração (`editar_venda`, 0021/0081), mas a
-- policy de `vendas` (e a de `venda_itens`, pelo pai) deixa o dono fazer UPDATE e DELETE
-- direto pela API. Quem usa o modo operador (a mesma sessão do dono) abria o console e
-- trocava total, desconto, cliente ou forma de pagamento, ou apagava a venda, sem PIN e sem
-- mexer no caixa. Regra do projeto: se a trava só existe no app, ela não existe.
--
-- O que muda: escrita feita DIRETO NA TABELA pela API (PostgREST, `request.path` = /vendas)
-- não pode mais mudar os campos de dinheiro e de identidade da venda, apagar a venda, nem
-- inserir, alterar ou apagar itens. Tudo isso continua pelas funções (registrar_venda,
-- editar_venda com PIN, cancelar_venda, registrar_devolucao...), que chegam por /rpc/.
--
-- O que NÃO muda: etapa, status de envio, logística, rastreio, frete e etiqueta, observação
-- interna, tags, ocultar, operador e lucro (recalculado pelo gatilho) seguem editáveis pela
-- tela, como hoje. O service role (cron, webhooks) e o SQL Editor não passam por esta trava.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- Escrita direta na tabela pela API de um usuário logado (não RPC, não service role)?
create or replace function escrita_direta_pela_api()
returns boolean
language sql
stable
set search_path = public
as $$
  -- `pg_trigger_depth() <= 1`: só o comando do usuário. O que vem de outro gatilho ou de uma
  -- cascata (apagar um produto ou cliente zera a referência na venda: `on delete set null`)
  -- passa; senão apagar um produto que já vendeu daria erro.
  select pg_trigger_depth() <= 1
     and coalesce(current_setting('request.path', true), '') <> ''
     and current_setting('request.path', true) not like '/rpc/%'
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role';
$$;

create or replace function vendas_trava_escrita_direta()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Dinheiro e identidade da venda. `to_jsonb` só tem as colunas que existem: coluna de
  -- migração não aplicada não atrapalha.
  v_campos constant text[] := array[
    'user_id', 'numero', 'cliente_id', 'cliente_nome', 'status', 'subtotal', 'desconto', 'valor_entrega',
    'total', 'custo_total', 'forma_pagamento', 'forma_pagamento_2', 'conta_id', 'observacao', 'data_venda',
    'cancelada_em', 'entrada_valor', 'entrada_forma', 'valor_devolvido', 'credito_troca', 'troca_devolucao_id',
    'imposto_valor', 'imposto_pct', 'taxa_maquineta_valor', 'taxa_maquineta_pct', 'parcelas_cartao',
    'total_parcelas_fiado', 'data_vencimento', 'valor_recebido', 'estoque_baixado'
  ];
  v_antes jsonb;
  v_depois jsonb;
  k text;
begin
  if not escrita_direta_pela_api() then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Venda não pode ser apagada direto. Use “Cancelar venda”.' using errcode = 'P0001';
  end if;
  v_antes := to_jsonb(old);
  v_depois := to_jsonb(new);
  foreach k in array v_campos loop
    if v_antes ? k and (v_antes -> k) is distinct from (v_depois -> k) then
      raise exception 'O campo % da venda só muda por “Editar venda” (com o PIN de administração).', k using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists vendas_trava_escrita_direta on vendas;
create trigger vendas_trava_escrita_direta
  before update or delete on vendas
  for each row execute function vendas_trava_escrita_direta();

create or replace function venda_itens_trava_escrita_direta()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if escrita_direta_pela_api() then
    raise exception 'Os itens de uma venda só mudam pelas funções da venda (registrar, editar com PIN, devolver).' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists venda_itens_trava_escrita_direta on venda_itens;
create trigger venda_itens_trava_escrita_direta
  before insert or update or delete on venda_itens
  for each row execute function venda_itens_trava_escrita_direta();

NOTIFY pgrst, 'reload schema';

-- Painel — compras avançadas, perfil do negócio, funções atômicas e storage.

-- ============================================================
-- Pedidos de compra: destino por armazém, NF anexada, entrega prevista, pagamento
-- ============================================================

alter table pedidos_compra
  add column armazem_id uuid references armazens(id) on delete set null,
  add column data_entrega_prevista date,
  add column nf_arquivo_path text,
  add column forma_pagamento text check (forma_pagamento in ('dinheiro', 'pix', 'cartao_parcelado')),
  add column parcelas integer;

-- ============================================================
-- Contas a pagar/receber: vínculo com o pedido de compra que as originou
-- ============================================================

alter table contas_a_pagar_receber
  add column referencia_pedido_compra_id uuid references pedidos_compra(id) on delete set null,
  add column forma_pagamento text;

-- ============================================================
-- Numeração sequencial do pedido: MV-00, MV-01, ...
-- ============================================================

create or replace function gerar_numero_pedido()
returns trigger
language plpgsql
security invoker
as $$
declare
  n integer;
begin
  if new.numero is null or new.numero = '' then
    select count(*) into n from pedidos_compra where user_id = new.user_id;
    new.numero := 'MV-' || lpad(n::text, 2, '0');
  end if;
  return new;
end;
$$;

create trigger trg_gerar_numero_pedido
before insert on pedidos_compra
for each row execute function gerar_numero_pedido();

-- ============================================================
-- Perfil do Negócio (uma linha por usuário)
-- ============================================================

create table perfil_negocio (
  user_id uuid primary key references auth.users default auth.uid(),
  nome_negocio text,
  cnpj text,
  regime_tributario text,
  aliquota_das numeric,
  atualizado_em timestamptz not null default now()
);

alter table perfil_negocio enable row level security;
create policy "own_rows_perfil_negocio" on perfil_negocio for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Funções atômicas: estoque e saldo de conta
-- ============================================================

create or replace function registrar_movimentacao_estoque(
  p_produto_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_motivo text
)
returns void
language plpgsql
security invoker
as $$
declare
  v_nome text;
  v_delta integer;
begin
  if p_tipo not in ('entrada', 'saida') then
    raise exception 'Tipo de movimentação inválido: %', p_tipo;
  end if;

  v_delta := case when p_tipo = 'entrada' then p_quantidade else -p_quantidade end;

  update produtos
  set estoque = greatest(0, estoque + v_delta)
  where id = p_produto_id and user_id = auth.uid()
  returning nome into v_nome;

  if not found then
    raise exception 'Produto não encontrado ou não pertence ao usuário atual';
  end if;

  insert into estoque_movimentacoes (user_id, produto_id, produto_nome, tipo, quantidade, motivo, data_movimentacao)
  values (auth.uid(), p_produto_id, v_nome, p_tipo, p_quantidade, p_motivo, now());
end;
$$;

create or replace function ajustar_saldo_conta(p_conta_id uuid, p_delta numeric)
returns void
language plpgsql
security invoker
as $$
begin
  update contas
  set saldo = saldo + p_delta
  where id = p_conta_id and user_id = auth.uid();

  if not found then
    raise exception 'Conta não encontrada ou não pertence ao usuário atual';
  end if;
end;
$$;

-- ============================================================
-- Storage: bucket público de imagens de produto
-- ============================================================

insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do nothing;

create policy "produtos_bucket_select_public" on storage.objects for select
  using (bucket_id = 'produtos');

create policy "produtos_bucket_insert_own" on storage.objects for insert
  with check (bucket_id = 'produtos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "produtos_bucket_update_own" on storage.objects for update
  using (bucket_id = 'produtos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "produtos_bucket_delete_own" on storage.objects for delete
  using (bucket_id = 'produtos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================
-- Storage: bucket privado de notas fiscais
-- ============================================================

insert into storage.buckets (id, name, public)
values ('notas-fiscais', 'notas-fiscais', false)
on conflict (id) do nothing;

create policy "notas_fiscais_select_own" on storage.objects for select
  using (bucket_id = 'notas-fiscais' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "notas_fiscais_insert_own" on storage.objects for insert
  with check (bucket_id = 'notas-fiscais' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "notas_fiscais_delete_own" on storage.objects for delete
  using (bucket_id = 'notas-fiscais' and (storage.foldername(name))[1] = auth.uid()::text);

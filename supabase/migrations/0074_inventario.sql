-- 0074 — Inventário (contagem de estoque) (Fase 4).
--
-- A pessoa conta o estoque (bipando o código de barras ou digitando) e aplica tudo de
-- uma vez. `aplicar_inventario` compara a contagem com o saldo ATUAL (do armazém, se
-- escolhido; senão o total do produto), lança a diferença como entrada/saída com motivo
-- "Inventário" e guarda o histórico em `inventarios` + `inventario_itens`.
--
-- A entrada usa registrar_movimentacao_estoque (sem mexer no custo médio: sobra de
-- contagem não é compra). Kit não entra (o estoque dele é calculado dos componentes).
--
-- Idempotente: if not exists, create or replace, drop ... if exists.

create table if not exists inventarios (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  armazem_id  uuid references armazens(id) on delete set null,
  observacao  text check (observacao is null or length(observacao) <= 300),
  itens       integer not null default 0,
  ajustes     integer not null default 0,
  criado_em   timestamptz not null default now()
);

create index if not exists inventarios_user_idx on inventarios (user_id, criado_em desc);
create index if not exists idx_fk_inventarios_armazem_id on inventarios (armazem_id) where armazem_id is not null;

alter table inventarios enable row level security;
drop policy if exists "dono_inventarios" on inventarios;
create policy "dono_inventarios" on inventarios for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_inventarios on inventarios;
create trigger trg_valida_vinculo_inventarios
  before insert or update of armazem_id on inventarios
  for each row execute function validar_vinculo_do_dono('armazem_id', 'armazens');

create table if not exists inventario_itens (
  id            uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references inventarios(id) on delete cascade,
  produto_id    uuid references produtos(id) on delete set null,
  produto_nome  text not null,
  esperado      integer not null check (esperado >= 0),
  contado       integer not null check (contado >= 0),
  unique (inventario_id, produto_id)
);

create index if not exists idx_fk_inventario_itens_produto_id on inventario_itens (produto_id) where produto_id is not null;

alter table inventario_itens enable row level security;
drop policy if exists "dono_inventario_itens" on inventario_itens;
create policy "dono_inventario_itens" on inventario_itens for all
  using (exists (select 1 from inventarios i where i.id = inventario_id and i.user_id = auth.uid() and conta_ativa()))
  with check (exists (select 1 from inventarios i where i.id = inventario_id and i.user_id = auth.uid() and conta_ativa()));

drop trigger if exists trg_valida_vinculo_inventario_itens on inventario_itens;
create trigger trg_valida_vinculo_inventario_itens
  before insert or update of produto_id on inventario_itens
  for each row execute function validar_vinculo_do_dono('produto_id', 'produtos');

-- p_itens: [{ "produto_id": uuid, "contado": int }, ...]. Devolve o id do inventário.
create or replace function aplicar_inventario(p_armazem_id uuid, p_itens jsonb, p_observacao text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_id      uuid;
  v_item    jsonb;
  v_prod    produtos%rowtype;
  v_contado integer;
  v_atual   integer;
  v_delta   integer;
  v_itens   integer := 0;
  v_ajustes integer := 0;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not conta_ativa() then
    raise exception 'Sua conta não está ativa. Fale com o administrador.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Conte pelo menos um produto antes de aplicar.';
  end if;
  if jsonb_array_length(p_itens) > 5000 then
    raise exception 'Inventário grande demais: aplique em partes de até 5.000 produtos.';
  end if;
  if p_armazem_id is not null and not exists (select 1 from armazens where id = p_armazem_id and user_id = v_user) then
    raise exception 'Armazém não encontrado.';
  end if;

  insert into inventarios (user_id, armazem_id, observacao)
  values (v_user, p_armazem_id, nullif(left(btrim(coalesce(p_observacao, '')), 300), ''))
  returning id into v_id;

  -- O trigger de saldo por armazém (0041) usa este armazém primeiro.
  perform set_config('app.armazem_mov', coalesce(p_armazem_id::text, ''), true);

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_contado := (v_item ->> 'contado')::integer;
    if v_contado is null or v_contado < 0 then
      raise exception 'Contagem inválida: use números a partir de zero.';
    end if;
    select * into v_prod from produtos where id = (v_item ->> 'produto_id')::uuid and user_id = v_user for update;
    if not found then
      raise exception 'Produto não encontrado.';
    end if;
    if v_prod.e_kit then
      raise exception 'O kit "%" não entra no inventário: conte os componentes.', v_prod.nome;
    end if;

    if p_armazem_id is null then
      v_atual := v_prod.estoque;
    else
      select coalesce(max(quantidade), 0) into v_atual from estoque_armazem where produto_id = v_prod.id and armazem_id = p_armazem_id;
    end if;

    begin
      insert into inventario_itens (inventario_id, produto_id, produto_nome, esperado, contado)
      values (v_id, v_prod.id, v_prod.nome || coalesce(' — ' || v_prod.variante_nome, ''), v_atual, v_contado);
    exception when unique_violation then
      raise exception 'O produto "%" aparece duas vezes na contagem.', v_prod.nome;
    end;

    v_itens := v_itens + 1;
    v_delta := v_contado - v_atual;
    if v_delta > 0 then
      perform registrar_movimentacao_estoque(v_prod.id, 'entrada', v_delta, 'Inventário');
      v_ajustes := v_ajustes + 1;
    elsif v_delta < 0 then
      perform registrar_movimentacao_estoque(v_prod.id, 'saida', -v_delta, 'Inventário');
      v_ajustes := v_ajustes + 1;
    end if;
  end loop;

  perform set_config('app.armazem_mov', '', true);
  update inventarios set itens = v_itens, ajustes = v_ajustes where id = v_id;
  return v_id;
end;
$$;

revoke execute on function aplicar_inventario(uuid, jsonb, text) from public, anon;
grant execute on function aplicar_inventario(uuid, jsonb, text) to authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 0041 — Estoque por armazém (Fase 8.3).
--
-- Desenho: `produtos.estoque` CONTINUA sendo o total do produto — venda, PDV, alertas,
-- relatórios e as RPCs antigas seguem lendo e escrevendo ali sem mudar nada. A nova tabela
-- `estoque_armazem` guarda como esse total se divide entre os armazéns.
--
-- Quem mantém as duas coisas iguais é o gatilho `sincronizar_estoque_armazem`, em
-- `produtos`: toda vez que o total muda, a diferença vai para um armazém.
--   * Se a função que mexeu informou o armazém (`set_config('app.armazem_mov', …)`, feito
--     pelas RPCs novas desta migração), vai para ele.
--   * Senão vai para o armazém padrão do produto (`produtos.armazem_id`), e se ele não
--     tiver o bastante numa saída, o resto sai dos outros armazéns, do maior saldo para o
--     menor. É o que faz uma venda antiga continuar funcionando sem saber de armazém.
--
-- `estoque_armazem` é só leitura para o app (RLS de select). Escrita só pelo gatilho e
-- pelas RPCs `security definer` daqui, então o saldo nunca é editado por fora.
--
-- Também: lojas abastecidas ligadas às lojas cadastradas (`armazens.loja_ids`), tipo
-- 'transferencia' nas movimentações, armazém gravado em cada movimentação e peso/medidas
-- de envio em produtos e grupos de variação.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Saldo por armazém.
create table if not exists estoque_armazem (
  user_id     uuid not null references auth.users on delete cascade,
  produto_id  uuid not null references produtos(id) on delete cascade,
  armazem_id  uuid not null references armazens(id),
  quantidade  integer not null default 0 check (quantidade >= 0),
  atualizado_em timestamptz not null default now(),
  primary key (produto_id, armazem_id)
);

create index if not exists estoque_armazem_user_idx on estoque_armazem (user_id);
create index if not exists estoque_armazem_armazem_idx on estoque_armazem (armazem_id);

alter table estoque_armazem enable row level security;
drop policy if exists "le_estoque_armazem" on estoque_armazem;
create policy "le_estoque_armazem" on estoque_armazem for select
  using (auth.uid() = user_id and conta_ativa());

-- 2) Armazém principal da conta: o primeiro cadastrado; sem nenhum, cria "Estoque principal".
create or replace function armazem_principal(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from armazens where user_id = p_user order by criado_em, id limit 1;
  if v_id is null then
    insert into armazens (user_id, nome) values (p_user, 'Estoque principal') returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function armazem_principal(uuid) from public, anon, authenticated;

-- 3) Gatilho que mantém a soma dos armazéns = produtos.estoque.
create or replace function sincronizar_estoque_armazem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes   integer := case when tg_op = 'INSERT' then 0 else coalesce(old.estoque, 0) end;
  v_delta   integer := coalesce(new.estoque, 0) - v_antes;
  v_alvo    uuid;
  v_restante integer;
  v_linha   record;
  v_tirar   integer;
  v_soma    integer;
begin
  if v_delta = 0 then
    return new;
  end if;

  v_alvo := nullif(current_setting('app.armazem_mov', true), '')::uuid;
  -- Só aceita o armazém informado se for da mesma conta do produto.
  if v_alvo is not null and not exists (select 1 from armazens where id = v_alvo and user_id = new.user_id) then
    v_alvo := null;
  end if;
  if v_alvo is null then
    v_alvo := new.armazem_id;
    if v_alvo is not null and not exists (select 1 from armazens where id = v_alvo and user_id = new.user_id) then
      v_alvo := null;
    end if;
  end if;
  if v_alvo is null then
    v_alvo := armazem_principal(new.user_id);
  end if;

  if v_delta > 0 then
    insert into estoque_armazem (user_id, produto_id, armazem_id, quantidade)
    values (new.user_id, new.id, v_alvo, v_delta)
    on conflict (produto_id, armazem_id) do update
      set quantidade = estoque_armazem.quantidade + excluded.quantidade, atualizado_em = now();
  else
    v_restante := -v_delta;
    -- Primeiro do armazém alvo, depois dos outros, do maior saldo para o menor.
    for v_linha in
      select armazem_id, quantidade from estoque_armazem
       where produto_id = new.id and quantidade > 0
       order by (armazem_id = v_alvo) desc, quantidade desc
       for update
    loop
      exit when v_restante <= 0;
      v_tirar := least(v_linha.quantidade, v_restante);
      update estoque_armazem set quantidade = quantidade - v_tirar, atualizado_em = now()
       where produto_id = new.id and armazem_id = v_linha.armazem_id;
      v_restante := v_restante - v_tirar;
    end loop;
  end if;

  -- Rede de segurança: se a divisão não bate com o total (dado antigo, edição direta),
  -- acerta a diferença no armazém alvo, sem nunca deixar saldo negativo.
  select coalesce(sum(quantidade), 0) into v_soma from estoque_armazem where produto_id = new.id;
  if v_soma <> coalesce(new.estoque, 0) then
    insert into estoque_armazem (user_id, produto_id, armazem_id, quantidade)
    values (new.user_id, new.id, v_alvo, greatest(0, coalesce(new.estoque, 0) - v_soma))
    on conflict (produto_id, armazem_id) do update
      set quantidade = greatest(0, estoque_armazem.quantidade + (coalesce(new.estoque, 0) - v_soma)), atualizado_em = now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sincronizar_estoque_armazem on produtos;
create trigger trg_sincronizar_estoque_armazem
after insert or update of estoque on produtos
for each row execute function sincronizar_estoque_armazem();

-- 4) Carga inicial: o saldo atual de cada produto vai para o armazém dele (ou o principal).
--    Só produtos que ainda não têm nenhuma linha — rodar de novo não duplica.
insert into estoque_armazem (user_id, produto_id, armazem_id, quantidade)
select p.user_id,
       p.id,
       coalesce(
         (select a.id from armazens a where a.id = p.armazem_id and a.user_id = p.user_id),
         armazem_principal(p.user_id)
       ),
       p.estoque
  from produtos p
 where p.estoque > 0
   and not exists (select 1 from estoque_armazem e where e.produto_id = p.id);

-- 5) Armazém não pode ser apagado com estoque dentro; linhas zeradas saem junto.
create or replace function proteger_armazem_com_estoque()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from estoque_armazem where armazem_id = old.id and quantidade > 0) then
    raise exception 'Este armazém ainda tem estoque. Transfira os produtos para outro armazém antes de remover.';
  end if;
  delete from estoque_armazem where armazem_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_proteger_armazem_com_estoque on armazens;
create trigger trg_proteger_armazem_com_estoque
before delete on armazens
for each row execute function proteger_armazem_com_estoque();

-- 6) Movimentações: armazém de origem/destino e o tipo 'transferencia'.
alter table estoque_movimentacoes
  add column if not exists armazem_id uuid references armazens(id) on delete set null,
  add column if not exists armazem_destino_id uuid references armazens(id) on delete set null;

alter table estoque_movimentacoes drop constraint if exists estoque_movimentacoes_tipo_check;
alter table estoque_movimentacoes add constraint estoque_movimentacoes_tipo_check
  check (tipo in ('entrada', 'saida', 'transferencia'));

create index if not exists estoque_movimentacoes_armazem_idx on estoque_movimentacoes (armazem_id);

-- Mesmo freio da 0026: a movimentação só pode apontar para armazém da própria conta.
drop trigger if exists trg_valida_vinculo_mov_armazem on estoque_movimentacoes;
create trigger trg_valida_vinculo_mov_armazem
before insert or update of armazem_id on estoque_movimentacoes
for each row execute function validar_vinculo_do_dono('armazem_id', 'armazens');

drop trigger if exists trg_valida_vinculo_mov_armazem_destino on estoque_movimentacoes;
create trigger trg_valida_vinculo_mov_armazem_destino
before insert or update of armazem_destino_id on estoque_movimentacoes
for each row execute function validar_vinculo_do_dono('armazem_destino_id', 'armazens');

-- Carimba o armazém em toda movimentação que não disser qual foi (as RPCs antigas não dizem).
create or replace function carimbar_armazem_movimentacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.armazem_id is null then
    new.armazem_id := coalesce(
      nullif(current_setting('app.armazem_mov', true), '')::uuid,
      (select p.armazem_id from produtos p where p.id = new.produto_id)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_carimbar_armazem_movimentacao on estoque_movimentacoes;
create trigger trg_carimbar_armazem_movimentacao
before insert on estoque_movimentacoes
for each row execute function carimbar_armazem_movimentacao();

-- 7) RPCs com armazém. Elas marcam o armazém na transação e reaproveitam as funções que já
--    existem (custo médio, histórico de custo), então a regra de custo não se repete aqui.
create or replace function movimentar_estoque_armazem(
  p_produto_id uuid,
  p_armazem_id uuid,
  p_tipo text,
  p_quantidade integer,
  p_custo_unitario numeric default null,
  p_motivo text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_saldo integer;
  v_nome text;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade precisa ser maior que zero.';
  end if;
  if not exists (select 1 from armazens where id = p_armazem_id and user_id = v_user) then
    raise exception 'Armazém não encontrado.';
  end if;

  perform set_config('app.armazem_mov', p_armazem_id::text, true);

  if p_tipo = 'entrada' then
    perform registrar_entrada_com_custo(p_produto_id, p_quantidade, coalesce(p_custo_unitario, 0), p_motivo);
  elsif p_tipo = 'saida' then
    select coalesce(quantidade, 0) into v_saldo from estoque_armazem where produto_id = p_produto_id and armazem_id = p_armazem_id;
    if coalesce(v_saldo, 0) < p_quantidade then
      select nome into v_nome from armazens where id = p_armazem_id;
      raise exception 'Só há % unidade(s) deste produto em %.', coalesce(v_saldo, 0), v_nome;
    end if;
    perform registrar_movimentacao_estoque(p_produto_id, 'saida', p_quantidade, p_motivo);
  else
    raise exception 'Tipo de movimentação inválido: %', p_tipo;
  end if;

  perform set_config('app.armazem_mov', '', true);
end;
$$;

grant execute on function movimentar_estoque_armazem(uuid, uuid, text, integer, numeric, text) to authenticated;

create or replace function transferir_estoque(
  p_produto_id uuid,
  p_origem_id uuid,
  p_destino_id uuid,
  p_quantidade integer,
  p_motivo text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_produto produtos%rowtype;
  v_saldo integer;
  v_origem text;
  v_destino text;
begin
  if v_user is null or not conta_ativa() then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade precisa ser maior que zero.';
  end if;
  if p_origem_id = p_destino_id then
    raise exception 'Escolha armazéns diferentes para transferir.';
  end if;

  select * into v_produto from produtos where id = p_produto_id and user_id = v_user for update;
  if not found then
    raise exception 'Produto não encontrado.';
  end if;
  select nome into v_origem from armazens where id = p_origem_id and user_id = v_user;
  select nome into v_destino from armazens where id = p_destino_id and user_id = v_user;
  if v_origem is null or v_destino is null then
    raise exception 'Armazém não encontrado.';
  end if;

  select quantidade into v_saldo from estoque_armazem where produto_id = p_produto_id and armazem_id = p_origem_id for update;
  if coalesce(v_saldo, 0) < p_quantidade then
    raise exception 'Só há % unidade(s) deste produto em %.', coalesce(v_saldo, 0), v_origem;
  end if;

  update estoque_armazem set quantidade = quantidade - p_quantidade, atualizado_em = now()
   where produto_id = p_produto_id and armazem_id = p_origem_id;
  insert into estoque_armazem (user_id, produto_id, armazem_id, quantidade)
  values (v_user, p_produto_id, p_destino_id, p_quantidade)
  on conflict (produto_id, armazem_id) do update
    set quantidade = estoque_armazem.quantidade + excluded.quantidade, atualizado_em = now();

  insert into estoque_movimentacoes (
    user_id, produto_id, produto_nome, tipo, quantidade, motivo, armazem_id, armazem_destino_id, data_movimentacao
  ) values (
    v_user, p_produto_id, v_produto.nome || coalesce(' — ' || v_produto.variante_nome, ''), 'transferencia', p_quantidade,
    coalesce(nullif(trim(p_motivo), ''), 'Transferência ' || v_origem || ' → ' || v_destino), p_origem_id, p_destino_id, now()
  );
end;
$$;

revoke execute on function transferir_estoque(uuid, uuid, uuid, integer, text) from public, anon;
grant execute on function transferir_estoque(uuid, uuid, uuid, integer, text) to authenticated;

-- 8) Lojas abastecidas ligadas às lojas cadastradas. O texto antigo continua (histórico);
--    os nomes que batem com uma loja cadastrada viram id.
alter table armazens add column if not exists loja_ids uuid[] not null default '{}';

update armazens a
   set loja_ids = coalesce((
     select array_agg(distinct l.id)
       from lojas_canal l
      where l.user_id = a.user_id
        and lower(trim(l.nome)) in (select lower(trim(x)) from unnest(a.lojas_abastecidas) x)
   ), '{}')
 where a.loja_ids = '{}' and cardinality(a.lojas_abastecidas) > 0;

-- 9) Peso e medidas para envio. No grupo de variações é o padrão; o produto pode sobrescrever.
alter table produtos
  add column if not exists peso_g integer check (peso_g is null or peso_g between 1 and 1000000),
  add column if not exists altura_cm numeric check (altura_cm is null or (altura_cm > 0 and altura_cm <= 1000)),
  add column if not exists largura_cm numeric check (largura_cm is null or (largura_cm > 0 and largura_cm <= 1000)),
  add column if not exists comprimento_cm numeric check (comprimento_cm is null or (comprimento_cm > 0 and comprimento_cm <= 1000));

alter table produto_grupos
  add column if not exists peso_g integer check (peso_g is null or peso_g between 1 and 1000000),
  add column if not exists altura_cm numeric check (altura_cm is null or (altura_cm > 0 and altura_cm <= 1000)),
  add column if not exists largura_cm numeric check (largura_cm is null or (largura_cm > 0 and largura_cm <= 1000)),
  add column if not exists comprimento_cm numeric check (comprimento_cm is null or (comprimento_cm > 0 and comprimento_cm <= 1000));

NOTIFY pgrst, 'reload schema';

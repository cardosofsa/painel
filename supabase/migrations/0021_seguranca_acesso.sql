-- ============================================================
-- Endurecimento de acesso: suspensão com efeito no banco e PIN com hash.
--
-- CONTEXTO: o sistema deixou de ser de uso pessoal. Com a 0020 existe conta master,
-- aprovação de cadastro e liberação por aba. Só que essas regras moravam inteiramente
-- no middleware do Next — ou seja, valiam para o NAVEGADOR e para mais nada.
--
-- Três buracos, todos fechados aqui:
--
-- 1) SUSPENDER NÃO SUSPENDIA. Nenhuma policy consultava `perfis_acesso.status`. Uma conta
--    'pendente' (nunca aprovada) ou 'suspenso' continua com um JWT válido do Supabase Auth
--    e, com a chave anônima — que é pública por natureza —, fala direto com o PostgREST:
--      await supabase.from('vendas').select('*')        -> devolvia tudo
--      await supabase.rpc('registrar_venda', {...})     -> gravava
--    O /aguardando só impedia a tela de renderizar.
--
-- 2) O PIN estava em texto puro. Agora é hash bcrypt (`pgcrypto`, já habilitado na 0001).
--
-- 3) `editar_venda` não pedia PIN. A conferência só existia na Server Action, e a RPC era
--    chamável direto do console do navegador — o que anulava o controle inteiro. O próprio
--    projeto já documenta esse raciocínio em `admin/actions.ts`: não dá para confiar numa
--    checagem que só roda no servidor do app.
--
-- ORDEM: aplicar DEPOIS da 0020. O bloco abaixo aborta se ela não tiver rodado.
--
-- ROLLBACK (se algo der errado e for preciso voltar ao comportamento anterior):
--   do $$ declare t text; begin
--     for t in select unnest(array['categorias','fornecedores','contas','armazens','produtos',
--       'precificacoes','pedidos_compra','estoque_movimentacoes','despesas_fixas',
--       'movimentacoes_financeiras','contas_a_pagar_receber','perfil_negocio','canais',
--       'lojas_canal','anuncios','faixas_comissao_canal','concorrentes_preco',
--       'formas_pagamento','compromissos','catalogos','produto_grupos','clientes','vendas'])
--     loop
--       execute format('drop policy if exists "own_rows_%1$s" on %1$I', t);
--       execute format('create policy "own_rows_%1$s" on %1$I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
--     end loop; end $$;
-- ============================================================

do $$
begin
  if to_regclass('public.perfis_acesso') is null then
    raise exception 'Aplique a migração 0020_perfis_acesso_admin.sql antes desta.';
  end if;
end $$;

-- ============================================================
-- 1) conta_ativa(): a trava de suspensão, agora dentro do banco.
--
-- `security definer` pelo mesmo motivo de `e_master()` (0020): consultar `perfis_acesso`
-- de dentro de uma policy que o RLS de `perfis_acesso` também governa causaria recursão.
-- `stable` faz o Postgres avaliar uma vez por statement, não por linha — sem isso, o custo
-- numa tabela grande seria proibitivo.
-- ============================================================

create or replace function conta_ativa()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from perfis_acesso
    where user_id = auth.uid()
      and status = 'ativo'
      and (expira_em is null or expira_em >= current_date)
  );
$$;

grant execute on function conta_ativa() to authenticated;

-- ============================================================
-- 2) Todas as policies de dados passam a exigir conta ativa.
--
-- Só as 23 tabelas com `user_id` próprio. As 6 filhas (pedidos_compra_itens,
-- anuncio_variacoes, produto_lojas, produto_imagens, catalogo_precos, venda_itens) herdam
-- automaticamente: a policy delas faz `exists` no pai, e essa subconsulta também passa
-- pelo RLS do pai — se o pai ficou invisível, a filha fica junto.
--
-- `perfis_acesso` fica de fora de propósito: é o que o middleware lê para descobrir o
-- status. Incluí-la criaria recursão e, num erro, trancaria todo mundo para fora.
-- ============================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'categorias', 'fornecedores', 'contas', 'armazens', 'produtos', 'precificacoes',
      'pedidos_compra', 'estoque_movimentacoes', 'despesas_fixas',
      'movimentacoes_financeiras', 'contas_a_pagar_receber', 'perfil_negocio', 'canais',
      'lojas_canal', 'anuncios', 'faixas_comissao_canal', 'concorrentes_preco',
      'formas_pagamento', 'compromissos', 'catalogos', 'produto_grupos', 'clientes', 'vendas'
    ])
  loop
    -- Pula tabela que não existe neste banco em vez de abortar a migração inteira.
    -- `drop policy IF EXISTS` protege contra a policy faltar, mas NÃO contra a tabela
    -- faltar: nesse caso o erro é "relation does not exist" e tudo é revertido.
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'tabela % não existe neste banco — policy ignorada', t;
      continue;
    end if;

    execute format('drop policy if exists "own_rows_%1$s" on %1$I', t);
    execute format(
      'create policy "own_rows_%1$s" on %1$I for all '
      'using (auth.uid() = user_id and conta_ativa()) '
      'with check (auth.uid() = user_id and conta_ativa())',
      t
    );
  end loop;
end $$;

-- ============================================================
-- 3) PIN de administração com hash.
--
-- A coluna antiga guardava o PIN legível e a página de Configurações ainda o entregava ao
-- navegador. Aqui ele vira hash bcrypt; a aplicação passou a mandar só um booleano
-- "tem PIN?" para a tela.
-- ============================================================

alter table perfil_negocio add column if not exists pin_admin_hash text;

-- A coluna `pin_admin` veio da 0019. O bloco é condicional porque ela pode simplesmente
-- não existir: ou a 0019 nunca foi aplicada neste banco, ou esta migração já rodou antes e
-- a coluna já foi removida. Um `update ... where pin_admin ...` solto aborta com
-- "column pin_admin does not exist" nos dois casos — o Postgres resolve o nome da coluna ao
-- executar o statement, e `drop column IF EXISTS` mais abaixo não ajuda em nada porque o
-- erro acontece antes.
do $$
begin
  if exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'perfil_negocio'
       and column_name = 'pin_admin'
  ) then
    execute $sql$
      update perfil_negocio
         set pin_admin_hash = crypt(pin_admin, gen_salt('bf'))
       where pin_admin is not null and pin_admin <> '' and pin_admin_hash is null
    $sql$;
    execute 'alter table perfil_negocio drop column pin_admin';
  end if;
end $$;

/** Grava (ou apaga, com p_pin nulo/vazio) o PIN do próprio usuário, sempre como hash. */
create or replace function definir_pin_admin(p_pin text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_pin is null or btrim(p_pin) = '' then
    update perfil_negocio set pin_admin_hash = null where user_id = auth.uid();
    return;
  end if;

  if btrim(p_pin) !~ '^\d{4,8}$' then
    raise exception 'O PIN deve ter de 4 a 8 números.';
  end if;

  update perfil_negocio set pin_admin_hash = crypt(btrim(p_pin), gen_salt('bf'))
   where user_id = auth.uid();

  if not found then
    insert into perfil_negocio (user_id, pin_admin_hash)
    values (auth.uid(), crypt(btrim(p_pin), gen_salt('bf')));
  end if;
end;
$$;

grant execute on function definir_pin_admin(text) to authenticated;

-- ============================================================
-- 4) editar_venda passa a exigir o PIN, conferido aqui dentro.
--
-- A assinatura muda (ganha `p_pin`), então o DROP explícito é obrigatório: o Postgres não
-- troca a assinatura de uma função existente com CREATE OR REPLACE, e sem o drop a versão
-- antiga — sem PIN — continuaria publicada e chamável. É a armadilha documentada no
-- CLAUDE.md, a mesma que derrubou a produção na 0016/0017.
-- ============================================================

drop function if exists editar_venda(uuid, uuid, text, text, numeric, numeric);

create or replace function editar_venda(
  p_venda_id uuid,
  p_cliente_id uuid,
  p_forma_pagamento text,
  p_observacao text,
  p_desconto numeric,
  p_valor_entrega numeric,
  p_pin text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user         uuid := auth.uid();
  v_hash         text;
  v_venda        vendas%rowtype;
  v_cliente_nome text;
  v_desconto     numeric := round(coalesce(p_desconto, 0), 2);
  v_entrega      numeric := round(coalesce(p_valor_entrega, 0), 2);
  v_total_novo   numeric;
  v_lucro_novo   numeric;
  v_delta        numeric;
  v_mov          record;
  v_cpr          record;
begin
  -- O PIN é conferido ANTES de qualquer leitura ou escrita.
  select pin_admin_hash into v_hash from perfil_negocio where user_id = v_user;
  if v_hash is null then
    raise exception 'Cadastre um PIN de administração em Configurações → Conta antes de editar uma venda.';
  end if;
  if p_pin is null or crypt(btrim(p_pin), v_hash) <> v_hash then
    raise exception 'PIN incorreto.';
  end if;

  select * into v_venda from vendas where id = p_venda_id and user_id = v_user for update;
  if not found then
    raise exception 'Venda não encontrada ou não pertence a você.';
  end if;
  if v_venda.status = 'cancelada' then
    raise exception 'A venda % está cancelada e não pode ser editada.', v_venda.numero;
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
  v_lucro_novo := round(v_venda.subtotal - v_desconto - v_venda.custo_total, 2);
  v_delta := v_total_novo - v_venda.total;

  if v_venda.status = 'paga' then
    select id, conta_id into v_mov
      from movimentacoes_financeiras
     where referencia_venda_id = p_venda_id and user_id = v_user
     limit 1;

    if not found then
      raise exception
        'A entrada no caixa da venda % não foi encontrada. Ajuste manualmente no Financeiro em vez de editar aqui.',
        v_venda.numero;
    end if;

    if v_delta <> 0 then
      update movimentacoes_financeiras set valor = valor + v_delta where id = v_mov.id;
      if v_mov.conta_id is not null then
        update contas set saldo = saldo + v_delta where id = v_mov.conta_id and user_id = v_user;
      end if;
    end if;
  else -- fiado
    select id, status, conta_id into v_cpr
      from contas_a_pagar_receber
     where referencia_venda_id = p_venda_id and user_id = v_user
     limit 1;

    if not found then
      raise exception 'A conta a receber da venda % não foi encontrada.', v_venda.numero;
    end if;

    if v_cpr.status = 'pendente' then
      update contas_a_pagar_receber set valor = v_total_novo where id = v_cpr.id;
    elsif v_delta <> 0 then
      -- Já foi recebido: o dinheiro está no caixa. Ajusta o valor lá também.
      select id into v_mov from movimentacoes_financeiras
       where referencia_venda_id = p_venda_id and user_id = v_user
       limit 1;

      if not found then
        raise exception
          'O fiado da venda % já foi recebido, mas a entrada no caixa não foi localizada. Ajuste manualmente no Financeiro.',
          v_venda.numero;
      end if;

      update movimentacoes_financeiras set valor = valor + v_delta where id = v_mov.id;
      if v_cpr.conta_id is not null then
        update contas set saldo = saldo + v_delta where id = v_cpr.conta_id and user_id = v_user;
      end if;
      update contas_a_pagar_receber set valor = v_total_novo where id = v_cpr.id;
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
         lucro = v_lucro_novo
   where id = p_venda_id and user_id = v_user;
end;
$$;

grant execute on function editar_venda(uuid, uuid, text, text, numeric, numeric, text) to authenticated;

-- ============================================================
-- 5) `conta_id` sempre tem que apontar para uma conta do próprio dono da linha.
--
-- `registrar_venda` validava isso no caminho 'paga' mas NÃO no 'fiado' (0018): dava para
-- gravar uma conta a receber apontando para a conta bancária de outro inquilino. Não
-- vazava leitura — o RLS barra —, mas gerava linha órfã, e depois
-- `quitar_conta_pagar_receber` filtrava por `user_id` e simplesmente não ajustava saldo
-- nenhum: o dinheiro sumia do fluxo.
--
-- Um trigger cobre as quatro tabelas de uma vez e vale para QUALQUER caminho de escrita —
-- a RPC, as Server Actions e o PostgREST direto —, em vez de corrigir só um `if` dentro de
-- uma função de 200 linhas.
-- ============================================================

create or replace function validar_conta_do_dono()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.conta_id is not null
     and not exists (select 1 from contas c where c.id = new.conta_id and c.user_id = new.user_id) then
    raise exception 'Conta financeira não encontrada ou não pertence a você.';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  for t in select unnest(array['vendas', 'contas_a_pagar_receber', 'movimentacoes_financeiras', 'despesas_fixas'])
  loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'tabela % não existe neste banco — trigger ignorado', t;
      continue;
    end if;

    execute format('drop trigger if exists trg_valida_conta_%1$s on %1$I', t);
    execute format(
      'create trigger trg_valida_conta_%1$s before insert or update of conta_id on %1$I '
      'for each row execute function validar_conta_do_dono()',
      t
    );
  end loop;
end $$;

-- ============================================================
-- 6) limpar_financeiro: apagar lançamento estornando o saldo.
--
-- A Server Action fazia DELETE direto em `movimentacoes_financeiras`. Todo o resto do
-- sistema move dinheiro em par (lançamento + ajuste de `contas.saldo`); aquele DELETE
-- quebrava o par e deixava saldo fantasma na conta. Pior: apagava também as
-- `contas_a_pagar_receber` ligadas a vendas, e aí `cancelar_venda` passava a falhar para
-- sempre com "a entrada no caixa da venda X não foi encontrada".
--
-- Aqui tudo acontece numa transação só: estorna o saldo de cada lançamento antes de
-- apagá-lo, e recusa apagar título que esteja amarrado a uma venda.
-- ============================================================

create or replace function limpar_financeiro(
  p_inicio date,
  p_fim date,
  p_movimentacoes boolean default true,
  p_titulos boolean default false
)
returns table (movimentacoes_apagadas integer, titulos_apagados integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_mov  integer := 0;
  v_tit  integer := 0;
begin
  if p_inicio is null or p_fim is null then
    raise exception 'Informe o período que deve ser limpo.';
  end if;
  if p_fim < p_inicio then
    raise exception 'A data final é anterior à inicial.';
  end if;

  if p_movimentacoes then
    -- Estorna antes de apagar: sem isso o saldo da conta fica com dinheiro que não tem
    -- mais lançamento nenhum por trás.
    update contas c
       set saldo = c.saldo - x.total
      from (
        select m.conta_id, sum(m.valor) as total
          from movimentacoes_financeiras m
         where m.user_id = v_user
           and m.data_movimentacao between p_inicio and p_fim
           and m.conta_id is not null
         group by m.conta_id
      ) x
     where c.id = x.conta_id and c.user_id = v_user;

    delete from movimentacoes_financeiras
     where user_id = v_user and data_movimentacao between p_inicio and p_fim;
    get diagnostics v_mov = row_count;
  end if;

  if p_titulos then
    if exists (
      select 1 from contas_a_pagar_receber
       where user_id = v_user
         and data_vencimento between p_inicio and p_fim
         and referencia_venda_id is not null
    ) then
      raise exception
        'Há contas a receber ligadas a vendas nesse período. Cancele a venda correspondente em vez de apagar o título.';
    end if;

    delete from contas_a_pagar_receber
     where user_id = v_user and data_vencimento between p_inicio and p_fim;
    get diagnostics v_tit = row_count;
  end if;

  return query select v_mov, v_tit;
end;
$$;

grant execute on function limpar_financeiro(date, date, boolean, boolean) to authenticated;

-- ============================================================
-- 7) gerar_numero_pedido: max()+1 em vez de count().
--
-- Com `count(*)`, apagar um pedido faz o próximo reaproveitar um número já usado e colidir
-- com `unique (user_id, numero)`. `gerar_numero_venda` (0018) já nasceu corrigida; esta
-- ficou para trás.
--
-- O prefixo "MV-" e o lpad de 2 são mantidos de propósito: já existem pedidos numerados
-- assim em produção, e mudar a largura agora bagunçaria a ordenação da lista entre os
-- números velhos e os novos. A segunda chave do advisory lock evita serializar contra a
-- criação de vendas do mesmo usuário.
-- ============================================================

create or replace function gerar_numero_pedido()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_proximo integer;
begin
  if new.numero is not null and new.numero <> '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text), hashtext('pedidos_compra'));

  select coalesce(max(substring(numero from '\d+')::integer), -1) + 1
    into v_proximo
    from pedidos_compra
   where user_id = new.user_id and numero ~ '^MV-\d+$';

  new.numero := 'MV-' || lpad(v_proximo::text, 2, '0');
  return new;
end;
$$;

-- ============================================================
-- CONFERÊNCIA — as duas consultas abaixo devem voltar VAZIAS.
--
-- (a) Nenhum usuário pode ficar sem linha em perfis_acesso, senão ele perde acesso aos
--     próprios dados por causa do conta_ativa():
--
--   select u.id, u.email from auth.users u
--    where not exists (select 1 from perfis_acesso p where p.user_id = u.id);
--
-- (b) Nenhuma tabela de dados pode ter ficado sem RLS:
--
--   select c.relname from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- ============================================================

NOTIFY pgrst, 'reload schema';

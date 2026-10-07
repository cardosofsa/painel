-- ============================================================
-- 0077 — Segurança no banco e nas rotas públicas.
--
-- 1) Cota da cotação de frete da vitrine (`/api/vitrine/frete`): cada cotação gasta o token
--    do Melhor Envio do DONO do catálogo e não tinha freio nenhum. `vitrine_frete_permitido`
--    conta por (catálogo, hash do IP) — 20 em 10 minutos — e por catálogo — 400 por dia — e
--    recusa catálogo inativo ou de conta suspensa. Só o servidor (service role) chama.
-- 2) `registrar_erro_app` (0076) estava aberta ao anon sem limite por origem: um script no
--    console enchia a tabela e apagava os erros do servidor (a retenção era uma só). Agora:
--    hash do IP com 10/min por origem, freio de 60/min SEPARADO por `onde`, retenção separada
--    (4.000 do servidor, 1.000 do navegador) e EXECUTE só para a service role.
-- 3) `vendas_offline`: SELECT e INSERT com `conta_ativa()`, como as outras tabelas.
-- 4) Storage: os buckets públicos `produtos` e `canais-logos` tinham SELECT para qualquer um
--    em `storage.objects`, o que permite LISTAR os arquivos de todas as contas. A imagem
--    pública não precisa disso (a URL /object/public/ não passa pelo RLS); o upload com
--    `upsert` e o `remove` precisam de SELECT, então fica um SELECT só da própria pasta.
--    `notas-fiscais` e `backups` ganham `conta_ativa()` na leitura.
-- 5) EXECUTE fora de PUBLIC e anon nas funções de usuário logado (admin_*, editar_venda e as
--    RPCs do painel que nasceram sem `revoke`), com grant explícito a authenticated. As da
--    vitrine e da landing (obter_catalogo_publico, criar_pedido_vitrine, planos_publicos...)
--    e as usadas dentro de policy (conta_ativa, e_master, conta_ativa_de) ficam como estão.
-- 6) Índice pedidos_marketplace (user_id, pago_em): o resumo por data de pagamento.
-- 7) PIN de administrador: errar custa 0,8 s, as conferências da mesma conta entram em fila
--    e 5 erros seguidos bloqueiam por 15 minutos (zera no acerto). A contagem fica numa
--    tabela própria SEM escrita pela API — em `perfil_negocio` o próprio dono (ou quem usa o
--    login compartilhado) zeraria o contador pelo console.
--
-- No arquivo, o 7 vem antes do 5: o revoke do 5 precisa das funções novas já criadas.
--
-- Idempotente: if not exists, create or replace, drop ... if exists. Termina com NOTIFY.
-- ============================================================

-- ---------- 1) Cota do frete da vitrine ----------
-- Contador de abuso no padrão de `pedidos_vitrine_cota` (0027): sem policy e sem grant, só a
-- RPC security definer escreve. `ip_hash = '*'` é a linha do total do dia do catálogo.
create table if not exists vitrine_frete_cota (
  catalogo_id   uuid not null references catalogos(id) on delete cascade,
  ip_hash       text not null check (length(ip_hash) between 1 and 128),
  janela_inicio timestamptz not null default now(),
  contagem      integer not null default 0,
  primary key (catalogo_id, ip_hash)
);

alter table vitrine_frete_cota enable row level security;
revoke all on vitrine_frete_cota from anon, authenticated;

create or replace function vitrine_frete_permitido(p_slug text, p_ip_hash text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  MAX_IP     constant integer  := 20;
  JANELA     constant interval := interval '10 minutes';
  MAX_DIA    constant integer  := 400;
  v_id       uuid;
  v_dono     uuid;
  v_ativo    boolean;
  v_ip       text := left(coalesce(nullif(btrim(p_ip_hash), ''), 'sem-ip'), 128);
  v_hoje     timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_n        integer;
begin
  select c.id, c.user_id, c.ativo into v_id, v_dono, v_ativo from catalogos c where c.slug = p_slug;
  if v_id is null or not v_ativo or not conta_ativa_de(v_dono) then
    return false;
  end if;
  if v_ip = '*' then
    v_ip := 'sem-ip';
  end if;

  -- Por origem: janela fixa de 10 minutos.
  insert into vitrine_frete_cota as q (catalogo_id, ip_hash, janela_inicio, contagem)
  values (v_id, v_ip, now(), 1)
  on conflict (catalogo_id, ip_hash) do update
    set janela_inicio = case when q.janela_inicio < now() - JANELA then now() else q.janela_inicio end,
        contagem      = case when q.janela_inicio < now() - JANELA then 1 else q.contagem + 1 end
  returning q.contagem into v_n;
  if v_n > MAX_IP then
    return false;
  end if;

  -- Por catálogo: total do dia (horário de Brasília). Só conta o que passou do freio acima.
  insert into vitrine_frete_cota as q (catalogo_id, ip_hash, janela_inicio, contagem)
  values (v_id, '*', v_hoje, 1)
  on conflict (catalogo_id, ip_hash) do update
    set janela_inicio = case when q.janela_inicio < v_hoje then v_hoje else q.janela_inicio end,
        contagem      = case when q.janela_inicio < v_hoje then 1 else q.contagem + 1 end
  returning q.contagem into v_n;

  -- Faxina das origens com a janela vencida deste catálogo (a tabela não cresce sem fim).
  delete from vitrine_frete_cota
   where catalogo_id = v_id and ip_hash <> '*' and janela_inicio < now() - JANELA;

  return v_n <= MAX_DIA;
end;
$$;

revoke execute on function vitrine_frete_permitido(text, text) from public, anon, authenticated;
grant execute on function vitrine_frete_permitido(text, text) to service_role;

-- ---------- 2) Erros do app: freio por origem e retenção por onde ----------
alter table erros_app add column if not exists ip_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'erros_app_ip_hash_tamanho') then
    alter table erros_app add constraint erros_app_ip_hash_tamanho check (ip_hash is null or length(ip_hash) <= 128);
  end if;
end $$;

create index if not exists erros_app_ip_idx on erros_app (ip_hash, criado_em desc) where ip_hash is not null;
create index if not exists erros_app_onde_idx on erros_app (onde, id desc);

-- A assinatura muda (ganha p_ip_hash): DROP explícito, senão a versão de 4 parâmetros, aberta
-- ao anon, continuaria publicada ao lado da nova.
drop function if exists registrar_erro_app(text, text, text, text);

create or replace function registrar_erro_app(
  p_onde     text,
  p_mensagem text,
  p_rota     text default null,
  p_digest   text default null,
  p_ip_hash  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip  text := left(nullif(btrim(coalesce(p_ip_hash, '')), ''), 128);
  v_max integer;
begin
  if p_onde not in ('servidor', 'navegador') or coalesce(btrim(p_mensagem), '') = '' then
    return;
  end if;
  -- Freio contra enxurrada, separado por onde: um loop no navegador não cala o servidor.
  if (select count(*) from erros_app where onde = p_onde and criado_em > now() - interval '1 minute') >= 60 then
    return;
  end if;
  -- Por origem: 10 por minuto.
  if v_ip is not null and (select count(*) from erros_app where ip_hash = v_ip and criado_em > now() - interval '1 minute') >= 10 then
    return;
  end if;
  insert into erros_app (onde, mensagem, rota, digest, user_id, ip_hash)
  values (p_onde, left(btrim(p_mensagem), 500), left(nullif(btrim(coalesce(p_rota, '')), ''), 300), left(nullif(btrim(coalesce(p_digest, '')), ''), 100), auth.uid(), v_ip);
  -- Retenção separada: 4.000 do servidor, 1.000 do navegador.
  v_max := case p_onde when 'servidor' then 4000 else 1000 end;
  delete from erros_app
   where onde = p_onde
     and id < (select min(id) from (select id from erros_app where onde = p_onde order by id desc limit v_max) t);
end;
$$;

revoke execute on function registrar_erro_app(text, text, text, text, text) from public, anon, authenticated;
grant execute on function registrar_erro_app(text, text, text, text, text) to service_role;

-- ---------- 3) vendas_offline com conta ativa ----------
drop policy if exists "dono_vendas_offline" on vendas_offline;
create policy "dono_vendas_offline" on vendas_offline for select
  using (auth.uid() = user_id and conta_ativa());

drop policy if exists "dono_vendas_offline_insert" on vendas_offline;
create policy "dono_vendas_offline_insert" on vendas_offline for insert
  with check (auth.uid() = user_id and conta_ativa());

-- ---------- 4) Storage ----------
-- Nomes exatos da 0002 (produtos) e da 0004 (canais-logos).
drop policy if exists "produtos_bucket_select_public" on storage.objects;
drop policy if exists "canais_logos_select_public" on storage.objects;

drop policy if exists "produtos_select_own" on storage.objects;
create policy "produtos_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'produtos' and (storage.foldername(name))[1] = auth.uid()::text and conta_ativa());

drop policy if exists "canais_logos_select_own" on storage.objects;
create policy "canais_logos_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'canais-logos' and (storage.foldername(name))[1] = auth.uid()::text and conta_ativa());

drop policy if exists "notas_fiscais_select_own" on storage.objects;
create policy "notas_fiscais_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'notas-fiscais' and (storage.foldername(name))[1] = auth.uid()::text and conta_ativa());

drop policy if exists "backups_select_own" on storage.objects;
create policy "backups_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'backups' and (storage.foldername(name))[1] = auth.uid()::text and conta_ativa());

-- ---------- 7) PIN de administrador: atraso e bloqueio ----------
create table if not exists pin_admin_tentativas (
  user_id         uuid primary key references auth.users on delete cascade default auth.uid(),
  falhas          integer not null default 0,
  bloqueado_ate   timestamptz,
  ultima_falha_em timestamptz
);

alter table pin_admin_tentativas enable row level security;
-- Só leitura da própria linha; escrita só pelas funções security definer abaixo.
drop policy if exists "dono_pin_admin_tentativas" on pin_admin_tentativas;
create policy "dono_pin_admin_tentativas" on pin_admin_tentativas for select to authenticated
  using (auth.uid() = user_id and conta_ativa());
revoke all on pin_admin_tentativas from anon, authenticated;
grant select on pin_admin_tentativas to authenticated;

-- Confere o PIN de administrador da conta logada e cuida da contagem. Devolve:
--   'livre'     sem PIN cadastrado;
--   'ok'        PIN certo (zera a contagem);
--   'incorreto' PIN errado (custou 0,8 s e contou);
--   'bloqueou'  PIN errado que completou 5 seguidos: bloqueado por 15 minutos a partir de agora;
--   'bloqueado' já estava bloqueado: nem confere.
-- Quem chama NÃO pode levantar exceção nos casos 'incorreto'/'bloqueou' se quiser a contagem
-- gravada — o erro desfaz a transação inteira, contador junto (ver editar_venda abaixo).
create or replace function pin_admin_checar(p_pin text)
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  MAX_FALHAS constant integer  := 5;
  BLOQUEIO   constant interval := interval '15 minutes';
  v_user     uuid := auth.uid();
  v_hash     text;
  v_t        pin_admin_tentativas%rowtype;
begin
  if v_user is null then
    return 'incorreto';
  end if;
  select pn.pin_admin_hash into v_hash from perfil_negocio pn where pn.user_id = v_user;
  if v_hash is null then
    return 'livre';
  end if;

  -- Uma conferência por vez por conta: tentativas em paralelo esperam a anterior (e o atraso dela).
  perform pg_advisory_xact_lock(hashtext('pin_admin:' || v_user::text));

  select * into v_t from pin_admin_tentativas t where t.user_id = v_user;
  if v_t.bloqueado_ate is not null and v_t.bloqueado_ate > now() then
    return 'bloqueado';
  end if;

  if v_hash = crypt(coalesce(btrim(p_pin), ''), v_hash) then
    if v_t.user_id is not null and (v_t.falhas <> 0 or v_t.bloqueado_ate is not null) then
      update pin_admin_tentativas set falhas = 0, bloqueado_ate = null where user_id = v_user;
    end if;
    return 'ok';
  end if;

  perform pg_sleep(0.8);
  -- Bloqueio vencido ou última falha de mais de um dia: a contagem recomeça.
  insert into pin_admin_tentativas as t (user_id, falhas, ultima_falha_em)
  values (v_user, 1, now())
  on conflict (user_id) do update
    set falhas = case
                   when t.bloqueado_ate is not null or t.ultima_falha_em < now() - interval '1 day' then 1
                   else t.falhas + 1
                 end,
        bloqueado_ate = null,
        ultima_falha_em = now()
  returning * into v_t;

  if v_t.falhas >= MAX_FALHAS then
    update pin_admin_tentativas set falhas = 0, bloqueado_ate = now() + BLOQUEIO where user_id = v_user;
    return 'bloqueou';
  end if;
  return 'incorreto';
end;
$$;

revoke execute on function pin_admin_checar(text) from public, anon;
grant execute on function pin_admin_checar(text) to authenticated;

-- Mesma assinatura e retorno da 0063 (sem PIN cadastrado = livre), agora volátil: grava a
-- contagem. Bloqueado vira exceção com a mensagem (não há contagem a perder nesse caso).
create or replace function pin_admin_confere(p_pin text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_estado text := pin_admin_checar(p_pin);
begin
  if v_estado = 'bloqueado' then
    raise exception 'Muitas tentativas erradas: o PIN de administrador está bloqueado por até 15 minutos.';
  end if;
  return v_estado in ('livre', 'ok');
end;
$$;

revoke execute on function pin_admin_confere(text) from public, anon;
grant execute on function pin_admin_confere(text) to authenticated;

-- editar_venda: o retorno muda de void para jsonb, então DROP explícito antes (regra do
-- CLAUDE.md). PIN errado NÃO levanta exceção: devolve o erro no corpo com status 400
-- (`response.status` do PostgREST) — o supabase-js entrega isso como `error`, igual a um
-- raise, e a transação é confirmada com a tentativa contada. Com raise, a contagem voltaria
-- junto com o resto e o bloqueio nunca chegaria. O resto é a 0021 sem mudança.
drop function if exists editar_venda(uuid, uuid, text, text, numeric, numeric, text);

create or replace function editar_venda(
  p_venda_id uuid,
  p_cliente_id uuid,
  p_forma_pagamento text,
  p_observacao text,
  p_desconto numeric,
  p_valor_entrega numeric,
  p_pin text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_user         uuid := auth.uid();
  v_hash         text;
  v_pin          text;
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
  v_pin := pin_admin_checar(p_pin);
  if v_pin = 'bloqueado' then
    raise exception 'Muitas tentativas erradas: o PIN de administrador está bloqueado por até 15 minutos.';
  end if;
  if v_pin in ('incorreto', 'bloqueou') then
    perform set_config('response.status', '400', true);
    return jsonb_build_object(
      'code', 'P0001',
      'message', case when v_pin = 'bloqueou'
                      then 'PIN incorreto. Foram 5 tentativas erradas seguidas: o PIN de administrador ficou bloqueado por 15 minutos.'
                      else 'PIN incorreto.' end,
      'details', null,
      'hint', null
    );
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

  return null;
end;
$$;

-- crypt() mora no schema extensions no Supabase; a 0021 deixou só `public` no search_path.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'definir_pin_admin') then
    alter function definir_pin_admin(text) set search_path = public, extensions;
  end if;
end $$;

-- ---------- 5) EXECUTE só para quem está logado ----------
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and (p.proname like 'admin\_%'
            or p.proname = any (array[
              -- PIN e venda
              'editar_venda', 'definir_pin_admin', 'pin_admin_confere', 'pin_admin_checar',
              'registrar_venda', 'registrar_venda_offline', 'cancelar_venda', 'avancar_etapa_vendas',
              -- financeiro
              'desfazer_movimentacao_financeira', 'registrar_movimentacao_financeira', 'quitar_conta_pagar_receber',
              'limpar_financeiro', 'resumo_financeiro', 'marcar_parcela_paga', 'parcelas_da_venda', 'fiado_em_uso_cliente',
              -- estoque e compras
              'registrar_movimentacao_estoque', 'registrar_entrada_com_custo', 'movimentar_estoque_armazem',
              'marcar_pedido_recebido', 'receber_pedido_compra',
              -- relatórios e cadastros
              'contagem_produtos_por_categoria', 'custos_recentes_por_produto', 'precos_canal_por_produto',
              'resumo_vendas_por_cliente', 'mesclar_clientes',
              -- sessão e IA (security definer que já conferem auth.uid() por dentro)
              'tocar_ultimo_acesso', 'ia_buscar_sugestao', 'ia_consumir', 'ia_guardar_sugestao',
              'ia_definir_padrao', 'ia_estado_teste'
            ]))
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------- 6) Índice ----------
create index if not exists pedidos_marketplace_user_pago_idx on pedidos_marketplace (user_id, pago_em);

NOTIFY pgrst, 'reload schema';

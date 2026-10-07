-- ============================================================
-- 0078 — Programa de indicação ("Indique e ganhe 1 mês") + origem do cadastro.
--
-- codigos_indicacao — um código por conta: 7 caracteres sem os ambíguos (0/O, 1/I/L).
--                     Gerado no cadastro (gatilho em auth.users) e preenchido aqui para as
--                     contas que já existem. Tabela própria (e não coluna em perfil_negocio)
--                     porque nem toda conta tem linha em perfil_negocio no momento do cadastro.
-- indicacoes        — quem indicou quem (indicado_id único: cada conta é indicada uma vez só).
--                     O indicador LÊ as próprias; ninguém escreve pela API (sem policy de
--                     escrita) — só os gatilhos/RPCs security definer abaixo.
--
-- Cadastro: o /signup manda `ref` (e utm_source/utm_medium/utm_campaign) em
-- `options.data`, que o Supabase grava em auth.users.raw_user_meta_data. O gatilho AFTER
-- INSERT lê `ref`, acha o indicador pelo código (nunca a própria conta) e grava a
-- indicação. Qualquer falha ali é engolida (vira WARNING): o cadastro nunca quebra por causa
-- da indicação.
--
-- Recompensa (+30 dias para as DUAS contas), uma vez só por indicação:
--   * dispara quando a assinatura do indicado fica 'ativa' num plano PAGO (preco_mensal > 0)
--     — seja pelo webhook do provedor de cobrança, seja pelo master;
--   * `recompensado_em` é marcado ANTES de aplicar o bônus (e só se ainda estava nulo), então
--     reativações, renovações e upserts repetidos do webhook não pagam de novo;
--   * regra do bônus (`aplicar_bonus_indicacao`), a mais simples que o modelo da 0057 permite:
--       - em teste vigente: teste_ate + 30 dias;
--       - ativa num plano pago e dentro do período: periodo_fim + 30 dias (periodo_fim nulo
--         = sem prazo, não há o que estender);
--       - qualquer outro caso (Grátis, período vencido, atrasada, cancelada): 30 dias de Pro
--         a partir de agora (plano 'pro', status 'ativa', periodo_fim = agora + 30 dias);
--       - conta SEM linha em assinaturas (anterior aos planos, master): já vale Pro sem
--         prazo — nada a fazer (criar a linha a rebaixaria depois de 30 dias).
--   * bônus não é pagamento: a ativação causada pelo próprio bônus (indicador no Grátis que
--     vira Pro por 30 dias) NÃO dispara a recompensa de quem indicou o indicador. A trava é
--     um set_config local da transação (`sertao.bonus_indicacao`).
--   * limitação conhecida: o webhook do provedor grava `periodo_fim` com a data que o
--     provedor informa. Na renovação seguinte de quem paga pelo provedor, os 30 dias
--     somados aqui podem ser sobrescritos pela data do provedor (para o indicado pagante).
--
-- Admin: `admin_origem_conta(uuid)` devolve de onde a conta veio (utm_* e quem indicou),
-- só para o master.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- ---------- Tabelas ----------
create table if not exists codigos_indicacao (
  user_id   uuid primary key references auth.users on delete cascade default auth.uid(),
  codigo    text not null unique check (codigo ~ '^[A-HJKMNP-Z2-9]{7}$'),
  criado_em timestamptz not null default now()
);

alter table codigos_indicacao enable row level security;
drop policy if exists "le_codigo_indicacao" on codigos_indicacao;
create policy "le_codigo_indicacao" on codigos_indicacao for select
  using (auth.uid() = user_id and conta_ativa());

create table if not exists indicacoes (
  id              uuid primary key default gen_random_uuid(),
  indicador_id    uuid not null references auth.users on delete cascade,
  indicado_id     uuid not null unique references auth.users on delete cascade,
  criado_em       timestamptz not null default now(),
  recompensado_em timestamptz,
  check (indicador_id <> indicado_id)
);

create index if not exists idx_indicacoes_indicador on indicacoes (indicador_id);

alter table indicacoes enable row level security;
drop policy if exists "le_indicacoes" on indicacoes;
create policy "le_indicacoes" on indicacoes for select
  using (auth.uid() = indicador_id and conta_ativa());

-- ---------- Código ----------
-- Não é segredo (vai no link público), então random() basta — e não depende de pgcrypto,
-- que no Supabase mora no schema `extensions`, fora do search_path destas funções.
create or replace function gerar_codigo_indicacao()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_codigo   text;
begin
  loop
    v_codigo := '';
    for i in 1..7 loop
      v_codigo := v_codigo || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from codigos_indicacao where codigo = v_codigo);
  end loop;
  return v_codigo;
end;
$$;

-- Devolve o código da conta, criando se faltar (corrida com outro insert: tenta de novo).
create or replace function garantir_codigo_indicacao(p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_codigo text;
begin
  for tentativa in 1..5 loop
    select codigo into v_codigo from codigos_indicacao where user_id = p_user;
    if v_codigo is not null then
      return v_codigo;
    end if;
    begin
      insert into codigos_indicacao (user_id, codigo) values (p_user, gerar_codigo_indicacao())
      on conflict (user_id) do nothing;
    exception when unique_violation then
      null; -- mesmo código sorteado por outra conta ao mesmo tempo: sorteia de novo
    end;
  end loop;
  select codigo into v_codigo from codigos_indicacao where user_id = p_user;
  return v_codigo;
end;
$$;

revoke execute on function gerar_codigo_indicacao() from public, anon, authenticated;
revoke execute on function garantir_codigo_indicacao(uuid) from public, anon, authenticated;

-- Contas que já existem ganham o código agora.
do $$
declare
  r record;
begin
  for r in select u.id from auth.users u where not exists (select 1 from codigos_indicacao c where c.user_id = u.id) loop
    perform garantir_codigo_indicacao(r.id);
  end loop;
end;
$$;

-- ---------- Cadastro: código próprio + indicação pelo `ref` ----------
create or replace function registrar_indicacao_cadastro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref       text;
  v_indicador uuid;
begin
  begin
    perform garantir_codigo_indicacao(new.id);
    v_ref := upper(btrim(coalesce(new.raw_user_meta_data ->> 'ref', '')));
    if v_ref ~ '^[A-HJKMNP-Z2-9]{7}$' then
      select user_id into v_indicador from codigos_indicacao where codigo = v_ref;
      if v_indicador is not null and v_indicador <> new.id then
        insert into indicacoes (indicador_id, indicado_id) values (v_indicador, new.id)
        on conflict (indicado_id) do nothing;
      end if;
    end if;
  exception when others then
    -- O cadastro vale mais que a indicação: registra no log do Postgres e segue.
    raise warning 'indicacao: falha ao registrar no cadastro (%): %', sqlstate, sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function registrar_indicacao_cadastro() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_indicacao on auth.users;
create trigger on_auth_user_created_indicacao
after insert on auth.users
for each row execute function registrar_indicacao_cadastro();

-- ---------- Recompensa ----------
create or replace function aplicar_bonus_indicacao(p_user uuid, p_dias integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_a    assinaturas;
  v_pago boolean;
  v_int  interval := make_interval(days => p_dias);
begin
  select * into v_a from assinaturas where user_id = p_user for update;
  if not found then
    return; -- sem linha = Pro sem prazo (ver cabeçalho)
  end if;
  select coalesce(pl.preco_mensal > 0, false) into v_pago from planos pl where pl.id = v_a.plano_id;

  if v_a.status = 'teste' and v_a.teste_ate is not null and v_a.teste_ate > now() then
    update assinaturas set teste_ate = teste_ate + v_int, atualizado_em = now() where user_id = p_user;
  elsif v_a.status = 'ativa' and coalesce(v_pago, false) and (v_a.periodo_fim is null or v_a.periodo_fim > now()) then
    if v_a.periodo_fim is not null then
      update assinaturas set periodo_fim = periodo_fim + v_int, atualizado_em = now() where user_id = p_user;
    end if;
  else
    update assinaturas
       set plano_id = 'pro', status = 'ativa', periodo_fim = now() + v_int,
           observacao = left('Bônus de indicação: ' || p_dias || ' dias de Pro', 300), atualizado_em = now()
     where user_id = p_user;
  end if;
end;
$$;

revoke execute on function aplicar_bonus_indicacao(uuid, integer) from public, anon, authenticated;

create or replace function recompensar_indicacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_indicador uuid;
begin
  -- Mudança feita pelo próprio bônus não é pagamento.
  if coalesce(current_setting('sertao.bonus_indicacao', true), '') = '1' then
    return new;
  end if;
  if new.status <> 'ativa' or not exists (select 1 from planos where id = new.plano_id and preco_mensal > 0) then
    return new;
  end if;
  -- Marca primeiro, e só se ainda não tinha sido pago: é isso que garante "uma vez só".
  update indicacoes set recompensado_em = now()
   where indicado_id = new.user_id and recompensado_em is null
  returning indicador_id into v_indicador;
  if v_indicador is null then
    return new;
  end if;
  perform set_config('sertao.bonus_indicacao', '1', true);
  perform aplicar_bonus_indicacao(new.user_id, 30);
  perform aplicar_bonus_indicacao(v_indicador, 30);
  perform set_config('sertao.bonus_indicacao', '', true);
  return new;
end;
$$;

revoke execute on function recompensar_indicacao() from public, anon, authenticated;

drop trigger if exists assinaturas_recompensa_indicacao on assinaturas;
create trigger assinaturas_recompensa_indicacao
  after insert or update of status, plano_id on assinaturas
  for each row
  when (new.status = 'ativa')
  execute function recompensar_indicacao();

-- ---------- RPC da tela: código, link e contagem (sem dado de terceiros) ----------
create or replace function minhas_indicacoes()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_codigo text;
begin
  if v_user is null or not conta_ativa() then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  v_codigo := garantir_codigo_indicacao(v_user);
  return jsonb_build_object(
    'codigo', v_codigo,
    'link', '/signup?ref=' || v_codigo,
    'dias_bonus', 30,
    'cadastros', (select count(*) from indicacoes where indicador_id = v_user),
    'recompensadas', (select count(*) from indicacoes where indicador_id = v_user and recompensado_em is not null)
  );
end;
$$;

revoke execute on function minhas_indicacoes() from public, anon;
grant execute on function minhas_indicacoes() to authenticated;

-- ---------- Admin: de onde a conta veio ----------
create or replace function admin_origem_conta(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_meta jsonb;
  v_ind  record;
begin
  if not e_master() then
    raise exception 'Só o administrador pode ver a origem das contas.';
  end if;
  select coalesce(u.raw_user_meta_data, '{}'::jsonb) into v_meta from auth.users u where u.id = p_user;
  select pa.email, i.recompensado_em into v_ind
    from indicacoes i left join perfis_acesso pa on pa.user_id = i.indicador_id
   where i.indicado_id = p_user;
  return jsonb_build_object(
    'utm_source', left(v_meta ->> 'utm_source', 100),
    'utm_medium', left(v_meta ->> 'utm_medium', 100),
    'utm_campaign', left(v_meta ->> 'utm_campaign', 100),
    'ref', left(v_meta ->> 'ref', 20),
    'indicado_por', v_ind.email,
    'recompensado_em', v_ind.recompensado_em,
    'codigo', (select codigo from codigos_indicacao where user_id = p_user),
    'indicou', (select count(*) from indicacoes where indicador_id = p_user)
  );
end;
$$;

revoke execute on function admin_origem_conta(uuid) from public, anon;
grant execute on function admin_origem_conta(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';

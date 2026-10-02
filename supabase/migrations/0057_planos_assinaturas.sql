-- ============================================================
-- 0057 — Planos e assinatura (Fase 10.9).
--
-- planos      — catálogo editável pelo master (preço e limites; null = ilimitado).
-- assinaturas — uma por conta: plano contratado, status (teste/ativa/atrasada/cancelada),
--               fim do teste e do período pago, e o pedido de troca feito pela conta.
--
-- Regras:
--   * conta nova nasce em TESTE do Pro por 14 dias; contas que já existiam ficam ATIVAS no
--     Pro (ninguém perde acesso com a migração);
--   * fora do teste/período (ou atrasada há mais de 7 dias), vale o plano GRÁTIS — a conta
--     não é bloqueada, só passa a respeitar os limites menores;
--   * limites aplicados NO BANCO (gatilhos): produtos e lojas conectadas à API. O de IA
--     por mês é conferido antes de cada geração (`plano_permite_ia`);
--   * a conta não muda o próprio plano: pede (`solicitar_plano`); quem ativa é o master
--     ou, no futuro, o webhook do provedor de cobrança (service key).
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists planos (
  id              text primary key check (id ~ '^[a-z0-9_-]{2,30}$'),
  nome            text not null check (length(nome) between 1 and 40),
  descricao       text check (descricao is null or length(descricao) <= 300),
  preco_mensal    numeric(10,2) not null default 0 check (preco_mensal >= 0),
  limite_produtos integer check (limite_produtos is null or limite_produtos >= 0),
  limite_lojas    integer check (limite_lojas is null or limite_lojas >= 0),
  limite_usuarios integer check (limite_usuarios is null or limite_usuarios >= 1),
  limite_ia_mes   integer check (limite_ia_mes is null or limite_ia_mes >= 0),
  ativo           boolean not null default true,
  ordem           integer not null default 0,
  atualizado_em   timestamptz not null default now()
);

alter table planos enable row level security;
drop policy if exists "le_planos" on planos;
create policy "le_planos" on planos for select using (auth.uid() is not null);
drop policy if exists "master_planos" on planos;
create policy "master_planos" on planos for all using (e_master()) with check (e_master());

insert into planos (id, nome, descricao, preco_mensal, limite_produtos, limite_lojas, limite_usuarios, limite_ia_mes, ordem) values
  ('gratis', 'Grátis', 'Para começar: PDV, estoque e catálogo.', 0, 50, 0, 1, 20, 1),
  ('essencial', 'Essencial', 'Loja crescendo: mais produtos e um marketplace conectado.', 49.90, 1000, 1, 2, 300, 2),
  ('pro', 'Pro', 'Sem limite de produtos, vários marketplaces e IA à vontade.', 99.90, null, 5, 5, 2000, 3)
on conflict (id) do nothing;

create table if not exists assinaturas (
  user_id          uuid primary key references auth.users on delete cascade,
  plano_id         text not null references planos(id) default 'pro',
  status           text not null default 'teste' check (status in ('teste', 'ativa', 'atrasada', 'cancelada')),
  teste_ate        timestamptz,
  periodo_fim      timestamptz,
  plano_solicitado text references planos(id),
  solicitado_em    timestamptz,
  provedor         text,
  provedor_ref     text,
  observacao       text check (observacao is null or length(observacao) <= 300),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

alter table assinaturas enable row level security;
drop policy if exists "le_assinatura" on assinaturas;
create policy "le_assinatura" on assinaturas for select using (auth.uid() = user_id or e_master());
drop policy if exists "master_assinaturas" on assinaturas;
create policy "master_assinaturas" on assinaturas for all using (e_master()) with check (e_master());

-- Contas existentes: ativas no Pro (sem susto na migração). Master não tem loja: fica de fora.
insert into assinaturas (user_id, plano_id, status, observacao)
select p.user_id, 'pro', 'ativa', 'Conta anterior aos planos'
  from perfis_acesso p
 where p.papel = 'usuario'
on conflict (user_id) do nothing;

-- Conta nova: 14 dias de teste do Pro.
create or replace function criar_assinatura_teste()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.papel = 'usuario' then
    insert into assinaturas (user_id, plano_id, status, teste_ate)
    values (new.user_id, 'pro', 'teste', now() + interval '14 days')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists perfis_acesso_assinatura on perfis_acesso;
create trigger perfis_acesso_assinatura
  after insert on perfis_acesso
  for each row execute function criar_assinatura_teste();

-- Plano que VALE agora para a conta (teste/período vencido → grátis).
create or replace function plano_efetivo_id(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select a.plano_id
      from assinaturas a
      join planos pl on pl.id = a.plano_id
     where a.user_id = p_user
       and (
         (a.status = 'teste' and a.teste_ate > now())
         or (a.status = 'ativa' and (a.periodo_fim is null or a.periodo_fim > now()))
         or (a.status = 'atrasada' and a.periodo_fim is not null and a.periodo_fim + interval '7 days' > now())
       )
  ), case when exists (select 1 from assinaturas where user_id = p_user) then 'gratis' else 'pro' end);
$$;
-- Sem linha em assinaturas (conta antes da migração que escapou do backfill, ou master): Pro.

revoke execute on function plano_efetivo_id(uuid) from public, anon;
grant execute on function plano_efetivo_id(uuid) to authenticated;

-- Resumo para a tela "Plano": contratado, efetivo, status e uso.
create or replace function minha_assinatura()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_a    assinaturas;
  v_ef   text;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  select * into v_a from assinaturas where user_id = v_user;
  v_ef := plano_efetivo_id(v_user);
  return jsonb_build_object(
    'plano_id', coalesce(v_a.plano_id, 'pro'),
    'plano_efetivo', v_ef,
    'status', coalesce(v_a.status, 'ativa'),
    'teste_ate', v_a.teste_ate,
    'periodo_fim', v_a.periodo_fim,
    'plano_solicitado', v_a.plano_solicitado,
    'solicitado_em', v_a.solicitado_em,
    'uso', jsonb_build_object(
      'produtos', (select count(*) from produtos where user_id = v_user),
      'lojas', (select count(*) from marketplace_conexoes where user_id = v_user),
      'ia_mes', coalesce((select sum(geracoes) from ia_uso where user_id = v_user and dia >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date), 0)
    )
  );
end;
$$;

revoke execute on function minha_assinatura() from public, anon;
grant execute on function minha_assinatura() to authenticated;

-- A conta PEDE a troca (o master ou o provedor de cobrança é quem ativa).
create or replace function solicitar_plano(p_plano text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not conta_ativa() then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  if not exists (select 1 from planos where id = p_plano and ativo) then
    raise exception 'Plano indisponível.';
  end if;
  insert into assinaturas (user_id, plano_id, status, plano_solicitado, solicitado_em)
  values (v_user, 'gratis', 'ativa', p_plano, now())
  on conflict (user_id) do update set plano_solicitado = p_plano, solicitado_em = now(), atualizado_em = now();
end;
$$;

revoke execute on function solicitar_plano(text) from public, anon;
grant execute on function solicitar_plano(text) to authenticated;

-- IA: devolve null se pode gerar; senão, a mensagem.
create or replace function plano_permite_ia()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_plano  planos;
  v_usadas integer;
begin
  if v_user is null then
    return null;
  end if;
  select * into v_plano from planos where id = plano_efetivo_id(v_user);
  if v_plano.limite_ia_mes is null then
    return null;
  end if;
  select coalesce(sum(geracoes), 0) into v_usadas
    from ia_uso where user_id = v_user and dia >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  if v_usadas >= v_plano.limite_ia_mes then
    return format('Seu plano (%s) permite %s gerações de IA por mês e você já usou todas. Troque de plano em Configurações → Plano.', v_plano.nome, v_plano.limite_ia_mes);
  end if;
  return null;
end;
$$;

revoke execute on function plano_permite_ia() from public, anon;
grant execute on function plano_permite_ia() to authenticated;

-- Limites no banco: produtos e lojas conectadas.
create or replace function checar_limite_plano()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano planos;
  v_n     integer;
begin
  select * into v_plano from planos where id = plano_efetivo_id(new.user_id);
  if tg_table_name = 'produtos' and v_plano.limite_produtos is not null then
    select count(*) into v_n from produtos where user_id = new.user_id;
    if v_n >= v_plano.limite_produtos then
      raise exception 'Seu plano (%) permite até % produtos. Troque de plano em Configurações → Plano.', v_plano.nome, v_plano.limite_produtos;
    end if;
  elsif tg_table_name = 'marketplace_conexoes' and v_plano.limite_lojas is not null then
    select count(*) into v_n from marketplace_conexoes where user_id = new.user_id and loja_id <> new.loja_id;
    if v_n >= v_plano.limite_lojas then
      raise exception 'Seu plano (%) permite % loja(s) conectada(s) à API. Troque de plano em Configurações → Plano.', v_plano.nome, v_plano.limite_lojas;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists produtos_limite_plano on produtos;
create trigger produtos_limite_plano before insert on produtos for each row execute function checar_limite_plano();
drop trigger if exists marketplace_conexoes_limite_plano on marketplace_conexoes;
create trigger marketplace_conexoes_limite_plano before insert on marketplace_conexoes for each row execute function checar_limite_plano();

-- Master troca o plano de uma conta (com histórico).
create or replace function admin_definir_assinatura(p_user uuid, p_plano text, p_status text, p_periodo_fim timestamptz, p_teste_ate timestamptz, p_observacao text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
  v_alvo_email  text;
  v_antes       jsonb;
begin
  if not e_master() then
    raise exception 'Só o administrador pode alterar planos.';
  end if;
  if p_status not in ('teste', 'ativa', 'atrasada', 'cancelada') then
    raise exception 'Status inválido.';
  end if;
  if not exists (select 1 from planos where id = p_plano) then
    raise exception 'Plano inexistente.';
  end if;
  select to_jsonb(a) into v_antes from assinaturas a where a.user_id = p_user;
  insert into assinaturas (user_id, plano_id, status, periodo_fim, teste_ate, observacao)
  values (p_user, p_plano, p_status, p_periodo_fim, p_teste_ate, left(p_observacao, 300))
  on conflict (user_id) do update set
    plano_id = excluded.plano_id, status = excluded.status, periodo_fim = excluded.periodo_fim,
    teste_ate = excluded.teste_ate, observacao = excluded.observacao,
    -- Atendeu o pedido: limpa.
    plano_solicitado = case when assinaturas.plano_solicitado = excluded.plano_id then null else assinaturas.plano_solicitado end,
    solicitado_em = case when assinaturas.plano_solicitado = excluded.plano_id then null else assinaturas.solicitado_em end,
    atualizado_em = now();
  select email into v_admin_email from perfis_acesso where user_id = auth.uid();
  select email into v_alvo_email from perfis_acesso where user_id = p_user;
  insert into historico_admin (admin_user_id, admin_email, alvo_user_id, alvo_email, acao, detalhes)
  values (auth.uid(), coalesce(v_admin_email, ''), p_user, coalesce(v_alvo_email, ''), 'plano',
          jsonb_build_object('antes', v_antes, 'plano', p_plano, 'status', p_status, 'periodo_fim', p_periodo_fim, 'teste_ate', p_teste_ate));
end;
$$;

revoke execute on function admin_definir_assinatura(uuid, text, text, timestamptz, timestamptz, text) from public, anon;
grant execute on function admin_definir_assinatura(uuid, text, text, timestamptz, timestamptz, text) to authenticated;

NOTIFY pgrst, 'reload schema';

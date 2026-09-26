-- ============================================================
-- Histórico de ações do master, atividade por conta e ações em lote.
--
-- O /admin de hoje (0020) já lista contas, aprova, suspende e libera aba por aba — mas
-- nada registra QUANDO isso aconteceu nem O QUE mudou. Esta migração fecha isso sem abrir
-- superfície de escrita nova: o histórico é gravado de dentro da própria RPC que já era
-- security definer e já conferia e_master(), então nenhuma tabela nova precisa de policy
-- de INSERT.
--
-- Pré-requisito: 0020, 0021, 0022 aplicadas (usa e_master(), perfis_acesso, vendas).
-- ============================================================

-- `to_regclass` só resolve RELAÇÃO (tabela/view/índice) — nunca função. Checar `e_master`
-- com ele sempre devolveria NULL, mesmo com a 0020 aplicada, e a guarda recusaria rodar
-- para sempre. A checagem de função precisa ir em pg_proc.
do $$
begin
  if to_regclass('public.perfis_acesso') is null then
    raise exception 'Aplique 0020_perfis_acesso_admin.sql antes desta.';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'e_master'
  ) then
    raise exception 'Aplique 0020_perfis_acesso_admin.sql antes desta (função e_master ausente).';
  end if;
end $$;

-- ============================================================
-- 1) historico_admin — quem fez o quê, em qual conta, e quando.
--
-- Sem policy de insert/update/delete: só a RPC admin_atualizar_conta (security definer)
-- escreve aqui, no mesmo padrão de perfis_acesso na 0020. `alvo_email` e `admin_email` são
-- snapshot — sobrevivem a uma conta ser removida depois, o que uma FK sozinha não garante.
-- ============================================================

create table if not exists historico_admin (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users on delete set null,
  admin_email text not null,
  alvo_user_id uuid references auth.users on delete set null,
  alvo_email text not null,
  acao text not null,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists historico_admin_alvo_idx on historico_admin (alvo_user_id, criado_em desc);
create index if not exists historico_admin_criado_idx on historico_admin (criado_em desc);

alter table historico_admin enable row level security;

drop policy if exists "le_historico_admin" on historico_admin;
create policy "le_historico_admin" on historico_admin for select using (e_master());

-- ============================================================
-- 2) admin_atualizar_conta: mesma assinatura e mesmo `returns void`, então `create or
-- replace` é seguro sem precisar de `drop function` antes (a armadilha do CLAUDE.md só
-- vale para mudança de RETURNS TABLE).
--
-- Só grava histórico quando algo REALMENTE muda: comparar antes/depois evita que um
-- "Salvar" sem alteração vire ruído na auditoria.
-- ============================================================

create or replace function admin_atualizar_conta(
  p_user_id uuid,
  p_status text,
  p_abas text[],
  p_observacao text default null,
  p_expira_em date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alvo perfis_acesso%rowtype;
  v_admin_email text;
  v_detalhes jsonb := '{}'::jsonb;
begin
  if not e_master() then
    raise exception 'Só a conta master pode alterar o acesso de uma conta.';
  end if;

  if p_status not in ('pendente', 'ativo', 'suspenso') then
    raise exception 'Status inválido: %', p_status;
  end if;

  select * into v_alvo from perfis_acesso where user_id = p_user_id;
  if not found then
    raise exception 'Conta não encontrada.';
  end if;

  -- Trava de segurança: o master não pode se suspender nem se trancar fora do painel.
  -- Sem isso, um clique errado deixa o sistema sem ninguém capaz de liberar ninguém.
  if v_alvo.papel = 'master' and p_status <> 'ativo' then
    raise exception 'A conta master não pode ser suspensa por aqui.';
  end if;

  if v_alvo.status is distinct from p_status then
    v_detalhes := v_detalhes || jsonb_build_object('status', jsonb_build_object('de', v_alvo.status, 'para', p_status));
  end if;
  if v_alvo.abas is distinct from p_abas then
    v_detalhes := v_detalhes || jsonb_build_object(
      'abas', jsonb_build_object('de', to_jsonb(v_alvo.abas), 'para', to_jsonb(p_abas))
    );
  end if;
  if v_alvo.observacao is distinct from p_observacao then
    v_detalhes := v_detalhes || jsonb_build_object('observacao', jsonb_build_object('de', v_alvo.observacao, 'para', p_observacao));
  end if;
  if v_alvo.expira_em is distinct from p_expira_em then
    v_detalhes := v_detalhes || jsonb_build_object('expira_em', jsonb_build_object('de', v_alvo.expira_em, 'para', p_expira_em));
  end if;

  update perfis_acesso
     set status = p_status,
         abas = p_abas,
         observacao = p_observacao,
         expira_em = p_expira_em,
         aprovado_em = case when p_status = 'ativo' and aprovado_em is null then now() else aprovado_em end
   where user_id = p_user_id;

  if v_detalhes <> '{}'::jsonb then
    select email into v_admin_email from perfis_acesso where user_id = auth.uid();
    insert into historico_admin (admin_user_id, admin_email, alvo_user_id, alvo_email, acao, detalhes)
    values (auth.uid(), coalesce(v_admin_email, ''), p_user_id, v_alvo.email, 'atualizar_acesso', v_detalhes);
  end if;
end;
$$;

-- ============================================================
-- 3) admin_atividade_conta: série diária de vendas/faturamento de UMA conta específica,
-- para o gráfico da página de detalhe. Só existe como RPC porque agrega dado de uma conta
-- que não é a do chamador — sem `security definer` + `e_master()` isso é impossível sob RLS.
--
-- O bucketing usa fuso de Brasília explicitamente, não `date()` cru: a sessão do Postgres
-- no Supabase roda em UTC, e sem o `at time zone` uma venda das 22h cairia no dia seguinte
-- — o mesmo off-by-one que o app já teve que corrigir do lado do JavaScript.
-- ============================================================

create or replace function admin_atividade_conta(p_user_id uuid, p_dias integer default 90)
returns table (dia date, vendas bigint, faturamento numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias integer := least(greatest(coalesce(p_dias, 90), 1), 365);
begin
  if not e_master() then
    raise exception 'Só a conta master pode ver a atividade de uma conta.';
  end if;

  return query
  select d::date,
         coalesce(v.qtd, 0)::bigint,
         coalesce(v.total, 0)::numeric
    from generate_series(current_date - (v_dias - 1), current_date, interval '1 day') d
    left join (
      select (x.data_venda at time zone 'America/Sao_Paulo')::date as dia,
             count(*) as qtd,
             sum(x.total) as total
        from vendas x
       where x.user_id = p_user_id
         and x.status <> 'cancelada'
         and x.data_venda >= (current_date - (v_dias - 1))
       group by 1
    ) v on v.dia = d::date
   order by d;
end;
$$;

-- ============================================================
-- 4) admin_atualizar_status_lote: aprova/suspende várias contas numa chamada só, em vez de
-- uma RPC por conta. Loga uma linha de historico_admin por conta afetada.
-- ============================================================

create or replace function admin_atualizar_status_lote(p_user_ids uuid[], p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_email text;
begin
  if not e_master() then
    raise exception 'Só a conta master pode alterar contas.';
  end if;

  if p_status not in ('pendente', 'ativo', 'suspenso') then
    raise exception 'Status inválido: %', p_status;
  end if;

  if exists (
    select 1 from perfis_acesso where user_id = any(p_user_ids) and papel = 'master' and p_status <> 'ativo'
  ) then
    raise exception 'A conta master não pode ser suspensa em lote.';
  end if;

  select email into v_admin_email from perfis_acesso where user_id = auth.uid();

  insert into historico_admin (admin_user_id, admin_email, alvo_user_id, alvo_email, acao, detalhes)
  select auth.uid(), coalesce(v_admin_email, ''), p.user_id, p.email, 'atualizar_status_lote',
         jsonb_build_object('status', jsonb_build_object('de', p.status, 'para', p_status))
    from perfis_acesso p
   where p.user_id = any(p_user_ids)
     and p.status is distinct from p_status;

  update perfis_acesso
     set status = p_status,
         aprovado_em = case when p_status = 'ativo' and aprovado_em is null then now() else aprovado_em end
   where user_id = any(p_user_ids);
end;
$$;

grant execute on function admin_atividade_conta(uuid, integer) to authenticated;
grant execute on function admin_atualizar_status_lote(uuid[], text) to authenticated;

NOTIFY pgrst, 'reload schema';

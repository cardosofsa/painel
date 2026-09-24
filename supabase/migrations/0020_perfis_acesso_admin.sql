-- ============================================================
-- Conta master e controle de acesso por conta.
--
-- O sistema já era multi-inquilino no banco: toda tabela tem `user_id` com RLS
-- `auth.uid() = user_id`, então cada conta enxerga só os próprios dados. O que
-- faltava era alguém acima disso: uma conta master que vê todos os cadastros,
-- aprova quem entra e decide quais abas cada conta tem direito de usar.
--
-- DECISÕES DE SEGURANÇA (o ponto mais delicado desta migração):
--
-- 1) `perfis_acesso` NÃO tem policy de INSERT/UPDATE/DELETE. Nenhuma. Se tivesse
--    o `for all using (auth.uid() = user_id)` usado no resto do schema, qualquer
--    usuário poderia abrir o console do navegador e rodar
--    `update perfis_acesso set papel = 'master'` com a chave anônima — escalada
--    de privilégio direta. Toda escrita passa por RPC `security definer` que
--    confere `e_master()` antes de qualquer coisa.
--
-- 2) A policy de SELECT precisa responder "quem pergunta é master?", e consultar
--    `perfis_acesso` de dentro da policy da própria `perfis_acesso` gera recursão
--    infinita. Por isso `e_master()` é `security definer`: roda ignorando RLS e
--    corta o ciclo.
--
-- 3) A linha do perfil nasce por trigger em `auth.users` (mesmo padrão de
--    `seed_canais_novo_usuario`, 0004) já com status 'pendente'. Cadastro aberto
--    continua funcionando, mas ninguém entra sem o master liberar.
--
-- DEPOIS DE RODAR ESTA MIGRAÇÃO, promova sua conta a master — troque o e-mail:
--
--   update perfis_acesso
--      set papel = 'master', status = 'ativo', abas = array[
--            'dashboard','pdv','vendas','precificacao','produtos','clientes',
--            'fornecedores','compras','estoque','financeiro','catalogo','configuracoes']
--    where email = 'SEU-EMAIL@EXEMPLO.COM';
--
-- Sem isso ninguém é master e o painel /admin fica inacessível para todos.
-- ============================================================

create table perfis_acesso (
  user_id uuid primary key references auth.users on delete cascade,
  email text not null,
  papel text not null default 'usuario' check (papel in ('master', 'usuario')),
  status text not null default 'pendente' check (status in ('pendente', 'ativo', 'suspenso')),
  abas text[] not null default array['dashboard', 'configuracoes']::text[],
  observacao text,
  expira_em date,
  ultimo_acesso timestamptz,
  aprovado_em timestamptz,
  criado_em timestamptz not null default now()
);

create index perfis_acesso_status_idx on perfis_acesso (status);

alter table perfis_acesso enable row level security;

-- security definer de propósito: ignora RLS e evita a recursão descrita acima.
create or replace function e_master()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from perfis_acesso
    where user_id = auth.uid() and papel = 'master' and status = 'ativo'
  );
$$;

-- Cada um lê o próprio perfil (o app precisa saber quais abas liberar); o master lê todos.
create policy "le_perfil_acesso" on perfis_acesso for select
  using (auth.uid() = user_id or e_master());

-- ============================================================
-- Perfil nasce junto com o usuário, em 'pendente'.
-- ============================================================

create or replace function criar_perfil_acesso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfis_acesso (user_id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_perfil on auth.users;
create trigger on_auth_user_created_perfil
after insert on auth.users
for each row execute function criar_perfil_acesso();

-- Quem já usava o sistema antes desta migração continua dentro, com tudo liberado.
insert into perfis_acesso (user_id, email, status, aprovado_em, abas)
select u.id,
       coalesce(u.email, ''),
       'ativo',
       now(),
       array['dashboard', 'pdv', 'vendas', 'precificacao', 'produtos', 'clientes',
             'fornecedores', 'compras', 'estoque', 'financeiro', 'catalogo', 'configuracoes']::text[]
from auth.users u
on conflict (user_id) do nothing;

-- ============================================================
-- RPCs do painel master. Todas conferem e_master() antes de tocar em qualquer coisa —
-- `security definer` sem essa checagem seria um buraco aberto no RLS.
-- ============================================================

create or replace function admin_listar_contas()
returns table (
  user_id uuid,
  email text,
  papel text,
  status text,
  abas text[],
  observacao text,
  expira_em date,
  ultimo_acesso timestamptz,
  aprovado_em timestamptz,
  criado_em timestamptz,
  -- Tempo é resolvido aqui, no mesmo relógio que gravou os timestamps: evita divergência
  -- entre o relógio do servidor do app e o do banco, e tira o cálculo de data do render.
  dias_sem_acesso integer,
  expirado boolean,
  total_produtos bigint,
  total_vendas bigint,
  total_precificacoes bigint,
  faturamento_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not e_master() then
    raise exception 'Só a conta master pode listar as contas do sistema.';
  end if;

  return query
  select
    p.user_id, p.email, p.papel, p.status, p.abas, p.observacao, p.expira_em,
    p.ultimo_acesso, p.aprovado_em, p.criado_em,
    case when p.ultimo_acesso is null then null
         else extract(day from now() - p.ultimo_acesso)::integer end,
    (p.expira_em is not null and p.expira_em < current_date),
    (select count(*) from produtos x where x.user_id = p.user_id),
    (select count(*) from vendas x where x.user_id = p.user_id and x.status <> 'cancelada'),
    (select count(*) from precificacoes x where x.user_id = p.user_id),
    coalesce((select sum(x.total) from vendas x where x.user_id = p.user_id and x.status <> 'cancelada'), 0)
  from perfis_acesso p
  order by p.criado_em desc;
end;
$$;

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

  update perfis_acesso
     set status = p_status,
         abas = p_abas,
         observacao = p_observacao,
         expira_em = p_expira_em,
         aprovado_em = case when p_status = 'ativo' and aprovado_em is null then now() else aprovado_em end
   where user_id = p_user_id;
end;
$$;

-- Última visita, para o master saber quem usa de verdade e quem só cadastrou e sumiu.
-- O guard de 1 hora existe pra isso não virar um UPDATE a cada navegação.
create or replace function tocar_ultimo_acesso()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update perfis_acesso
     set ultimo_acesso = now()
   where user_id = auth.uid()
     and (ultimo_acesso is null or ultimo_acesso < now() - interval '1 hour');
end;
$$;

grant execute on function e_master() to authenticated;
grant execute on function admin_listar_contas() to authenticated;
grant execute on function admin_atualizar_conta(uuid, text, text[], text, date) to authenticated;
grant execute on function tocar_ultimo_acesso() to authenticated;

NOTIFY pgrst, 'reload schema';

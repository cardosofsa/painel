-- ============================================================
-- Master enxerga o consumo de IA de uma conta.
--
-- A policy de `ia_uso` (0024) é `auth.uid() = user_id`: cada um lê o próprio consumo, e o
-- master não lê o de ninguém. Isso é correto como policy — o que falta é uma porta
-- explícita, gated por e_master(), em vez de afrouxar o RLS.
--
-- Sem isso, o master define cota no escuro: vê o limite, nunca o gasto.
--
-- Pré-requisito: 0024 (ia_uso, ia_limite_diario), 0020 (e_master).
-- ============================================================

do $$
begin
  if to_regclass('public.ia_uso') is null then
    raise exception 'Aplique 0024_ia_cota_e_cache.sql antes desta.';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'e_master'
  ) then
    raise exception 'Aplique 0020_perfis_acesso_admin.sql antes desta (função e_master ausente).';
  end if;
end $$;

-- DROP explícito antes: `create or replace` não muda a lista de colunas de um RETURNS
-- TABLE (armadilha documentada no CLAUDE.md).
drop function if exists admin_uso_ia_conta(uuid);
create or replace function admin_uso_ia_conta(p_user_id uuid)
returns table (
  limite        integer,
  usadas_hoje   integer,
  cache_hoje    integer,
  usadas_30dias bigint,
  cache_30dias  bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not e_master() then
    raise exception 'Só a conta master pode ver o consumo de IA de uma conta.';
  end if;

  return query
  select
    coalesce((select p.ia_limite_diario from perfis_acesso p where p.user_id = p_user_id), 0),
    -- coalesce nos dois: conta que ainda não gerou nada hoje não tem linha em ia_uso, e
    -- devolver NULL faria a tela mostrar vazio em vez de zero.
    coalesce((select u.geracoes   from ia_uso u where u.user_id = p_user_id and u.dia = v_hoje), 0),
    coalesce((select u.cache_hits from ia_uso u where u.user_id = p_user_id and u.dia = v_hoje), 0),
    coalesce((select sum(u.geracoes)   from ia_uso u where u.user_id = p_user_id and u.dia > v_hoje - 30), 0),
    coalesce((select sum(u.cache_hits) from ia_uso u where u.user_id = p_user_id and u.dia > v_hoje - 30), 0);
end;
$$;

grant execute on function admin_uso_ia_conta(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Conferência (precisa voltar uma linha, com a sua própria conta master):
--
--   select * from admin_uso_ia_conta(auth.uid());
-- ============================================================

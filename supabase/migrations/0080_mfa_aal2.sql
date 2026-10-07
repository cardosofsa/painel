-- ============================================================
-- 0080 — Verificação em duas etapas (MFA TOTP) também no banco.
--
-- Até aqui o MFA era só roteamento: o middleware manda para /auth/mfa quem tem fator
-- verificado e está em `aal1`, mas um JWT `aal1` dessa conta (só com a senha) ainda lia e
-- gravava tudo direto pelo PostgREST, pelo console do navegador. Regra do projeto: se a
-- checagem só existe no servidor do app, ela não existe.
--
-- 1) `conta_ativa()` — que já está em todas as policies de dados, nas do Storage e no começo
--    das RPCs do painel — passa a exigir também: JWT `aal2` OU a conta não ter fator
--    verificado em `auth.mfa_factors`.
-- 2) `e_master()` ganha a mesma condição. O master é o alvo mais valioso (todas as RPCs
--    `admin_*`, planos, assinaturas, histórico do admin); com a senha vazada e sem o código,
--    não passa.
--
-- O que NÃO muda:
--   - Conta sem fator (ou com fator só cadastrado, `unverified`): idêntico a antes.
--   - `perfis_acesso` continua legível pelo dono (`auth.uid() = user_id or e_master()`):
--     middleware e /aguardando leem ela; o middleware desvia para /auth/mfa ANTES de ler `perfil_negocio`
--     (que tem `conta_ativa()`). A tela /auth/mfa, o `challenge`/`verify` e o
--     logout são chamadas à GoTrue, nenhuma passa por tabela com `conta_ativa()`.
--   - `conta_ativa_de(dono)` (vitrine pública) não olha a sessão de quem visita.
--   - Service role (cron, webhooks) ignora RLS e não é afetada.
--
-- Desempenho: dentro do `or`, o teste do `aal` vem primeiro e dispensa a consulta a
-- `auth.mfa_factors` para quem está em `aal2`. Fora isso, é um `exists` por `user_id`,
-- coberto pelo índice `factor_id_created_at_idx (user_id, created_at)` da própria GoTrue.
--
-- Assinatura e retorno iguais aos da 0020/0021 (`() returns boolean`): `create or replace`
-- basta e mantém os grants. O grant a authenticated é repetido por garantia; a 0077 deixou
-- essas duas fora do revoke de anon de propósito (são chamadas dentro de policy).
--
-- Idempotente: só `create or replace` e `grant`. Termina com NOTIFY.
-- ============================================================

do $$
begin
  if to_regclass('auth.mfa_factors') is null then
    raise exception 'auth.mfa_factors não existe: esta migração é para um projeto do Supabase.';
  end if;
  if to_regclass('public.perfis_acesso') is null then
    raise exception 'Aplique a migração 0020_perfis_acesso_admin.sql antes desta.';
  end if;
end $$;

-- ---------- 1) conta_ativa() ----------
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
  )
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    )
  );
$$;

grant execute on function conta_ativa() to authenticated;

-- ---------- 2) e_master() ----------
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
  )
  and (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status = 'verified'
    )
  );
$$;

grant execute on function e_master() to authenticated;

notify pgrst, 'reload schema';

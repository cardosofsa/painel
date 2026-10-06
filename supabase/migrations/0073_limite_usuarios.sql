-- 0073 — Limite de usuários do plano (Fase 4).
--
-- `planos.limite_usuarios` existia desde a 0057, mas nada o conferia. Agora conta o dono
-- (1) + os operadores ATIVOS, e o banco recusa cadastrar ou reativar operador acima do
-- limite. Desativar continua sempre permitido. A conta master fica de fora.
--
-- `minha_assinatura()` passa a devolver também `uso.usuarios` e `uso.imagens_mes`
-- (a tela "Plano" mostra as barras). Retorno jsonb: create or replace basta.
--
-- Idempotente: create or replace + drop trigger if exists.

create or replace function checar_limite_usuarios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plano planos;
  v_n     integer;
begin
  if not coalesce(new.ativo, true) then
    return new;
  end if;
  -- Update que não reativa (já estava ativo) não muda a contagem.
  if tg_op = 'UPDATE' and coalesce(old.ativo, false) then
    return new;
  end if;
  if exists (select 1 from perfis_acesso where user_id = new.user_id and papel = 'master') then
    return new;
  end if;
  select * into v_plano from planos where id = plano_efetivo_id(new.user_id);
  if v_plano.limite_usuarios is null then
    return new;
  end if;
  -- Trava a conta: dois cadastros ao mesmo tempo não passam juntos pela última vaga.
  perform 1 from perfis_acesso where user_id = new.user_id for update;
  select count(*)::integer into v_n from operadores where user_id = new.user_id and ativo and id <> new.id;
  if 1 + v_n >= v_plano.limite_usuarios then
    raise exception 'Seu plano (%) permite % usuário(s), contando você. Desative um operador ou troque de plano em Configurações → Plano.', v_plano.nome, v_plano.limite_usuarios;
  end if;
  return new;
end;
$$;

drop trigger if exists operadores_limite_plano on operadores;
create trigger operadores_limite_plano
  before insert or update of ativo on operadores
  for each row execute function checar_limite_usuarios();

create or replace function minha_assinatura()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_a       assinaturas;
  v_ef      text;
  v_imagens integer := 0;
begin
  if v_user is null then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  select * into v_a from assinaturas where user_id = v_user;
  v_ef := plano_efetivo_id(v_user);
  -- ia_imagens chega na 0072; antes dela, zero.
  if to_regclass('public.ia_imagens') is not null then
    execute $q$
      select count(*)::integer from ia_imagens
       where user_id = $1
         and criado_em >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
         and (status = 'ok' or criado_em > now() - interval '10 minutes')
    $q$ into v_imagens using v_user;
  end if;
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
      'ia_mes', coalesce((select sum(geracoes) from ia_uso where user_id = v_user and dia >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date), 0),
      'usuarios', 1 + (select count(*) from operadores where user_id = v_user and ativo),
      'imagens_mes', v_imagens
    )
  );
end;
$$;

revoke execute on function minha_assinatura() from public, anon;
grant execute on function minha_assinatura() to authenticated;

NOTIFY pgrst, 'reload schema';

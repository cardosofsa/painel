-- ============================================================
-- 0082 — Pendências da cobrança automática (Asaas), ver docs/cobranca-asaas.md.
--
-- assinaturas ganha:
--   periodo_fim_provedor            — fim do período que o PROVEDOR cobre (sem bônus). O webhook
--                                     compara e estende por ele; `periodo_fim` continua sendo o
--                                     período EFETIVO, que tudo lê (plano_efetivo_id, telas).
--   dias_bonus                      — dias de bônus de indicação somados ao período do provedor:
--                                     periodo_fim = periodo_fim_provedor + dias_bonus. Assim a
--                                     renovação seguinte não engole o bônus (pendência 4).
--   provedor_refs_encerradas        — assinaturas do provedor já encerradas (troca de plano, ida
--                                     para o Grátis). Evento delas é ignorado: pagar uma fatura
--                                     pendente da antiga não reativa o plano antigo (pendência 1).
--   provedor_pagamentos_estornados  — cobranças estornadas/contestadas/excluídas já aplicadas
--                                     (idempotência do estorno, pendência 2).
--   ultimo_pagamento_ref            — cobrança que causou a última ativação: a recompensa de
--                                     indicação guarda qual pagamento a gerou, para desfazer no
--                                     estorno.
--   cancelamento_agendado           — ida para o Grátis: cancelada no provedor, mas o plano pago
--                                     vale até `periodo_fim` (pendência 3).
-- indicacoes ganha `pagamento_ref` e `estornado_em`.
--
-- Funções:
--   aplicar_bonus_indicacao  — igual à 0078, mas no ramo "ativa e pago" soma também em
--                              dias_bonus (o webhook reaplica o bônus por cima da data do provedor).
--   recompensar_indicacao    — igual à 0078, gravando `pagamento_ref`.
--   desfazer_bonus_indicacao — estorno do pagamento que gerou a recompensa: tira os 30 dias das
--                              duas contas, uma vez só (service_role, chamada pelo webhook).
--   agendar_cancelamento_assinatura — a própria conta marca/desmarca o cancelamento no fim do
--                              período (a action chama antes de cancelar no provedor). Só mexe
--                              na própria linha e só nesse campo: não dá plano a ninguém.
--
-- Colunas novas são nuláveis ou têm default: o código no ar (que não as lê) segue igual.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table assinaturas add column if not exists periodo_fim_provedor timestamptz;
alter table assinaturas add column if not exists dias_bonus integer not null default 0;
alter table assinaturas add column if not exists provedor_refs_encerradas text[] not null default '{}';
alter table assinaturas add column if not exists provedor_pagamentos_estornados text[] not null default '{}';
alter table assinaturas add column if not exists ultimo_pagamento_ref text;
alter table assinaturas add column if not exists cancelamento_agendado boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assinaturas_dias_bonus_check') then
    alter table assinaturas add constraint assinaturas_dias_bonus_check check (dias_bonus >= 0 and dias_bonus <= 3650);
  end if;
end;
$$;

alter table indicacoes add column if not exists pagamento_ref text;
alter table indicacoes add column if not exists estornado_em timestamptz;

-- ---------- Bônus: também em dias_bonus quando estende um período pago ----------
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
    return; -- sem linha = Pro sem prazo (ver 0078)
  end if;
  select coalesce(pl.preco_mensal > 0, false) into v_pago from planos pl where pl.id = v_a.plano_id;

  if v_a.status = 'teste' and v_a.teste_ate is not null and v_a.teste_ate > now() then
    update assinaturas set teste_ate = teste_ate + v_int, atualizado_em = now() where user_id = p_user;
  elsif v_a.status = 'ativa' and coalesce(v_pago, false) and (v_a.periodo_fim is null or v_a.periodo_fim > now()) then
    if v_a.periodo_fim is not null then
      update assinaturas
         set periodo_fim = periodo_fim + v_int,
             dias_bonus = least(dias_bonus + p_dias, 3650),
             atualizado_em = now()
       where user_id = p_user;
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

-- Tira o bônus: do teste vigente ou do período (e de dias_bonus, sem ficar negativo).
create or replace function remover_bonus_indicacao(p_user uuid, p_dias integer)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_a   assinaturas;
  v_int interval := make_interval(days => p_dias);
begin
  select * into v_a from assinaturas where user_id = p_user for update;
  if not found then
    return;
  end if;
  if v_a.status = 'teste' and v_a.teste_ate is not null then
    update assinaturas set teste_ate = teste_ate - v_int, atualizado_em = now() where user_id = p_user;
  elsif v_a.periodo_fim is not null then
    update assinaturas
       set periodo_fim = periodo_fim - v_int,
           dias_bonus = greatest(dias_bonus - p_dias, 0),
           atualizado_em = now()
     where user_id = p_user;
  end if;
end;
$$;

revoke execute on function remover_bonus_indicacao(uuid, integer) from public, anon, authenticated;

-- ---------- Recompensa: guarda o pagamento que a gerou ----------
create or replace function recompensar_indicacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_indicador uuid;
begin
  if coalesce(current_setting('sertao.bonus_indicacao', true), '') = '1' then
    return new;
  end if;
  if new.status <> 'ativa' or not exists (select 1 from planos where id = new.plano_id and preco_mensal > 0) then
    return new;
  end if;
  update indicacoes set recompensado_em = now(), pagamento_ref = new.ultimo_pagamento_ref
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

-- ---------- Estorno do pagamento que gerou a recompensa ----------
-- true = desfez agora; false = nada a fazer (outro pagamento, já desfeito, sem indicação).
create or replace function desfazer_bonus_indicacao(p_indicado uuid, p_pagamento text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_indicador uuid;
begin
  if p_indicado is null or coalesce(p_pagamento, '') = '' then
    return false;
  end if;
  -- Marca primeiro, e só se ainda não estava: é o que garante "uma vez só".
  update indicacoes set estornado_em = now()
   where indicado_id = p_indicado and pagamento_ref = p_pagamento
     and recompensado_em is not null and estornado_em is null
  returning indicador_id into v_indicador;
  if v_indicador is null then
    return false;
  end if;
  perform set_config('sertao.bonus_indicacao', '1', true);
  perform remover_bonus_indicacao(p_indicado, 30);
  perform remover_bonus_indicacao(v_indicador, 30);
  perform set_config('sertao.bonus_indicacao', '', true);
  return true;
end;
$$;

revoke execute on function desfazer_bonus_indicacao(uuid, text) from public, anon, authenticated;
grant execute on function desfazer_bonus_indicacao(uuid, text) to service_role;

-- ---------- Ida para o Grátis no fim do período ----------
create or replace function agendar_cancelamento_assinatura(p_agendar boolean default true)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not conta_ativa() then
    raise exception 'Sessão expirada. Entre de novo.';
  end if;
  update assinaturas
     set cancelamento_agendado = coalesce(p_agendar, true), atualizado_em = now()
   where user_id = v_user and provedor is not null;
end;
$$;

revoke execute on function agendar_cancelamento_assinatura(boolean) from public, anon;
grant execute on function agendar_cancelamento_assinatura(boolean) to authenticated;

NOTIFY pgrst, 'reload schema';

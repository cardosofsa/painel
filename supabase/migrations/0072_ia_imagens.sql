-- ============================================================
-- 0072 — Estúdio de IA (Fase 2): imagens de produto com IA e cota por plano.
--
-- 1) `planos.limite_imagens_mes`: imagens por mês (null = ilimitado). Na criação da coluna:
--    Grátis 5, Essencial 50, Pro 300 (o master muda depois no painel).
-- 2) `ia_imagens`: uma linha por imagem pedida. Só leitura para a conta; escrita só pelas
--    funções abaixo (o mesmo desenho da cota de texto, 0024: checagem no Node é
--    contornável pelo console).
-- 3) Ciclo de uma geração, sempre pelo servidor:
--      ia_reservar_imagem  → confere conta ativa, produto do dono e a cota do mês; reserva
--      (chamada ao modelo de imagem + upload no Storage)
--      ia_concluir_imagem  → marca como feita, com o caminho do arquivo
--      ia_cancelar_imagem  → devolve a vaga se deu erro (só reserva recente e não concluída:
--                            a imagem só existe depois de concluir, então cancelar não dá
--                            imagem de graça)
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Limite por plano
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'planos' and column_name = 'limite_imagens_mes') then
    alter table planos add column limite_imagens_mes integer check (limite_imagens_mes is null or limite_imagens_mes >= 0);
    update planos set limite_imagens_mes = case id when 'gratis' then 5 when 'essencial' then 50 when 'pro' then 300 else null end;
  end if;
end $$;

-- 2) Registro das imagens
create table if not exists ia_imagens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  produto_id   uuid references produtos(id) on delete set null,
  tipo         text not null check (tipo in ('fundo_branco', 'ambiente', 'capa_selo', 'variacao_cor', 'medidas', 'livre')),
  status       text not null default 'reservada' check (status in ('reservada', 'ok')),
  caminho      text check (caminho is null or length(caminho) <= 300),
  criado_em    timestamptz not null default now(),
  concluida_em timestamptz
);

create index if not exists ia_imagens_mes_idx on ia_imagens (user_id, criado_em desc);
create index if not exists idx_fk_ia_imagens_produto_id on ia_imagens (produto_id) where produto_id is not null;

alter table ia_imagens enable row level security;
drop policy if exists "le_ia_imagens" on ia_imagens;
create policy "le_ia_imagens" on ia_imagens for select using (auth.uid() = user_id and conta_ativa());

-- 3) Ciclo da geração
drop function if exists ia_reservar_imagem(text, uuid);
create function ia_reservar_imagem(p_tipo text, p_produto_id uuid default null)
returns table (id uuid, usadas integer, limite integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_plano  planos;
  v_inicio timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_usadas integer;
  v_id     uuid;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre de novo para continuar.';
  end if;
  if not conta_ativa() then
    raise exception 'Sua conta não está ativa. Fale com o administrador.';
  end if;
  if p_tipo not in ('fundo_branco', 'ambiente', 'capa_selo', 'variacao_cor', 'medidas', 'livre') then
    raise exception 'Tipo de imagem inválido.';
  end if;
  if p_produto_id is not null and not exists (select 1 from produtos where produtos.id = p_produto_id and produtos.user_id = v_uid) then
    raise exception 'Produto não encontrado.';
  end if;

  -- Trava a conta: duas gerações ao mesmo tempo não passam juntas pela última vaga.
  perform 1 from perfis_acesso where user_id = v_uid for update;

  select * into v_plano from planos where planos.id = plano_efetivo_id(v_uid);
  -- Reserva esquecida (o servidor caiu no meio) para de contar depois de 10 minutos.
  select count(*)::integer into v_usadas from ia_imagens
   where ia_imagens.user_id = v_uid and criado_em >= v_inicio
     and (status = 'ok' or criado_em > now() - interval '10 minutes');

  if not e_master() and v_plano.limite_imagens_mes is not null and v_usadas >= v_plano.limite_imagens_mes then
    raise exception 'Seu plano (%) permite % imagens com IA por mês e você já usou todas. Troque de plano em Configurações → Plano.', v_plano.nome, v_plano.limite_imagens_mes;
  end if;

  insert into ia_imagens (user_id, produto_id, tipo) values (v_uid, p_produto_id, p_tipo) returning ia_imagens.id into v_id;
  return query select v_id, v_usadas + 1, v_plano.limite_imagens_mes;
end;
$$;

create or replace function ia_concluir_imagem(p_id uuid, p_caminho text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update ia_imagens
     set status = 'ok', caminho = left(p_caminho, 300), concluida_em = now()
   where id = p_id and user_id = auth.uid() and status = 'reservada';
  return found;
end;
$$;

create or replace function ia_cancelar_imagem(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from ia_imagens
   where id = p_id and user_id = auth.uid() and status = 'reservada' and criado_em > now() - interval '10 minutes';
end;
$$;

revoke execute on function ia_reservar_imagem(text, uuid) from public, anon;
revoke execute on function ia_concluir_imagem(uuid, text) from public, anon;
revoke execute on function ia_cancelar_imagem(uuid) from public, anon;
grant execute on function ia_reservar_imagem(text, uuid) to authenticated;
grant execute on function ia_concluir_imagem(uuid, text) to authenticated;
grant execute on function ia_cancelar_imagem(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';

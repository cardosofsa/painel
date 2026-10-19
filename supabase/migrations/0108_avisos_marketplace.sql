-- ============================================================
-- 0108 — Notificações do Mercado Livre: deduplicação e teto por conta.
--
-- Por quê: o webhook é público. Ele já recusa aviso de outro app, de vendedor sem conexão e
-- de recurso malformado, e o pedido é LIDO de novo na API oficial (o corpo nunca é confiado).
-- Mas o mesmo aviso repetido (o ML reenvia, ou alguém repete de propósito) fazia o Sertão
-- reler o mesmo pedido de novo a cada chamada, gastando cota da API e tempo de função; e
-- avisos de envio simultâneos passavam todos pela checagem de `ultima_sincronizacao` antes de
-- qualquer um gravar a data.
--
-- `registrar_aviso_marketplace` decide de forma ATÔMICA (um INSERT ... ON CONFLICT): devolve
-- true só para o primeiro aviso de cada chave dentro da janela, e false quando a conta já
-- passou do teto de avisos no último minuto. Só o service role chama (é quem recebe o
-- webhook); a tabela tem RLS e só leitura para o dono.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

create table if not exists marketplace_avisos (
  user_id   uuid not null references auth.users on delete cascade default auth.uid(),
  chave     text not null check (length(chave) between 1 and 200),
  visto_em  timestamptz not null default now(),
  primary key (user_id, chave)
);
create index if not exists marketplace_avisos_recentes_idx on marketplace_avisos (user_id, visto_em desc);

alter table marketplace_avisos enable row level security;
drop policy if exists "dono_marketplace_avisos" on marketplace_avisos;
create policy "dono_marketplace_avisos" on marketplace_avisos for select
  using (auth.uid() = user_id and conta_ativa());
-- Sem policy de escrita de propósito: só a função abaixo (security definer) grava.

create or replace function registrar_aviso_marketplace(p_user uuid, p_chave text, p_janela_s integer default 30, p_teto_minuto integer default 120)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_novo boolean;
begin
  if p_user is null or p_chave is null or length(p_chave) not between 1 and 200 then
    return false;
  end if;
  -- Teto por conta: muitos avisos no último minuto = descarta (o cron completo pega o resto).
  if (select count(*) from marketplace_avisos where user_id = p_user and visto_em > now() - interval '1 minute') >= greatest(1, p_teto_minuto) then
    return false;
  end if;
  insert into marketplace_avisos (user_id, chave, visto_em) values (p_user, p_chave, now())
  on conflict (user_id, chave) do update set visto_em = now()
   where marketplace_avisos.visto_em < now() - make_interval(secs => greatest(1, least(coalesce(p_janela_s, 30), 3600)))
  returning true into v_novo;
  -- Faxina ocasional: chaves de mais de um dia não servem para nada.
  if random() < 0.01 then
    delete from marketplace_avisos where visto_em < now() - interval '1 day';
  end if;
  return coalesce(v_novo, false);
end;
$$;

revoke all on function registrar_aviso_marketplace(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function registrar_aviso_marketplace(uuid, text, integer, integer) to service_role;

NOTIFY pgrst, 'reload schema';

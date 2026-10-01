-- ============================================================
-- 0043 — Pedido do catálogo liga o cliente na hora e duplicidade avisada ao dono (Fase 8.6).
--
-- Antes: o cliente só nascia quando o dono convertia o pedido, e a busca de repetido olhava
-- só o WhatsApp. Agora, no momento em que o pedido chega (gatilho BEFORE INSERT em
-- `pedidos_vitrine`, rodando no servidor, dentro da mesma transação da RPC pública):
--   1. procura cliente da loja com o MESMO WhatsApp (só dígitos, sem 55);
--   2. senão, com o MESMO e-mail (sem diferenciar maiúsculas);
--   3. senão, cria o cliente INATIVO com os dados do pedido (origem 'vitrine'). Se já houver
--      cliente com o mesmo nome, marca `possivel_duplicado_de` para o dono decidir.
-- O comprador não recebe nenhuma dessas informações: a RPC continua devolvendo só número e
-- total. Avisar o visitante que "esse telefone já existe" deixaria qualquer um descobrir
-- quem é cliente da loja (problema de LGPD).
--
-- O volume de cadastros criados fica preso ao mesmo freio da RPC (0027: limite de pedidos
-- pendentes, intervalo e teto diário).
--
-- Também: `mesclar_clientes` para juntar um duplicado no cadastro certo.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

alter table clientes
  add column if not exists origem text not null default 'manual',
  add column if not exists possivel_duplicado_de uuid references clientes(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clientes_origem_check') then
    alter table clientes add constraint clientes_origem_check check (origem in ('manual', 'vitrine', 'pdv', 'marketplace'));
  end if;
end $$;

create index if not exists clientes_email_idx on clientes (user_id, lower(email));

alter table pedidos_vitrine add column if not exists cliente_id uuid references clientes(id) on delete set null;

-- Telefone para comparação: só dígitos, sem o DDI 55 quando sobra um número brasileiro.
create or replace function telefone_normalizado(p text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) in (12, 13)
         and regexp_replace(coalesce(p, ''), '\D', '', 'g') like '55%'
      then substr(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 3)
    else regexp_replace(coalesce(p, ''), '\D', '', 'g')
  end;
$$;

create or replace function vincular_cliente_pedido_vitrine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text := telefone_normalizado(new.cliente_whatsapp);
  v_email text := nullif(lower(trim(coalesce(new.cliente_email, ''))), '');
  v_id uuid;
  v_homonimo uuid;
begin
  if new.cliente_id is not null then
    return new;
  end if;

  if length(v_tel) >= 10 then
    select id into v_id from clientes
     where user_id = new.user_id and telefone_normalizado(whatsapp) = v_tel
     order by (status = 'ativo') desc, criado_em
     limit 1;
  end if;

  if v_id is null and v_email is not null then
    select id into v_id from clientes
     where user_id = new.user_id and lower(email) = v_email
     order by (status = 'ativo') desc, criado_em
     limit 1;
  end if;

  if v_id is null then
    select id into v_homonimo from clientes
     where user_id = new.user_id and lower(trim(nome)) = lower(trim(new.cliente_nome))
     order by criado_em
     limit 1;

    insert into clientes (
      user_id, nome, whatsapp, email, cep, endereco, numero, bairro, cidade, uf,
      observacao, status, origem, possivel_duplicado_de
    ) values (
      new.user_id, left(trim(new.cliente_nome), 200), new.cliente_whatsapp, v_email,
      new.entrega_cep, new.entrega_logradouro, new.entrega_numero, new.entrega_bairro, new.entrega_cidade, new.entrega_uf,
      'Cadastrado automaticamente pelo pedido ' || coalesce(new.numero, '') || ' da vitrine.',
      'inativo', 'vitrine', v_homonimo
    )
    returning id into v_id;
  end if;

  new.cliente_id := v_id;
  return new;
end;
$$;

revoke execute on function vincular_cliente_pedido_vitrine() from public, anon, authenticated;

drop trigger if exists trg_vincular_cliente_pedido_vitrine on pedidos_vitrine;
-- O nome do gatilho começa com "z" para rodar depois do que numera o pedido (ordem alfabética).
drop trigger if exists zz_vincular_cliente_pedido_vitrine on pedidos_vitrine;
create trigger zz_vincular_cliente_pedido_vitrine
before insert on pedidos_vitrine
for each row execute function vincular_cliente_pedido_vitrine();

-- Junta o cadastro `p_remover` no `p_manter`: vendas e pedidos passam para o que fica, os
-- campos vazios do que fica são completados com os do outro, e o duplicado é apagado.
create or replace function mesclar_clientes(p_manter uuid, p_remover uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  r clientes%rowtype;
begin
  if p_manter = p_remover then
    raise exception 'Escolha dois cadastros diferentes.';
  end if;
  select * into r from clientes where id = p_remover and user_id = v_user;
  if not found or not exists (select 1 from clientes where id = p_manter and user_id = v_user) then
    raise exception 'Cliente não encontrado.';
  end if;

  update vendas set cliente_id = p_manter where cliente_id = p_remover and user_id = v_user;
  update pedidos_vitrine set cliente_id = p_manter where cliente_id = p_remover and user_id = v_user;

  update clientes c set
    whatsapp = coalesce(nullif(c.whatsapp, ''), r.whatsapp),
    email = coalesce(nullif(c.email, ''), r.email),
    documento = coalesce(nullif(c.documento, ''), r.documento),
    cep = coalesce(nullif(c.cep, ''), r.cep),
    endereco = coalesce(nullif(c.endereco, ''), r.endereco),
    numero = coalesce(nullif(c.numero, ''), r.numero),
    bairro = coalesce(nullif(c.bairro, ''), r.bairro),
    cidade = coalesce(nullif(c.cidade, ''), r.cidade),
    uf = coalesce(nullif(c.uf, ''), r.uf),
    possivel_duplicado_de = null
  where c.id = p_manter;

  update clientes set possivel_duplicado_de = null where possivel_duplicado_de = p_remover and user_id = v_user;
  delete from clientes where id = p_remover and user_id = v_user;
end;
$$;

grant execute on function mesclar_clientes(uuid, uuid) to authenticated;

NOTIFY pgrst, 'reload schema';

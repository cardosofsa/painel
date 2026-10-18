-- ============================================================
-- 0102 — Ajuste de Preço e Análise do anúncio.
--
-- Por quê: a análise de um anúncio da loja (título, imagens, preço e estratégia) e o Ajuste de
-- Preço precisam de três coisas que o banco não tinha:
--
--   1) tipo de IA 'analise_anuncio' — a narração da análise usa o mesmo cache e a mesma cota
--      dos outros tipos. As três RPCs `ia_*` são cópias das da 0099 com o tipo a mais;
--      assinatura e retorno não mudam, então CREATE OR REPLACE basta.
--   2) `marketplace_precos_historico` — o preço de cada anúncio sincronizado, gravado QUANDO
--      MUDA. Hoje só existe o preço atual; com o histórico, a tela poderá mostrar preço × vendas.
--   3) `vendas_por_anuncio` e `vendas_semanais_por_anuncio` — unidades, receita e pedidos de um
--      produto numa loja, somados NO BANCO (numeric exato; somar no JS só veria o que carregou).
--      Os itens de pedido não guardam o item_id da Shopee: a conta é por produto + loja.
--      `security invoker`: o RLS de pedidos garante que só a própria conta entra.
--
-- Nada é removido nem renomeado; o código no ar continua funcionando antes e depois.
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- 1) Tipo de IA
alter table ia_sugestoes drop constraint if exists ia_sugestoes_tipo_check;
alter table ia_sugestoes add constraint ia_sugestoes_tipo_check check (tipo in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos', 'relatorio', 'consultor', 'concorrentes', 'assistente', 'analise_anuncio'));

-- ia_buscar_sugestao: cópia da 0099; só acrescenta 'analise_anuncio' à lista de tipos.
create or replace function ia_buscar_sugestao(p_tipo text, p_hash text)
returns table (texto text, palavras_chave text[], posicionamento text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre de novo para continuar.';
  end if;
  if not conta_ativa() then
    raise exception 'Sua conta não está ativa. Fale com o administrador.';
  end if;
  if p_tipo not in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos', 'relatorio', 'consultor', 'concorrentes', 'assistente', 'analise_anuncio') then
    raise exception 'Tipo de geração inválido.';
  end if;

  return query
    select s.texto, s.palavras_chave, s.posicionamento
      from ia_sugestoes s
     where s.user_id = v_uid and s.tipo = p_tipo and s.contexto_hash = p_hash;

  if found then
    insert into ia_uso (user_id, dia, cache_hits, atualizado_em)
    values (v_uid, (now() at time zone 'America/Sao_Paulo')::date, 1, now())
    on conflict (user_id, dia) do update
       set cache_hits = ia_uso.cache_hits + 1, atualizado_em = now();
  end if;
end;
$$;

-- ia_consumir: cópia da 0099; só acrescenta 'analise_anuncio' à lista de tipos.
create or replace function ia_consumir(p_tipo text, p_origem text default 'sistema')
returns table (usadas integer, limite integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid            uuid := auth.uid();
  v_hoje           date := (now() at time zone 'America/Sao_Paulo')::date;
  v_perfil         perfis_acesso%rowtype;
  v_usadas         integer;
  v_total_sistema  integer;
  v_teto_propria   constant integer := 300;
begin
  if v_uid is null then
    raise exception 'Sua sessão expirou. Entre de novo para continuar.';
  end if;
  if not conta_ativa() then
    raise exception 'Sua conta não está ativa. Fale com o administrador.';
  end if;
  if p_tipo not in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos', 'relatorio', 'consultor', 'concorrentes', 'assistente', 'analise_anuncio') then
    raise exception 'Tipo de geração inválido.';
  end if;
  if p_origem not in ('sistema', 'propria') then
    raise exception 'Origem de IA inválida.';
  end if;

  -- Trava a linha do perfil: duas gerações simultâneas da mesma conta se enfileiram aqui,
  -- então a última vaga do teste não passa para as duas.
  select * into v_perfil from perfis_acesso where user_id = v_uid for update;
  if not found then
    raise exception 'Conta sem perfil de acesso. Fale com o administrador.';
  end if;

  -- ---- IA própria: só o teto diário de segurança ----
  if p_origem = 'propria' then
    insert into ia_uso (user_id, dia, geracoes, geracoes_propria, titulos, descricoes, atualizado_em)
    values (
      v_uid, v_hoje, 1, 1,
      case when p_tipo = 'titulo' then 1 else 0 end,
      case when p_tipo = 'descricao' then 1 else 0 end,
      now()
    )
    on conflict (user_id, dia) do update
       set geracoes         = ia_uso.geracoes + 1,
           geracoes_propria = ia_uso.geracoes_propria + 1,
           titulos          = ia_uso.titulos + (case when p_tipo = 'titulo' then 1 else 0 end),
           descricoes       = ia_uso.descricoes + (case when p_tipo = 'descricao' then 1 else 0 end),
           atualizado_em    = now()
     where ia_uso.geracoes_propria < v_teto_propria
    returning ia_uso.geracoes_propria into v_usadas;

    if v_usadas is null then
      raise exception 'Você chegou ao limite de segurança de % gerações por dia com a sua IA. O contador volta amanhã.', v_teto_propria;
    end if;
    return query select v_usadas, v_teto_propria;
    return;
  end if;

  -- ---- IA do sistema: teste grátis (master é isento) ----
  if v_perfil.papel <> 'master' then
    if v_perfil.ia_teste_inicio is null then
      update perfis_acesso set ia_teste_inicio = now() where user_id = v_uid;
      v_perfil.ia_teste_inicio := now();
    end if;

    if now() >= v_perfil.ia_teste_inicio + make_interval(days => v_perfil.ia_teste_dias) then
      raise exception 'Seu teste grátis da IA do sistema (% dias) terminou. Cadastre a sua própria IA em Configurações → IA para continuar.', v_perfil.ia_teste_dias;
    end if;

    select coalesce(sum(u.geracoes_sistema), 0) into v_total_sistema from ia_uso u where u.user_id = v_uid;
    if v_total_sistema >= v_perfil.ia_teste_limite then
      raise exception 'Você usou as % gerações do teste grátis da IA do sistema. Cadastre a sua própria IA em Configurações → IA para continuar.', v_perfil.ia_teste_limite;
    end if;
  else
    select coalesce(sum(u.geracoes_sistema), 0) into v_total_sistema from ia_uso u where u.user_id = v_uid;
  end if;

  insert into ia_uso (user_id, dia, geracoes, geracoes_sistema, titulos, descricoes, atualizado_em)
  values (
    v_uid, v_hoje, 1, 1,
    case when p_tipo = 'titulo' then 1 else 0 end,
    case when p_tipo = 'descricao' then 1 else 0 end,
    now()
  )
  on conflict (user_id, dia) do update
     set geracoes         = ia_uso.geracoes + 1,
         geracoes_sistema = ia_uso.geracoes_sistema + 1,
         titulos          = ia_uso.titulos + (case when p_tipo = 'titulo' then 1 else 0 end),
         descricoes       = ia_uso.descricoes + (case when p_tipo = 'descricao' then 1 else 0 end),
         atualizado_em    = now();

  -- limite 0 = sem limite (master).
  return query select v_total_sistema + 1, (case when v_perfil.papel = 'master' then 0 else v_perfil.ia_teste_limite end);
end;
$$;

-- ia_guardar_sugestao: cópia da 0099; só acrescenta 'analise_anuncio' à lista de tipos.
create or replace function ia_guardar_sugestao(
  p_tipo text,
  p_hash text,
  p_texto text,
  p_palavras_chave text[],
  p_posicionamento text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not conta_ativa() then
    raise exception 'Sua sessão expirou. Entre de novo para continuar.';
  end if;
  if p_tipo not in ('titulo', 'descricao', 'tema', 'preco', 'resposta', 'cobranca', 'legenda', 'atributos', 'relatorio', 'consultor', 'concorrentes', 'assistente', 'analise_anuncio') then
    raise exception 'Tipo de geração inválido.';
  end if;

  insert into ia_sugestoes (user_id, tipo, contexto_hash, texto, palavras_chave, posicionamento, criado_em)
  values (v_uid, p_tipo, p_hash, left(p_texto, 6000), coalesce(p_palavras_chave, '{}'), left(p_posicionamento, 500), now())
  on conflict (user_id, tipo, contexto_hash) do update
     set texto          = excluded.texto,
         palavras_chave = excluded.palavras_chave,
         posicionamento = excluded.posicionamento,
         criado_em      = now();

  if random() < 0.02 then
    delete from ia_sugestoes where user_id = v_uid and criado_em < now() - interval '60 days';
  end if;
end;
$$;

-- 2) Histórico de preço dos anúncios sincronizados
create table if not exists marketplace_precos_historico (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  anuncio_id  uuid not null references marketplace_anuncios(id) on delete cascade,
  preco       numeric(12,2) not null check (preco > 0),
  lido_em     timestamptz not null default now()
);
create index if not exists marketplace_precos_historico_idx on marketplace_precos_historico (anuncio_id, lido_em desc);
create index if not exists marketplace_precos_historico_user_idx on marketplace_precos_historico (user_id);

alter table marketplace_precos_historico enable row level security;
drop policy if exists "dono_marketplace_precos_historico" on marketplace_precos_historico;
create policy "dono_marketplace_precos_historico" on marketplace_precos_historico for all
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop trigger if exists trg_valida_vinculo_preco_hist_anuncio on marketplace_precos_historico;
create trigger trg_valida_vinculo_preco_hist_anuncio
before insert or update of anuncio_id on marketplace_precos_historico
for each row execute function validar_vinculo_do_dono('anuncio_id', 'marketplace_anuncios');

-- 3) Vendas de um produto numa loja (pedidos da plataforma pagos, sem cancelado/devolvido)
create or replace function vendas_por_anuncio(p_loja uuid, p_produto uuid, p_dias int)
returns table (unidades bigint, receita numeric, pedidos bigint, preco_medio numeric)
language sql
security invoker
stable
set search_path = public
as $$
  select
    coalesce(sum(i.quantidade), 0)::bigint,
    coalesce(sum(i.quantidade * i.preco_unitario), 0)::numeric,
    count(distinct p.id)::bigint,
    case when coalesce(sum(i.quantidade), 0) > 0 then round(sum(i.quantidade * i.preco_unitario) / sum(i.quantidade), 2) else 0 end
  from pedidos_marketplace p
  join pedidos_marketplace_itens i on i.pedido_id = p.id
  where p.user_id = auth.uid()
    and p.loja_id = p_loja
    and i.produto_id = p_produto
    and p.status not in ('nao_pago', 'cancelado', 'devolvido')
    and coalesce(p.pago_em, p.criado_em_plataforma) >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 366)));
$$;

create or replace function vendas_semanais_por_anuncio(p_loja uuid, p_produto uuid, p_semanas int)
returns table (semana date, unidades bigint)
language sql
security invoker
stable
set search_path = public
as $$
  select
    date_trunc('week', coalesce(p.pago_em, p.criado_em_plataforma) at time zone 'America/Sao_Paulo')::date,
    sum(i.quantidade)::bigint
  from pedidos_marketplace p
  join pedidos_marketplace_itens i on i.pedido_id = p.id
  where p.user_id = auth.uid()
    and p.loja_id = p_loja
    and i.produto_id = p_produto
    and p.status not in ('nao_pago', 'cancelado', 'devolvido')
    and coalesce(p.pago_em, p.criado_em_plataforma) >= now() - make_interval(weeks => greatest(1, least(coalesce(p_semanas, 12), 52)))
  group by 1
  order by 1;
$$;

-- Padrão da 0077: fora de PUBLIC e anon, grant explícito a quem está logado.
revoke all on function vendas_por_anuncio(uuid, uuid, int) from public, anon;
revoke all on function vendas_semanais_por_anuncio(uuid, uuid, int) from public, anon;
grant execute on function vendas_por_anuncio(uuid, uuid, int) to authenticated;
grant execute on function vendas_semanais_por_anuncio(uuid, uuid, int) to authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- 0033 — Preço de atacado, catálogo varejo/atacado, "Consultar", endereço no pedido.
--
-- 1) produtos.preco_atacado (null = "A consultar" no catálogo de atacado).
-- 2) catalogos.tipo_preco ('varejo' | 'atacado').
-- 3) Preço efetivo no catálogo: override do catálogo, senão o preço do tipo do catálogo.
--    Preço nulo OU zero = "Consultar": o produto aparece, mas NÃO pode ser pedido.
-- 4) obter_catalogo_publico devolve também a ordem de popularidade (posição, nunca
--    quantidade — o número de vendas do negócio não é público) e o tipo do catálogo.
-- 5) criar_pedido_vitrine aceita e-mail e endereço de entrega (opcionais) e recusa item
--    "Consultar" (substitui a trava de preço zero da 0031).
-- 6) Remove sobrecargas antigas. `create or replace` com parâmetros NOVOS não substitui a
--    função: cria uma segunda, e a antiga continua chamável (e sem as travas novas). Foi o
--    que aconteceu com registrar_venda entre a 0029 e a 0030.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

-- ------------------------------------------------------------
-- 1) e 2) Colunas
-- ------------------------------------------------------------
alter table produtos
  add column if not exists preco_atacado numeric
    check (preco_atacado is null or preco_atacado >= 0);

alter table catalogos
  add column if not exists tipo_preco text not null default 'varejo';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'catalogos_tipo_preco_check'
  ) then
    alter table catalogos
      add constraint catalogos_tipo_preco_check check (tipo_preco in ('varejo', 'atacado'));
  end if;
end $$;

-- Dados do comprador que o cliente da vitrine informa (todos opcionais). `numero` já é o
-- número do pedido, por isso `entrega_numero`.
alter table pedidos_vitrine
  add column if not exists cliente_email     text,
  add column if not exists entrega_cep        text,
  add column if not exists entrega_logradouro text,
  add column if not exists entrega_numero     text,
  add column if not exists entrega_bairro     text,
  add column if not exists entrega_cidade     text,
  add column if not exists entrega_uf         text;

-- ------------------------------------------------------------
-- 6) Sobrecargas antigas (antes de recriar as novas)
-- ------------------------------------------------------------
drop function if exists registrar_venda(jsonb, text, uuid, uuid, text, numeric, numeric, text, date);
drop function if exists criar_pedido_vitrine(text, jsonb, text, text, text, uuid);
drop function if exists obter_catalogo_publico(text);

-- ------------------------------------------------------------
-- 4) obter_catalogo_publico
--    A lista de colunas mudou, então o DROP acima é obrigatório (armadilha da 0016/0017).
-- ------------------------------------------------------------
create or replace function obter_catalogo_publico(p_slug text)
returns table (
  catalogo_nome text,
  produto_id uuid,
  produto_nome text,
  grupo_id uuid,
  grupo_nome text,
  variante_nome text,
  descricao text,
  imagem_url text,
  categoria_nome text,
  preco numeric,
  imagens_extra text[],
  negocio_whatsapp text,
  ordem_popularidade integer,
  catalogo_tipo_preco text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogo record;
  v_whatsapp text;
begin
  select c.id, c.user_id, c.nome, c.tipo_preco
    into v_catalogo
    from catalogos c
   where c.slug = p_slug and c.ativo = true;

  if not found then
    return;
  end if;

  -- Conta pendente, suspensa ou vencida: a vitrine responde como se o link não existisse.
  if not conta_ativa_de(v_catalogo.user_id) then
    return;
  end if;

  select pn.whatsapp into v_whatsapp from perfil_negocio pn where pn.user_id = v_catalogo.user_id;

  return query
  with vendidos as (
    select vi.produto_id as pid, sum(vi.quantidade) as qtd
      from venda_itens vi
      join vendas vd on vd.id = vi.venda_id
     where vd.user_id = v_catalogo.user_id
       and vd.status <> 'cancelada'
       and vd.data_venda >= now() - interval '90 days'
     group by vi.produto_id
  )
  select
    v_catalogo.nome,
    p.id,
    coalesce(g.nome, p.nome),
    p.grupo_id,
    g.nome,
    p.variante_nome,
    coalesce(p.descricao, g.descricao),
    coalesce(p.imagem_url, g.imagem_url),
    c.nome,
    -- Preço efetivo. null (ou 0) = "Consultar".
    nullif(
      coalesce(cp.preco, case when v_catalogo.tipo_preco = 'atacado' then p.preco_atacado else p.preco_venda end),
      0
    ),
    coalesce(
      (select array_agg(pi.url order by pi.ordem) from produto_imagens pi where pi.produto_id = p.id),
      array[]::text[]
    ),
    v_whatsapp,
    -- Posição (1 = mais vendido nos últimos 90 dias), nunca a quantidade.
    case
      when p.id is null then null
      else (row_number() over (order by coalesce(vs.qtd, 0) desc, coalesce(g.nome, p.nome), p.variante_nome nulls first))::integer
    end,
    v_catalogo.tipo_preco
  from (select 1) as catalogo_encontrado
  left join produtos p on p.user_id = v_catalogo.user_id and p.ativo = true and p.estoque > 0
  left join produto_grupos g on g.id = p.grupo_id
  left join categorias c on c.id = coalesce(p.categoria_id, g.categoria_id)
  left join catalogo_precos cp on cp.catalogo_id = v_catalogo.id and cp.produto_id = p.id
  left join vendidos vs on vs.pid = p.id
  order by c.nome nulls last, coalesce(g.nome, p.nome), p.variante_nome nulls first
  limit 500;
end;
$$;

grant execute on function obter_catalogo_publico(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 5) criar_pedido_vitrine — a superfície anônima.
--    Igual à 0031, com: preço efetivo por tipo de catálogo, recusa de "Consultar", e e-mail
--    e endereço opcionais. Toda validação mora aqui (a rota do Next é só conveniência).
-- ------------------------------------------------------------
create or replace function criar_pedido_vitrine(
  p_slug         text,
  p_itens        jsonb,
  p_nome         text,
  p_whatsapp     text,
  p_observacao   text,
  p_idempotencia uuid,
  p_email        text default null,
  p_cep          text default null,
  p_logradouro   text default null,
  p_numero       text default null,
  p_bairro       text default null,
  p_cidade       text default null,
  p_uf           text default null
)
returns table (numero text, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat          record;
  v_nome         text := btrim(coalesce(p_nome, ''));
  v_zap          text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_obs          text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_email        text := nullif(btrim(coalesce(p_email, '')), '');
  v_cep          text := nullif(regexp_replace(coalesce(p_cep, ''), '\D', '', 'g'), '');
  v_logradouro   text := nullif(btrim(coalesce(p_logradouro, '')), '');
  v_end_numero   text := nullif(btrim(coalesce(p_numero, '')), '');
  v_bairro       text := nullif(btrim(coalesce(p_bairro, '')), '');
  v_cidade       text := nullif(btrim(coalesce(p_cidade, '')), '');
  v_uf           text := nullif(upper(btrim(coalesce(p_uf, ''))), '');
  v_qtd_itens    integer;
  v_resolvidos   integer;
  v_precificados integer;
  v_pedido_id    uuid;
  v_total        numeric(12,2);
  v_numero       text;
  v_pendentes    integer;
  v_cota         integer;
  MAX_PENDENTES constant integer := 100;
  MAX_DIA       constant integer := 300;
  INTERVALO     constant interval := interval '10 seconds';
begin
  -- 4.1 Catálogo. Mensagem ÚNICA para slug inexistente, catálogo desligado e conta inativa.
  select c.id, c.user_id, c.nome, c.tipo_preco
    into v_cat
    from catalogos c
   where c.slug = p_slug and c.ativo = true;

  if not found or not conta_ativa_de(v_cat.user_id) then
    raise exception 'Este catálogo não está disponível.';
  end if;

  -- 4.2 Idempotência: mesmo envio duas vezes devolve o mesmo pedido.
  select p.numero, p.total into v_numero, v_total
    from pedidos_vitrine p
   where p.catalogo_id = v_cat.id and p.idempotencia = p_idempotencia;
  if found then
    return query select v_numero, v_total;
    return;
  end if;

  -- 4.3 Entrada
  if v_nome = '' or length(v_nome) > 120 then
    raise exception 'Informe seu nome (até 120 caracteres).';
  end if;
  if v_zap !~ '^\d{10,15}$' then
    raise exception 'Informe um WhatsApp válido com DDD.';
  end if;
  if v_obs is not null and length(v_obs) > 500 then
    raise exception 'A observação está longa demais.';
  end if;
  if v_email is not null and (length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Informe um e-mail válido ou deixe em branco.';
  end if;
  if v_cep is not null and v_cep !~ '^\d{8}$' then
    raise exception 'CEP inválido.';
  end if;
  if v_uf is not null and v_uf !~ '^[A-Z]{2}$' then
    raise exception 'UF inválida.';
  end if;
  if length(coalesce(v_logradouro, '')) > 120 or length(coalesce(v_end_numero, '')) > 20
     or length(coalesce(v_bairro, '')) > 120 or length(coalesce(v_cidade, '')) > 120 then
    raise exception 'Algum campo do endereço está longo demais.';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'O carrinho está vazio.';
  end if;
  if jsonb_array_length(p_itens) > 50 then
    raise exception 'No máximo 50 produtos diferentes por pedido.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_itens) i
    where (i->>'quantidade')::integer not between 1 and 99
  ) then
    raise exception 'Quantidade inválida em algum item.';
  end if;

  -- 4.4 Teto de backlog e de frequência, antes de escrever qualquer coisa.
  select count(*) into v_pendentes
    from pedidos_vitrine p
   where p.catalogo_id = v_cat.id and p.status = 'pendente';

  if v_pendentes >= MAX_PENDENTES then
    raise exception 'Este catálogo está com muitos pedidos em aberto. Fale direto pelo WhatsApp.';
  end if;

  insert into pedidos_vitrine_cota (catalogo_id, dia, no_dia, ultimo_em)
  values (v_cat.id, (now() at time zone 'America/Sao_Paulo')::date, 1, now())
  on conflict (catalogo_id) do update
     set no_dia = case
                    when pedidos_vitrine_cota.dia < (now() at time zone 'America/Sao_Paulo')::date then 1
                    else pedidos_vitrine_cota.no_dia + 1
                  end,
         dia = (now() at time zone 'America/Sao_Paulo')::date,
         ultimo_em = now()
   where pedidos_vitrine_cota.ultimo_em < now() - INTERVALO
     and (pedidos_vitrine_cota.dia < (now() at time zone 'America/Sao_Paulo')::date
          or pedidos_vitrine_cota.no_dia < MAX_DIA)
  returning pedidos_vitrine_cota.no_dia into v_cota;

  if v_cota is null then
    raise exception 'Muitos pedidos deste catálogo agora há pouco. Tente de novo em instantes ou fale pelo WhatsApp.';
  end if;

  -- 4.5 Confere que TODO produto pedido é elegível NESTE catálogo.
  select count(distinct (i->>'produto_id')::uuid) into v_qtd_itens
    from jsonb_array_elements(p_itens) i;

  select count(*) into v_resolvidos
    from produtos p
   where p.user_id = v_cat.user_id
     and p.ativo = true
     and p.estoque > 0
     and p.id in (select distinct (i->>'produto_id')::uuid from jsonb_array_elements(p_itens) i);

  if v_resolvidos <> v_qtd_itens then
    raise exception 'Um ou mais produtos saíram do catálogo. Atualize a página e tente de novo.';
  end if;

  -- 4.5b Todo produto pedido precisa ter preço (> 0) neste tipo de catálogo. "Consultar" é
  -- para o cliente falar com a loja, não para virar pedido de R$ 0,00.
  select count(*) into v_precificados
    from produtos p
    left join catalogo_precos cp on cp.catalogo_id = v_cat.id and cp.produto_id = p.id
   where p.user_id = v_cat.user_id
     and p.id in (select distinct (i->>'produto_id')::uuid from jsonb_array_elements(p_itens) i)
     and coalesce(cp.preco, case when v_cat.tipo_preco = 'atacado' then p.preco_atacado else p.preco_venda end) > 0;

  if v_precificados <> v_qtd_itens then
    raise exception 'Um ou mais produtos estão sem preço (Consultar). Fale com a loja pelo WhatsApp.';
  end if;

  -- 4.6 Grava. O preço é SEMPRE recalculado aqui, nunca vem do navegador.
  insert into pedidos_vitrine (user_id, catalogo_id, cliente_nome, cliente_whatsapp,
                               observacao, total, idempotencia, numero,
                               cliente_email, entrega_cep, entrega_logradouro, entrega_numero,
                               entrega_bairro, entrega_cidade, entrega_uf)
  values (v_cat.user_id, v_cat.id, v_nome, v_zap, v_obs, 0, p_idempotencia, '',
          v_email, v_cep, v_logradouro, v_end_numero, v_bairro, v_cidade, v_uf)
  returning id into v_pedido_id;

  insert into pedidos_vitrine_itens (pedido_id, produto_id, produto_nome, quantidade, preco_unitario)
  select v_pedido_id,
         p.id,
         coalesce(g.nome, p.nome) || coalesce(' — ' || p.variante_nome, ''),
         agg.qtd,
         coalesce(cp.preco, case when v_cat.tipo_preco = 'atacado' then p.preco_atacado else p.preco_venda end)
    from (
      select (i->>'produto_id')::uuid as produto_id,
             sum((i->>'quantidade')::integer) as qtd
        from jsonb_array_elements(p_itens) i
       group by 1
    ) agg
    join produtos p on p.id = agg.produto_id and p.user_id = v_cat.user_id
    left join produto_grupos g on g.id = p.grupo_id
    left join catalogo_precos cp on cp.catalogo_id = v_cat.id and cp.produto_id = p.id;

  update pedidos_vitrine
     set total = (select sum(quantidade * preco_unitario) from pedidos_vitrine_itens where pedido_id = v_pedido_id)
   where id = v_pedido_id
  returning pedidos_vitrine.numero, pedidos_vitrine.total into v_numero, v_total;

  -- 4.7 Devolve o MÍNIMO (nada de user_id, catalogo_id ou id).
  return query select v_numero, v_total;
end;
$$;

revoke execute on function criar_pedido_vitrine(text, jsonb, text, text, text, uuid, text, text, text, text, text, text, text) from public;
grant execute on function criar_pedido_vitrine(text, jsonb, text, text, text, uuid, text, text, text, text, text, text, text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';

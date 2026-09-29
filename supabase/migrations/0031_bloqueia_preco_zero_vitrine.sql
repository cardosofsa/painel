-- ============================================================
-- Bloqueia pedido/venda de produto com preço zerado na vitrine.
--
-- `produtos.preco_venda` é `numeric not null default 0` (0001_init.sql:72) — um produto
-- cadastrado sem preço vem com 0, não com null. A vitrine pública nunca distinguiu isso de
-- "grátis de propósito": o item aparecia normal, ia pro carrinho e virava pedido de
-- R$ 0,00. `app/vitrine/[slug]/page.tsx` ganhou o filtro do lado da tela (`preco > 0`),
-- mas `criar_pedido_vitrine` é a "superfície anônima" — qualquer um pode chamá-la direto
-- pelo console, sem passar pela tela — então o bloqueio de verdade precisa estar aqui.
-- ============================================================

create or replace function criar_pedido_vitrine(
  p_slug         text,
  p_itens        jsonb,
  p_nome         text,
  p_whatsapp     text,
  p_observacao   text,
  p_idempotencia uuid
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
  -- 4.1 Catálogo. Mensagem ÚNICA para slug inexistente, catálogo desligado e conta
  -- inativa: `obter_catalogo_publico` esconde a diferença de propósito (0026:91-100), e
  -- diferenciar aqui transformaria a RPC num detector de "este slug existe".
  select c.id, c.user_id, c.nome
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

  -- Atômico, no padrão de `ia_consumir` (0024:186-200): o `where` do DO UPDATE é a trava,
  -- e a linha serializa os concorrentes. Um `count` numa janela não seria atômico.
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

  -- Nada voltou = o `where` do DO UPDATE barrou: ou veio rápido demais, ou o teto do dia
  -- estourou. Uma mensagem só para os dois, porque distinguir não ajuda quem está
  -- comprando e ajuda quem está abusando.
  if v_cota is null then
    raise exception 'Muitos pedidos deste catálogo agora há pouco. Tente de novo em instantes ou fale pelo WhatsApp.';
  end if;

  -- 4.5 Confere que TODO produto pedido é elegível NESTE catálogo.
  -- As quatro condições são as mesmas da leitura pública (0026:122). A contagem é o
  -- padrão de `registrar_venda` (0018:313-325): produto de outro dono sai do join em
  -- silêncio, e comparar o total é o que fecha esse buraco.
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

  -- 4.5b Confere que TODO produto pedido tem preço configurado (> 0) — mesmo cálculo da
  -- leitura pública (`coalesce(cp.preco, p.preco_venda)`, 0026:115), pra pegar exatamente
  -- os mesmos casos que a vitrine já esconde. Mensagem igual à de cima de propósito: não
  -- é útil pro cliente final saber SE é "saiu do catálogo" ou "preço não configurado" — as
  -- duas dizem "fale com a loja".
  select count(*) into v_precificados
    from produtos p
    left join catalogo_precos cp on cp.catalogo_id = v_cat.id and cp.produto_id = p.id
   where p.user_id = v_cat.user_id
     and p.id in (select distinct (i->>'produto_id')::uuid from jsonb_array_elements(p_itens) i)
     and coalesce(cp.preco, p.preco_venda) > 0;

  if v_precificados <> v_qtd_itens then
    raise exception 'Um ou mais produtos saíram do catálogo. Atualize a página e tente de novo.';
  end if;

  -- 4.6 Grava. O preço é SEMPRE recalculado aqui, nunca vem do navegador.
  insert into pedidos_vitrine (user_id, catalogo_id, cliente_nome, cliente_whatsapp,
                               observacao, total, idempotencia, numero)
  values (v_cat.user_id, v_cat.id, v_nome, v_zap, v_obs, 0, p_idempotencia, '')
  returning id into v_pedido_id;

  insert into pedidos_vitrine_itens (pedido_id, produto_id, produto_nome, quantidade, preco_unitario)
  select v_pedido_id,
         p.id,
         coalesce(g.nome, p.nome) || coalesce(' — ' || p.variante_nome, ''),
         agg.qtd,
         coalesce(cp.preco, p.preco_venda)
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

  -- 4.7 Devolve o MÍNIMO. Nada de `user_id`, `catalogo_id` ou `id`: `conta_ativa_de(uuid)`
  -- tem grant para anon (0026:56), então entregar o uuid do dono criaria um oráculo de
  -- status de conta. E um `pedido_id` convidaria um segundo endpoint de leitura anônima.
  return query select v_numero, v_total;
end;
$$;

NOTIFY pgrst, 'reload schema';

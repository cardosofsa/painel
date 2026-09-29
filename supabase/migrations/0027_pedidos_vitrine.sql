-- ============================================================
-- 0027 — Pedido vindo da vitrine pública
--
-- Esta é a **primeira escrita anônima do sistema**. Até aqui o papel `anon` só lia:
-- duas funções `security definer` com grant (`obter_catalogo_publico`, `conta_ativa_de`)
-- e dois buckets públicos de imagem. Nenhuma tabela aceitava INSERT sem sessão.
--
-- Por isso o corpo da RPC abaixo **é a única fronteira de segurança deste caminho**. Ela
-- é `security definer` e, aplicada pelo SQL Editor, roda como `postgres`, que tem
-- `bypassrls`: dentro dela o RLS de `produtos` simplesmente não existe. Três consequências
-- que valem mais que o resto desta migração:
--
--   1. Todo `join` em `produtos` carrega `user_id = dono do catálogo`. Sem isso, um
--      visitante com o slug do catálogo A manda `produto_id` de B — que circula
--      publicamente, porque `obter_catalogo_publico` devolve `produto_id` — e o dono de A
--      passa a ver nome e preço dos produtos de B no painel dele. Vazamento entre contas.
--   2. **Nada de SQL dinâmico** (`execute format`) com parâmetro da função. A entrada vem
--      de um desconhecido.
--   3. O trigger `validar_vinculo_do_dono` da 0026 **não serve aqui** e por isso
--      `pedidos_vitrine_itens` ficou fora da lista dele. A premissa dele, escrita em
--      `0026:229-231`, é "a função é `security invoker`, então o SELECT passa pelo RLS".
--      Chamado de dentro de uma `security definer`, ele bypassa o RLS e aprova qualquer
--      UUID do banco — daria falsa sensação de trava.
--
-- Idempotente. Termina com NOTIFY.
-- ============================================================

do $$
begin
  if to_regclass('public.catalogos') is null then
    raise exception 'Aplique 0014_catalogos.sql antes desta.';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'conta_ativa_de'
  ) then
    raise exception 'Aplique 0026_endurecimento_storage_vitrine_fks.sql antes desta.';
  end if;
end $$;

-- ============================================================
-- 1) Tabelas
-- ============================================================

create table if not exists pedidos_vitrine (
  id             uuid primary key default gen_random_uuid(),
  -- Sem `default auth.uid()`: no caminho anônimo ele seria NULL. A RPC passa explícito, e
  -- o `not null` é o que pega o erro se algum dia alguém esquecer.
  user_id        uuid not null references auth.users on delete cascade,
  catalogo_id    uuid not null references catalogos(id) on delete cascade,
  numero         text not null,
  cliente_nome   text not null check (length(cliente_nome) between 1 and 120),
  cliente_whatsapp text not null check (cliente_whatsapp ~ '^\d{10,15}$'),
  observacao     text check (observacao is null or length(observacao) <= 500),
  total          numeric(12,2) not null check (total >= 0),
  status         text not null default 'pendente'
                 check (status in ('pendente', 'aceito', 'recusado', 'convertido')),
  -- Gerada no navegador. Duplo-toque em "Finalizar" ou retry de rede devolve o mesmo
  -- pedido em vez de criar outro.
  idempotencia   uuid not null,
  venda_id       uuid references vendas(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (user_id, numero),
  unique (catalogo_id, idempotencia)
);

create table if not exists pedidos_vitrine_itens (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null references pedidos_vitrine(id) on delete cascade,
  -- `set null`, não `cascade`: o pedido é um DOCUMENTO. Se o dono apagar o produto, o
  -- pedido não pode perder linhas em silêncio. Mesmo argumento de `0018:29-32` sobre o
  -- histórico de venda não mudar quando o custo muda.
  produto_id    uuid references produtos(id) on delete set null,
  -- Instantâneo do que a pessoa pediu, no momento em que pediu.
  produto_nome  text not null,
  quantidade    integer not null check (quantidade between 1 and 99),
  preco_unitario numeric(12,2) not null check (preco_unitario >= 0)
);

-- Contador de abuso. Sem RLS exposta e sem grant: só a RPC `security definer` escreve.
create table if not exists pedidos_vitrine_cota (
  catalogo_id uuid primary key references catalogos(id) on delete cascade,
  dia         date not null default (now() at time zone 'America/Sao_Paulo')::date,
  no_dia      integer not null default 0,
  ultimo_em   timestamptz not null default now()
);

create index if not exists pedidos_vitrine_user_status_idx on pedidos_vitrine (user_id, status);
-- Índice parcial: o contador da sidebar roda em toda navegação do painel.
create index if not exists pedidos_vitrine_pendentes_idx on pedidos_vitrine (user_id) where status = 'pendente';
create index if not exists pedidos_vitrine_catalogo_idx on pedidos_vitrine (catalogo_id);
create index if not exists pedidos_vitrine_itens_pedido_idx on pedidos_vitrine_itens (pedido_id);

-- ============================================================
-- 2) RLS — só o dono, e com DELETE.
--
-- `for all` com `with check`, não só SELECT/UPDATE. O `with check` é obrigatório: sem ele
-- um UPDATE consegue reatribuir o `user_id` da linha para outra conta. E o DELETE é o que
-- permite ao dono limpar pedido falso em lote — sem ele, quem sofrer spam fica com lixo
-- permanente e um contador que nunca zera.
-- ============================================================

alter table pedidos_vitrine enable row level security;
alter table pedidos_vitrine_itens enable row level security;
alter table pedidos_vitrine_cota enable row level security;

drop policy if exists own_rows_pedidos_vitrine on pedidos_vitrine;
create policy own_rows_pedidos_vitrine on pedidos_vitrine
  for all to authenticated
  using (auth.uid() = user_id and conta_ativa())
  with check (auth.uid() = user_id and conta_ativa());

drop policy if exists own_rows_pedidos_vitrine_itens on pedidos_vitrine_itens;
create policy own_rows_pedidos_vitrine_itens on pedidos_vitrine_itens
  for all to authenticated
  using (exists (select 1 from pedidos_vitrine p where p.id = pedido_id and p.user_id = auth.uid()))
  with check (exists (select 1 from pedidos_vitrine p where p.id = pedido_id and p.user_id = auth.uid()));

-- `pedidos_vitrine_cota` fica sem policy nenhuma de propósito: ninguém a lê pelo PostgREST.

-- ============================================================
-- 3) Numeração — mesmo padrão de `gerar_numero_venda` (0018:202) e
--    `gerar_numero_pedido` (0021:456): advisory lock por usuário.
-- ============================================================

create or replace function gerar_numero_pedido_vitrine()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  n integer;
begin
  if new.numero is not null and new.numero <> '' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text), hashtext('pedidos_vitrine'));

  select coalesce(max(substring(numero from '\d+')::integer), 0) + 1
    into n
    from pedidos_vitrine
   where user_id = new.user_id and numero ~ '^P-\d+$';

  new.numero := 'P-' || lpad(n::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_gerar_numero_pedido_vitrine on pedidos_vitrine;
create trigger trg_gerar_numero_pedido_vitrine
before insert on pedidos_vitrine
for each row execute function gerar_numero_pedido_vitrine();

-- ============================================================
-- 4) criar_pedido_vitrine — a superfície anônima.
--
-- Limites espelhados em `lib/vitrine-pedido.ts` (MAX_ITENS, MAX_QTD, MAX_NOME,
-- MAX_OBSERVACAO). Mudar um lá sem mudar aqui faz o cliente ver "pedido enviado" e o
-- banco recusar.
--
-- Sobre o teto de abuso: NÃO é uma janela de tempo por catálogo. Uma janela transformaria
-- "encher a caixa de entrada do dono" em "derrubar os pedidos dos clientes reais dele" —
-- o atacante queima a cota em 30 segundos e ninguém mais consegue pedir até virar o dia.
-- O que limita de verdade é o BACKLOG: no máximo N pedidos PENDENTES por catálogo. Isso
-- limita armazenamento, se auto-cura (o dono processa e abre espaço) e nunca incomoda um
-- catálogo que está vendendo bem. Junto vão um intervalo mínimo, que mata o laço ingênuo,
-- e um teto diário folgado como rede.
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
  v_cat        record;
  v_nome       text := btrim(coalesce(p_nome, ''));
  v_zap        text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_obs        text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_qtd_itens  integer;
  v_resolvidos integer;
  v_pedido_id  uuid;
  v_total      numeric(12,2);
  v_numero     text;
  v_pendentes  integer;
  v_cota       integer;
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

-- O Postgres concede EXECUTE a PUBLIC em toda função nova, e `anon` é membro de PUBLIC.
-- O revoke explícito é o que torna o grant abaixo uma decisão, e não um efeito colateral.
revoke execute on function criar_pedido_vitrine(text, jsonb, text, text, text, uuid) from public;
-- `authenticated` junto: o próprio dono, logado, abrindo a vitrine dele manda o cookie de
-- sessão — só `anon` daria "permission denied" no primeiro teste que ele fizesse.
grant execute on function criar_pedido_vitrine(text, jsonb, text, text, text, uuid) to anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- CONFERÊNCIA — rode depois de aplicar, com um slug real no lugar de 'SEU-SLUG'.
-- O vitest não alcança nada disto: ele roda sem banco e cobre só `lib/**`.
--
-- (a) Dono e privilégio da função. Espera-se `postgres` e `prosecdef = true`:
--     select proname, pg_get_userbyid(proowner) as dono, prosecdef
--       from pg_proc where proname = 'criar_pedido_vitrine';
--
-- (b) Produto de OUTRO inquilino é recusado, e nada fica gravado:
--     select * from criar_pedido_vitrine('SEU-SLUG',
--       '[{"produto_id":"<uuid de outra conta>","quantidade":1}]'::jsonb,
--       'Teste', '11999998888', null, gen_random_uuid());
--     -- espera-se: exception "Um ou mais produtos saíram do catálogo"
--
-- (c) Preço do navegador é ignorado — mande 0.01 e confira o preço gravado:
--     select * from criar_pedido_vitrine('SEU-SLUG',
--       '[{"produto_id":"<uuid seu>","quantidade":1,"preco":0.01}]'::jsonb,
--       'Teste', '11999998888', null, gen_random_uuid());
--     select preco_unitario from pedidos_vitrine_itens order by id desc limit 1;
--
-- (d) Idempotência: rode a mesma chamada duas vezes com o MESMO uuid e confira que
--     `select count(*) from pedidos_vitrine` não subiu na segunda.
--
-- (e) Catálogo desligado e conta suspensa dão a MESMA mensagem de slug inexistente:
--     update catalogos set ativo = false where slug = 'SEU-SLUG';
--     -- repita (c): espera-se "Este catálogo não está disponível."
--     update catalogos set ativo = true where slug = 'SEU-SLUG';
--
-- (f) O definer não afrouxou nada de lado. Como `anon`, isto tem que voltar 0:
--     set local role anon;  select count(*) from produtos;  reset role;
-- ============================================================

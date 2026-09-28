-- ============================================================
-- 0026 — Endurecimento: Storage, vitrine de conta suspensa e FK entre inquilinos
--
-- Sai de uma auditoria do sistema inteiro. O isolamento entre contas estava correto
-- (nenhum caminho lê dado alheio); o que faltava eram três coisas que o RLS por `user_id`
-- não alcança:
--
--   1. O Storage não tinha limite NENHUM no servidor. Tipo e tamanho eram conferidos só em
--      `lib/hooks/useSupabaseUpload.ts`, que é "use client" e sobe direto do navegador para
--      o Supabase — dá para ignorar a checagem inteira pelo console e hospedar arquivo
--      arbitrário num bucket público, no domínio do projeto, com o dono pagando o egress.
--   2. `obter_catalogo_publico` é `security definer` e não olhava o status da conta, então
--      suspender alguém no /admin tirava o painel mas deixava a vitrine dela no ar.
--   3. A 0021 impediu apontar `conta_id` para a conta bancária de outro inquilino, mas não
--      generalizou: ~15 outras colunas de FK continuavam aceitando UUID alheio.
--
-- Idempotente (o SQL Editor do Supabase não abre transação).
-- ============================================================

do $$
begin
  if to_regclass('public.perfis_acesso') is null then
    raise exception 'Aplique a migração 0020_perfis_acesso_admin.sql antes desta.';
  end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'conta_ativa'
  ) then
    raise exception 'Aplique a migração 0021_seguranca_acesso.sql antes desta.';
  end if;
end $$;

-- ============================================================
-- 1) conta_ativa_de(uuid): o mesmo teste da conta_ativa(), mas para um dono informado.
--
-- A `conta_ativa()` da 0021 pergunta pelo `auth.uid()`, o que não serve para a vitrine:
-- lá o visitante é anônimo e quem precisa estar em dia é o DONO do catálogo. Mesmos
-- motivos de `security definer` + `stable` da original.
-- ============================================================

create or replace function conta_ativa_de(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from perfis_acesso
    where user_id = p_user_id
      and status = 'ativo'
      and (expira_em is null or expira_em >= current_date)
  );
$$;

grant execute on function conta_ativa_de(uuid) to anon, authenticated;

-- ============================================================
-- 2) A vitrine passa a respeitar a suspensão.
--
-- Lista de colunas do RETURNS TABLE inalterada, então `create or replace` basta (trocar a
-- lista exigiria DROP antes — foi essa armadilha que derrubou a vitrine na 0016/0017).
-- ============================================================

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
  negocio_whatsapp text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogo record;
  v_whatsapp text;
begin
  select id, user_id, nome into v_catalogo
  from catalogos where slug = p_slug and ativo = true;

  if not found then
    return;
  end if;

  -- Conta pendente, suspensa ou vencida: a vitrine responde como se o link não existisse.
  -- Sem isto, suspender no /admin derrubava só o painel — o link do WhatsApp continuava
  -- servindo produtos, preços e o telefone do negócio.
  if not conta_ativa_de(v_catalogo.user_id) then
    return;
  end if;

  select whatsapp into v_whatsapp from perfil_negocio where user_id = v_catalogo.user_id;

  return query
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
    coalesce(cp.preco, p.preco_venda),
    coalesce(
      (select array_agg(pi.url order by pi.ordem) from produto_imagens pi where pi.produto_id = p.id),
      array[]::text[]
    ),
    v_whatsapp
  from (select 1) as catalogo_encontrado
  left join produtos p on p.user_id = v_catalogo.user_id and p.ativo = true and p.estoque > 0
  left join produto_grupos g on g.id = p.grupo_id
  left join categorias c on c.id = coalesce(p.categoria_id, g.categoria_id)
  left join catalogo_precos cp on cp.catalogo_id = v_catalogo.id and cp.produto_id = p.id
  order by c.nome nulls last, coalesce(g.nome, p.nome), p.variante_nome nulls first
  limit 500;
end;
$$;

grant execute on function obter_catalogo_publico(text) to anon, authenticated;

-- ============================================================
-- 3) Storage: limite de tamanho e de tipo NO SERVIDOR.
--
-- Os tetos espelham o que a interface já pede (produtos 5MB, logos 3MB, NF 10MB), agora
-- num lugar que o navegador não alcança.
--
-- A lista de MIME é explícita de propósito, em vez de 'image/*': **SVG é imagem e carrega
-- script**. Num bucket público, um .svg hospedado responde no domínio do projeto e o
-- script dele roda com aquela origem — é XSS armazenado de graça. Nenhuma tela do sistema
-- precisa de SVG enviado por usuário.
-- ============================================================

update storage.buckets
   set file_size_limit = 5 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
 where id = 'produtos';

update storage.buckets
   set file_size_limit = 3 * 1024 * 1024,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
 where id = 'canais-logos';

update storage.buckets
   set file_size_limit = 10 * 1024 * 1024,
       allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/avif']
 where id = 'notas-fiscais';

-- ============================================================
-- 4) Policies de Storage: exigir conta ativa e fechar o buraco do UPDATE.
--
-- Duas correções:
--   a) Faltava `conta_ativa()` — conta suspensa continuava subindo e apagando arquivo,
--      enquanto o resto do sistema inteiro já a barrava desde a 0021.
--   b) `notas-fiscais` nunca teve policy de UPDATE, mas o upload usa `upsert: true`.
--      Reenviar a NF do mesmo pedido com o mesmo nome falhava com erro de RLS. Só não
--      aparecia porque o nome do arquivo carrega `Date.now()` e quase nunca colide.
--
-- A leitura pública de `produtos` e `canais-logos` fica como está: é o que serve a vitrine,
-- e travá-la por conta ativa quebraria a imagem de quem está em dia enquanto o PostgREST
-- resolve o join. O bloqueio da vitrine acontece no item 2, que é onde importa.
-- ============================================================

do $$
declare
  b text;
  cmd text;
begin
  for b in select unnest(array['produtos', 'canais-logos', 'notas-fiscais'])
  loop
    for cmd in select unnest(array['insert', 'update', 'delete'])
    loop
      execute format('drop policy if exists %I on storage.objects', replace(b, '-', '_') || '_' || cmd || '_own');
    end loop;
  end loop;

  -- Nomes antigos da 0002/0004, que não seguem o padrão acima.
  drop policy if exists "produtos_bucket_insert_own" on storage.objects;
  drop policy if exists "produtos_bucket_update_own" on storage.objects;
  drop policy if exists "produtos_bucket_delete_own" on storage.objects;
  drop policy if exists "notas_fiscais_insert_own" on storage.objects;
  drop policy if exists "notas_fiscais_delete_own" on storage.objects;
  drop policy if exists "canais_logos_insert_own" on storage.objects;
  drop policy if exists "canais_logos_update_own" on storage.objects;
  drop policy if exists "canais_logos_delete_own" on storage.objects;

  for b in select unnest(array['produtos', 'canais-logos', 'notas-fiscais'])
  loop
    execute format(
      'create policy %I on storage.objects for insert to authenticated '
      'with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text and conta_ativa())',
      replace(b, '-', '_') || '_insert_own', b
    );
    execute format(
      'create policy %I on storage.objects for update to authenticated '
      'using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text and conta_ativa()) '
      'with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text and conta_ativa())',
      replace(b, '-', '_') || '_update_own', b, b
    );
    execute format(
      'create policy %I on storage.objects for delete to authenticated '
      'using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text and conta_ativa())',
      replace(b, '-', '_') || '_delete_own', b
    );
  end loop;
end $$;

-- ============================================================
-- 5) FK entre inquilinos: generalizar o que a 0021 fez só para `conta_id`.
--
-- Hoje dá para gravar `produtos.categoria_id`, `precificacoes.loja_id`, `vendas.cliente_id`
-- e mais uma dúzia de colunas apontando para linha de OUTRA conta. O RLS impede ler o que
-- está do outro lado, então não vaza conteúdo — mas vira um oráculo de existência (FK
-- aceita = o UUID existe em algum lugar do banco; FK inexistente = erro 23503) e deixa
-- linha órfã cujo join volta nulo em silêncio.
--
-- A verificação é `exists (select 1 from <tabela> where id = ...)` SEM filtro de user_id,
-- e isso é de propósito: a função é `security invoker`, então o SELECT passa pelo RLS —
-- linha de outra conta simplesmente não existe daqui. Isso faz o mesmo teste valer para
-- tabela com `user_id` próprio e para tabela filha que não tem a coluna.
-- ============================================================

create or replace function validar_vinculo_do_dono()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  i int := 0;
  v_coluna text;
  v_tabela text;
  v_valor uuid;
  v_ok boolean;
begin
  -- TG_ARGV vem em pares: coluna do NEW, tabela referenciada.
  while i < TG_NARGS loop
    v_coluna := TG_ARGV[i];
    v_tabela := TG_ARGV[i + 1];

    execute format('select ($1).%I', v_coluna) into v_valor using new;

    if v_valor is not null then
      execute format('select exists (select 1 from %I where id = $1)', v_tabela)
        into v_ok using v_valor;

      if not v_ok then
        raise exception 'O item vinculado em "%" não existe ou não pertence a você.', v_coluna;
      end if;
    end if;

    i := i + 2;
  end loop;
  return new;
end;
$$;

do $$
declare
  alvo record;
  validos text[];
  colunas text[];
  args text;
  i int;
begin
  for alvo in
    select * from (values
      ('produtos',                 array['categoria_id','categorias','fornecedor_id','fornecedores','armazem_id','armazens','grupo_id','produto_grupos']),
      ('produto_grupos',           array['categoria_id','categorias']),
      ('precificacoes',            array['produto_id','produtos','loja_id','lojas_canal']),
      ('anuncios',                 array['produto_id','produtos','loja_id','lojas_canal']),
      ('concorrentes_preco',       array['produto_id','produtos']),
      ('estoque_movimentacoes',    array['produto_id','produtos']),
      ('pedidos_compra',           array['fornecedor_id','fornecedores','armazem_id','armazens']),
      ('pedidos_compra_itens',     array['produto_id','produtos']),
      ('vendas',                   array['cliente_id','clientes']),
      ('venda_itens',              array['produto_id','produtos']),
      ('contas_a_pagar_receber',   array['cliente_id','clientes']),
      ('lojas_canal',              array['canal_id','canais']),
      ('faixas_comissao_canal',    array['canal_id','canais']),
      ('produto_lojas',            array['produto_id','produtos','loja_id','lojas_canal']),
      ('catalogo_precos',          array['produto_id','produtos'])
    ) as t(tabela, pares)
  loop
    if to_regclass(format('public.%I', alvo.tabela)) is null then
      raise notice 'tabela % não existe neste banco — trigger ignorado', alvo.tabela;
      continue;
    end if;

    -- Mantém só os pares cuja coluna existe de fato, para um banco que ficou para trás em
    -- alguma migração não travar aqui — nem passar para a função uma coluna que o
    -- `($1).coluna` lá dentro não conseguiria ler.
    validos := array[]::text[];
    colunas := array[]::text[];
    i := 1;
    while i <= array_length(alvo.pares, 1) loop
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = alvo.tabela and column_name = alvo.pares[i]
      ) and to_regclass(format('public.%I', alvo.pares[i + 1])) is not null then
        validos := validos || alvo.pares[i] || alvo.pares[i + 1];
        colunas := colunas || alvo.pares[i];
      end if;
      i := i + 2;
    end loop;

    if array_length(colunas, 1) is null then
      raise notice 'nenhuma coluna esperada em % — trigger ignorado', alvo.tabela;
      execute format('drop trigger if exists trg_valida_vinculo_%1$s on %1$I', alvo.tabela);
      continue;
    end if;

    select string_agg(quote_literal(p), ', ' order by o)
      into args
      from unnest(validos) with ordinality as u(p, o);

    execute format('drop trigger if exists trg_valida_vinculo_%1$s on %1$I', alvo.tabela);
    execute format(
      'create trigger trg_valida_vinculo_%1$s before insert or update of %2$s on %1$I '
      'for each row execute function validar_vinculo_do_dono(%3$s)',
      alvo.tabela,
      (select string_agg(quote_ident(c), ', ' order by o) from unnest(colunas) with ordinality as u(c, o)),
      args
    );
  end loop;
end $$;

-- ============================================================
-- 6) Índices que faltavam em `user_id`.
--
-- Toda leitura destas tabelas carrega `user_id = auth.uid()` no predicado do RLS, e a FK
-- para auth.users é ON DELETE CASCADE desde a 0011 — sem índice, apagar um usuário faz
-- seq scan em cada uma. `concorrentes_preco` e `faixas_comissao_canal` são as que doem:
-- crescem por produto e por canal, e são lidas na tela de Precificação.
-- ============================================================

create index if not exists canais_user_idx                on canais (user_id);
create index if not exists lojas_canal_user_idx           on lojas_canal (user_id);
create index if not exists faixas_comissao_canal_user_idx on faixas_comissao_canal (user_id);
create index if not exists concorrentes_preco_user_idx    on concorrentes_preco (user_id);
create index if not exists despesas_fixas_user_idx        on despesas_fixas (user_id);
create index if not exists categorias_user_idx            on categorias (user_id);
create index if not exists fornecedores_user_idx          on fornecedores (user_id);
create index if not exists contas_user_idx                on contas (user_id);
create index if not exists armazens_user_idx              on armazens (user_id);
create index if not exists formas_pagamento_user_idx      on formas_pagamento (user_id);
create index if not exists historico_admin_admin_idx      on historico_admin (admin_user_id);

-- Nenhuma consulta filtra `ia_uso` por `dia` sem `user_id`, e `user_id` já é o prefixo da
-- PK — este índice só cobrava escrita.
drop index if exists ia_uso_dia_idx;

NOTIFY pgrst, 'reload schema';

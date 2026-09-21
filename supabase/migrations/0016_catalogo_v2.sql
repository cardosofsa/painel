-- ============================================================
-- Catálogo v2: preço editável por catálogo (substitui o switch global
-- venda/atacado), pop-up de produto (galeria + descrição) e botão
-- "Comprar Agora" via WhatsApp do negócio.
-- ============================================================

alter table produtos drop column preco_atacado;
alter table produtos add column descricao text;
alter table catalogos drop column tipo_preco;
alter table perfil_negocio add column whatsapp text;

-- ============================================================
-- Fotos adicionais do produto (a principal continua em produtos.imagem_url).
-- Mesmo bucket de storage já usado hoje ("produtos"), sem infra nova.
-- ============================================================

create table produto_imagens (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references produtos(id) on delete cascade,
  url text not null,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

create index produto_imagens_produto_id_idx on produto_imagens (produto_id);

alter table produto_imagens enable row level security;
create policy "own_rows_produto_imagens" on produto_imagens for all
  using (exists (select 1 from produtos p where p.id = produto_id and p.user_id = auth.uid()))
  with check (exists (select 1 from produtos p where p.id = produto_id and p.user_id = auth.uid()));

-- ============================================================
-- Override de preço por catálogo: só existe uma linha quando o dono editou o
-- preço padrão pra aquele catálogo específico. Sem linha = usa preco_venda.
-- ============================================================

create table catalogo_precos (
  id uuid primary key default gen_random_uuid(),
  catalogo_id uuid not null references catalogos(id) on delete cascade,
  produto_id uuid not null references produtos(id) on delete cascade,
  preco numeric not null,
  unique (catalogo_id, produto_id)
);

alter table catalogo_precos enable row level security;
create policy "own_rows_catalogo_precos" on catalogo_precos for all
  using (exists (select 1 from catalogos c where c.id = catalogo_id and c.user_id = auth.uid()))
  with check (exists (select 1 from catalogos c where c.id = catalogo_id and c.user_id = auth.uid()));

-- ============================================================
-- Reescreve a função pública: agora devolve produto_id (pro pop-up e pra
-- editar preço), descricao, o preço já resolvido (override ou padrão),
-- imagens_extra (array de fotos adicionais, via array_agg — sem precisar de
-- uma segunda ida ao banco quando o pop-up abrir) e o WhatsApp do negócio.
-- ============================================================

create or replace function obter_catalogo_publico(p_slug text)
returns table (
  catalogo_nome text,
  produto_id uuid,
  produto_nome text,
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

  select whatsapp into v_whatsapp from perfil_negocio where user_id = v_catalogo.user_id;

  return query
  select
    v_catalogo.nome,
    p.id,
    p.nome,
    p.descricao,
    p.imagem_url,
    c.nome,
    coalesce(cp.preco, p.preco_venda),
    coalesce(
      (select array_agg(pi.url order by pi.ordem) from produto_imagens pi where pi.produto_id = p.id),
      array[]::text[]
    ),
    v_whatsapp
  from (select 1) as catalogo_encontrado
  left join produtos p on p.user_id = v_catalogo.user_id and p.ativo = true and p.estoque > 0
  left join categorias c on c.id = p.categoria_id
  left join catalogo_precos cp on cp.catalogo_id = v_catalogo.id and cp.produto_id = p.id
  order by c.nome nulls last, p.nome
  limit 500;
end;
$$;

NOTIFY pgrst, 'reload schema';

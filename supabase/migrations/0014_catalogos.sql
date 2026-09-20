-- ============================================================
-- Catálogo: vitrine pública de produtos, para compartilhar com clientes por
-- link. Cada conta pode ter vários catálogos (ex: um de varejo, um de
-- atacado), cada um com seu próprio slug e tipo de preço.
--
-- O acesso público NUNCA lê `catalogos` ou `produtos` diretamente (ambas têm
-- RLS por user_id) — passa só pela função `obter_catalogo_publico`, que roda
-- como security definer (mesmo padrão de `seed_canais_novo_usuario`, em
-- 0004_canais_lojas_variacoes.sql) e filtra explicitamente pelo dono do
-- catálogo antes de devolver qualquer linha.
-- ============================================================

create table catalogos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  nome text not null,
  slug text not null unique,
  tipo_preco text not null default 'venda' check (tipo_preco in ('venda', 'atacado')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index catalogos_user_id_idx on catalogos (user_id);

alter table catalogos enable row level security;
create policy "own_rows_catalogos" on catalogos for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Função pública: dado um slug, devolve só o necessário pra montar a
-- vitrine (nunca a linha crua de produtos/catalogos). Sem catálogo ativo
-- com esse slug, devolve zero linhas (o app trata isso como "indisponível").
-- ============================================================

create or replace function obter_catalogo_publico(p_slug text)
returns table (
  catalogo_nome text,
  produto_nome text,
  imagem_url text,
  categoria_nome text,
  preco numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalogo record;
begin
  select id, user_id, nome, tipo_preco into v_catalogo
  from catalogos where slug = p_slug and ativo = true;

  if not found then
    return;
  end if;

  return query
  select v_catalogo.nome, p.nome, p.imagem_url, c.nome,
         case when v_catalogo.tipo_preco = 'atacado' then coalesce(p.preco_atacado, p.preco_venda) else p.preco_venda end
  from produtos p
  left join categorias c on c.id = p.categoria_id
  where p.user_id = v_catalogo.user_id and p.ativo = true and p.estoque > 0
  order by c.nome nulls last, p.nome
  limit 500;
end;
$$;

grant execute on function obter_catalogo_publico(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Corrige obter_catalogo_publico: quando o catálogo existe e está ativo mas
-- não tem nenhum produto elegível (ativo + com estoque), a função devolvia
-- ZERO linhas — indistinguível de "slug inválido" pra quem chama. A página
-- pública mostrava "Catálogo não encontrado" errado nesse caso.
--
-- Fix: parte de uma linha única representando o catálogo e faz LEFT JOIN
-- com produtos, garantindo pelo menos 1 linha sempre que o catálogo existe
-- (com produto_nome/preco nulos quando não há produto nenhum).
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
  from (select 1) as catalogo_encontrado
  left join produtos p on p.user_id = v_catalogo.user_id and p.ativo = true and p.estoque > 0
  left join categorias c on c.id = p.categoria_id
  order by c.nome nulls last, p.nome
  limit 500;
end;
$$;

NOTIFY pgrst, 'reload schema';

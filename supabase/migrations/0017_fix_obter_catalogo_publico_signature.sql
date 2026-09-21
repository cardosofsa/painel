-- ============================================================
-- A migração 0016 tentou trocar as colunas de retorno de
-- obter_catalogo_publico via "create or replace function" — mas o Postgres
-- não permite mudar a assinatura de retorno de uma função RETURNS TABLE
-- dessa forma (precisa dropar antes). O replace falhou silenciosamente e a
-- versão antiga continuou rodando, ainda referenciando a coluna
-- catalogos.tipo_preco que a própria 0016 já tinha removido — todo pedido à
-- vitrine pública quebrava com "column tipo_preco does not exist".
--
-- Fix: dropar a função explicitamente antes de recriar.
-- ============================================================

drop function if exists obter_catalogo_publico(text);

create function obter_catalogo_publico(p_slug text)
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

grant execute on function obter_catalogo_publico(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';

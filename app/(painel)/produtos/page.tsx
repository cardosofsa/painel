import { createClient } from "@/lib/supabase/server";
import { ProdutosClient, type Produto } from "./ProdutosClient";

export default async function ProdutosPage() {
  const supabase = await createClient();

  const [produtosRes, categoriasRes, fornecedoresRes, armazensRes, movimentacoesRes, precificacoesRes] = await Promise.all([
    supabase
      .from("produtos")
      .select(
        "id, sku, nome, categoria_id, fornecedor_id, armazem_id, custo, preco_venda, preco_atacado, codigo_barras, imagem_url, estoque, estoque_minimo, saida_media_semanal, ativo, categorias(nome), fornecedores(nome), armazens(nome)",
      )
      .order("nome"),
    supabase.from("categorias").select("id, nome").order("nome"),
    supabase.from("fornecedores").select("id, nome").order("nome"),
    supabase.from("armazens").select("id, nome").order("nome"),
    supabase
      .from("estoque_movimentacoes")
      .select("produto_id, motivo, tipo, quantidade, data_movimentacao")
      .order("data_movimentacao", { ascending: false })
      .limit(200),
    supabase
      .from("precificacoes")
      .select("produto_id, canal, preco_calculado, criado_em")
      .order("criado_em", { ascending: false })
      .limit(200),
  ]);

  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (categoriasRes.error) throw new Error(categoriasRes.error.message);
  if (fornecedoresRes.error) throw new Error(fornecedoresRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);

  const produtos: Produto[] = (produtosRes.data ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    categoria_id: p.categoria_id,
    fornecedor_id: p.fornecedor_id,
    armazem_id: p.armazem_id,
    custo: p.custo,
    preco_venda: p.preco_venda,
    preco_atacado: p.preco_atacado,
    codigo_barras: p.codigo_barras,
    imagem_url: p.imagem_url,
    estoque: p.estoque,
    estoque_minimo: p.estoque_minimo,
    saida_media_semanal: p.saida_media_semanal,
    ativo: p.ativo,
    categoria_nome: (p.categorias as unknown as { nome: string }[] | null)?.[0]?.nome ?? null,
    fornecedor_nome: (p.fornecedores as unknown as { nome: string }[] | null)?.[0]?.nome ?? null,
    armazem_nome: (p.armazens as unknown as { nome: string }[] | null)?.[0]?.nome ?? null,
  }));

  return (
    <ProdutosClient
      produtos={produtos}
      categorias={categoriasRes.data ?? []}
      fornecedores={fornecedoresRes.data ?? []}
      armazens={armazensRes.data ?? []}
      movimentacoes={movimentacoesRes.data ?? []}
      precificacoes={precificacoesRes.data ?? []}
    />
  );
}

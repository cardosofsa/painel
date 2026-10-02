import { createClient } from "@/lib/supabase/server";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { ProdutosClient, type Produto, type PrecoCanal } from "./ProdutosClient";

export default async function ProdutosPage() {
  const supabase = await createClient();

  const [
    produtosRes,
    categoriasRes,
    fornecedoresRes,
    armazensRes,
    movimentacoesRes,
    precificacoesRes,
    lojasRes,
    produtoLojasRes,
    produtoImagensRes,
    gruposRes,
    precosCanalRes,
  ] = await Promise.all([
    supabase
      .from("produtos")
      .select(
        // `*`: as colunas de envio (0041) ainda podem não existir; pedir por nome derrubaria a tela.
        "*",
      )
      .order("nome"),
    // `*`: `tipo` (insumo/embalagem) só existe a partir da 0042.
    supabase.from("categorias").select("*").order("nome"),
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
    supabase.from("lojas_canal").select("id, nome").order("nome"),
    supabase.from("produto_lojas").select("produto_id, loja_id"),
    supabase.from("produto_imagens").select("id, produto_id, url").order("ordem"),
    supabase.from("produto_grupos").select("id, nome").order("nome"),
    // Migração 0029: se ainda não foi aplicada, a RPC não existe — falha vira uma lista
    // vazia (tratado abaixo, não interrompe a página) em vez de derrubar /produtos.
    supabase.rpc("precos_canal_por_produto"),
  ]);

  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (categoriasRes.error) throw new Error(categoriasRes.error.message);
  if (fornecedoresRes.error) throw new Error(fornecedoresRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);
  if (lojasRes.error) throw new Error(lojasRes.error.message);
  if (produtoLojasRes.error) throw new Error(produtoLojasRes.error.message);
  if (movimentacoesRes.error) throw new Error(movimentacoesRes.error.message);
  if (precificacoesRes.error) throw new Error(precificacoesRes.error.message);
  if (produtoImagensRes.error) throw new Error(produtoImagensRes.error.message);
  if (gruposRes.error) throw new Error(gruposRes.error.message);
  // Não derruba a página: quem ainda não aplicou a migração 0029 continua usando
  // Produtos normalmente, só sem margem/markup por canal na lista e no resumo.
  if (precosCanalRes.error) console.error("[produtos] precos_canal_por_produto:", precosCanalRes.error.message);

  const categoriasPorId = new Map((categoriasRes.data ?? []).map((c) => [c.id, c.nome]));
  const fornecedoresPorId = new Map((fornecedoresRes.data ?? []).map((f) => [f.id, f.nome]));
  const armazensPorId = new Map((armazensRes.data ?? []).map((a) => [a.id, a.nome]));
  const gruposPorId = new Map((gruposRes.data ?? []).map((g) => [g.id, g.nome]));

  const lojaIdsPorProduto = new Map<string, string[]>();
  for (const pl of produtoLojasRes.data ?? []) {
    const lista = lojaIdsPorProduto.get(pl.produto_id) ?? [];
    lista.push(pl.loja_id);
    lojaIdsPorProduto.set(pl.produto_id, lista);
  }

  const imagensPorProduto = new Map<string, { id: string; url: string }[]>();
  for (const img of produtoImagensRes.data ?? []) {
    const lista = imagensPorProduto.get(img.produto_id) ?? [];
    lista.push({ id: img.id, url: img.url });
    imagensPorProduto.set(img.produto_id, lista);
  }

  const produtos: Produto[] = (produtosRes.data ?? []).map((p) => ({
    e_kit: !!p.e_kit,
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    categoria_id: p.categoria_id,
    fornecedor_id: p.fornecedor_id,
    armazem_id: p.armazem_id,
    custo: p.custo,
    custo_base: p.custo_base,
    insumos: p.insumos ?? [],
    preco_venda: p.preco_venda,
    preco_atacado: p.preco_atacado,
    descricao: p.descricao,
    codigo_barras: p.codigo_barras,
    imagem_url: p.imagem_url,
    estoque: p.estoque,
    estoque_minimo: p.estoque_minimo,
    saida_media_semanal: p.saida_media_semanal,
    garantia_dias: p.garantia_dias,
    palavras_chave: p.palavras_chave ?? null,
    peso_g: p.peso_g ?? null,
    altura_cm: p.altura_cm ?? null,
    largura_cm: p.largura_cm ?? null,
    comprimento_cm: p.comprimento_cm ?? null,
    ativo: p.ativo,
    grupo_id: p.grupo_id,
    variante_nome: p.variante_nome,
    grupo_nome: (p.grupo_id && gruposPorId.get(p.grupo_id)) ?? null,
    loja_ids: lojaIdsPorProduto.get(p.id) ?? [],
    imagens: imagensPorProduto.get(p.id) ?? [],
    categoria_nome: (p.categoria_id && categoriasPorId.get(p.categoria_id)) ?? null,
    fornecedor_nome: (p.fornecedor_id && fornecedoresPorId.get(p.fornecedor_id)) ?? null,
    armazem_nome: (p.armazem_id && armazensPorId.get(p.armazem_id)) ?? null,
  }));

  const precosCanal: PrecoCanal[] = ((precosCanalRes.data ?? []) as PrecoCanal[]).map((r) => ({
    produto_id: r.produto_id,
    loja_id: r.loja_id,
    canal_nome: r.canal_nome,
    preco: r.preco,
    margem_pct: r.margem_pct,
    markup_pct: r.markup_pct,
  }));

  const iaDisponivel = await iaDisponivelParaConta(supabase);

  return (
    <ProdutosClient
      produtos={produtos}
      categorias={categoriasRes.data ?? []}
      fornecedores={fornecedoresRes.data ?? []}
      armazens={armazensRes.data ?? []}
      movimentacoes={movimentacoesRes.data ?? []}
      precificacoes={precificacoesRes.data ?? []}
      precosCanal={precosCanal}
      lojas={lojasRes.data ?? []}
      grupos={gruposRes.data ?? []}
      // Lido no servidor de propósito: `GEMINI_API_KEY` não é `NEXT_PUBLIC_`, então no
      // cliente o bundler trocaria por `undefined` calado e o botão sumiria sempre.
      iaDisponivel={iaDisponivel}
    />
  );
}

/** Tipos compartilhados entre a grade, o carrinho e o checkout do PDV. */

/** Um SKU vendável. Variantes são linhas de `produtos` com `grupo_id` preenchido. */
export interface ProdutoPdv {
  id: string;
  sku: string;
  nome: string;
  grupo_id: string | null;
  grupo_nome: string | null;
  variante_nome: string | null;
  preco_venda: number;
  custo: number;
  estoque: number;
  imagem_url: string | null;
  categoria_nome: string | null;
  codigo_barras: string | null;
}

/**
 * O que a grade desenha: um card por produto avulso OU por grupo de variantes.
 * Card de grupo abre o seletor antes de entrar no carrinho.
 */
export interface CardPdv {
  chave: string;
  nome: string;
  imagem_url: string | null;
  categoria_nome: string | null;
  precoMin: number;
  precoMax: number;
  estoqueTotal: number;
  variantes: ProdutoPdv[];
}

export interface ItemCarrinho {
  produto_id: string;
  nome: string;
  sku: string;
  preco_unitario: number;
  quantidade: number;
  estoque_disponivel: number;
  imagem_url: string | null;
}

export interface ClientePdv {
  id: string;
  nome: string;
  whatsapp: string | null;
  permite_fiado: boolean;
}

export interface ContaPdv {
  id: string;
  nome: string;
}

/** Rótulo completo do SKU — é o que vai pro carrinho e pro snapshot da venda. */
export function rotuloProduto(p: ProdutoPdv): string {
  const base = p.grupo_nome ?? p.nome;
  return p.variante_nome ? `${base} — ${p.variante_nome}` : base;
}

/** Agrupa os SKUs em cards: variantes do mesmo grupo viram um card só. */
export function montarCards(produtos: ProdutoPdv[]): CardPdv[] {
  const cards = new Map<string, CardPdv>();

  for (const p of produtos) {
    const chave = p.grupo_id ?? p.id;
    const existente = cards.get(chave);

    if (existente) {
      existente.variantes.push(p);
      existente.precoMin = Math.min(existente.precoMin, p.preco_venda);
      existente.precoMax = Math.max(existente.precoMax, p.preco_venda);
      existente.estoqueTotal += p.estoque;
      existente.imagem_url = existente.imagem_url ?? p.imagem_url;
      continue;
    }

    cards.set(chave, {
      chave,
      nome: p.grupo_nome ?? p.nome,
      imagem_url: p.imagem_url,
      categoria_nome: p.categoria_nome,
      precoMin: p.preco_venda,
      precoMax: p.preco_venda,
      estoqueTotal: p.estoque,
      variantes: [p],
    });
  }

  return Array.from(cards.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

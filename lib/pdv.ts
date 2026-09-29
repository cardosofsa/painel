/**
 * Lógica pura do PDV.
 *
 * Mora em `lib/` (não em `app/(painel)/pdv/tipos.ts`, onde nasceu) pelo mesmo motivo que
 * `lib/admin.ts` declara no cabeçalho: para ser testável isolada. O `vitest.config.ts`
 * mede cobertura só de `lib/**`, então função de negócio deixada dentro de `app/` fica
 * invisível ao relatório **e** sem teste — que era exatamente o caso desta, apesar de
 * estar no caminho crítico do caixa.
 */

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
  garantia_dias: number | null;
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

/**
 * Agrupa os SKUs em cards: variantes do mesmo grupo viram um card só.
 *
 * Duas decisões que o teste guarda:
 * - a imagem do card é a **primeira não-nula** entre as variantes, senão um grupo cuja
 *   primeira variante está sem foto apareceria vazio mesmo tendo foto nas outras;
 * - `estoqueTotal` soma o grupo inteiro, então o card só some da grade quando **nenhuma**
 *   variante tem peça — vender só a cor que sobrou continua possível.
 */
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

/** Centavos. Sem isso, a divisão de parcelas vaza dízima pra tela. */
function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

export interface Parcela {
  numero: number;
  valor: number;
}

/**
 * Divide um valor em N parcelas — mesmo algoritmo que
 * `app/(painel)/compras/actions.ts` já usa pra parcelar pedido de compra, generalizado
 * aqui pra ser reaproveitado também no fiado parcelado do PDV, com teste isolado.
 *
 * O resto do arredondamento (centavos que não dividem exato) vai pra ÚLTIMA parcela, não
 * pra primeira — é o que a RPC `registrar_venda` (0030) faz no banco, e é o que este
 * espelha, pra tela mostrar o mesmo número antes de enviar.
 */
export function dividirEmParcelas(valorTotal: number, numParcelas: number): Parcela[] {
  const n = Math.max(1, Math.floor(numParcelas) || 1);
  const valorParcela = arredondar(valorTotal / n);
  return Array.from({ length: n }, (_, i) => {
    const numero = i + 1;
    const ultima = numero === n;
    const valor = ultima ? arredondar(valorTotal - valorParcela * (n - 1)) : valorParcela;
    return { numero, valor };
  });
}

/** O que falta pagar depois da entrada — nunca fica negativo. */
export function calcularRestante(total: number, entrada: number): number {
  return Math.max(0, arredondar(total - (entrada || 0)));
}

/** Valor da taxa de maquineta sobre o que ficou pra pagar no cartão. */
export function calcularTaxaMaquineta(valor: number, taxaPct: number): number {
  if (!taxaPct || taxaPct <= 0) return 0;
  return arredondar(valor * (taxaPct / 100));
}

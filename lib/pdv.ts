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

/**
 * Subtotal do carrinho: cada linha arredondada em centavos e somada, igual à RPC
 * `registrar_venda` (sum(round(preço × qtd, 2))). Sem isso, 3 × 0,10 vira 0,30000000000000004.
 */
export function subtotalDoCarrinho(itens: { preco_unitario: number; quantidade: number }[]): number {
  return arredondar(itens.reduce((acc, i) => acc + arredondar(i.preco_unitario * i.quantidade), 0));
}

/**
 * Desconto em reais, já resolvido a partir do tipo (valor ou %), travado entre 0 e o subtotal
 * e arredondado em centavos. Sem o arredondamento, 50% de 10,05 dava 5,025: a tela mostrava
 * um total e o banco (que arredonda o desconto) gravava outro, e o Pix saía com o valor errado.
 */
export function descontoDoCarrinho(tipo: "valor" | "percentual", entrada: number, subtotal: number): number {
  const valor = Number.isFinite(entrada) ? entrada : 0;
  const bruto = tipo === "percentual" ? (subtotal * valor) / 100 : valor;
  return arredondar(Math.min(Math.max(bruto, 0), subtotal));
}

export interface TrocoEntrada {
  /** Total da venda (já com desconto e entrega). */
  total: number;
  /** Crédito de troca usado como pagamento: não passa pelo caixa. */
  credito?: number;
  entradaValor: number;
  /** A entrada é em dinheiro? */
  entradaDinheiro: boolean;
  /** A forma do restante é do tipo dinheiro? */
  formaPrincipalDinheiro: boolean;
  /** Crediário: o restante não é pago agora, só a entrada. */
  fiado: boolean;
  /** Quanto o cliente entregou em dinheiro. */
  recebido: number;
}

/**
 * Troco do PDV: vale só para a parte paga AGORA em dinheiro — a entrada em dinheiro e/ou o
 * restante, quando a venda é paga e a forma do restante é dinheiro. Mesma regra da RPC
 * `registrar_venda` (0083). `falta` > 0 quando o recebido não cobre a parte em dinheiro.
 */
export function calcularTroco(t: TrocoEntrada): { emDinheiro: number; troco: number; falta: number } {
  const entrada = Math.max(0, t.entradaValor || 0);
  const restante = calcularRestante(Math.max(0, arredondar(t.total - (t.credito || 0))), entrada);
  const emDinheiro = arredondar((t.entradaDinheiro ? entrada : 0) + (!t.fiado && t.formaPrincipalDinheiro ? restante : 0));
  const recebido = Math.max(0, Number.isFinite(t.recebido) ? t.recebido : 0);
  if (emDinheiro <= 0 || recebido <= 0) return { emDinheiro, troco: 0, falta: 0 };
  return { emDinheiro, troco: Math.max(0, arredondar(recebido - emDinheiro)), falta: Math.max(0, arredondar(emDinheiro - recebido)) };
}

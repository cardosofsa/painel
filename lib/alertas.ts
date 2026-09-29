export interface AlertaErosaoMargem {
  produtoId: string;
  produtoNome: string;
  custoPrecificado: number;
  custoRecente: number;
  aumentoPct: number;
}

const TOLERANCIA_EROSAO_PCT = 3;

export function calcularErosaoMargem(
  precificacoesRecentesPorProduto: Map<string, { custo: number }>,
  comprasRecentesPorProduto: Map<string, { custo_unitario: number; produto_nome: string }>,
): AlertaErosaoMargem[] {
  const alertas: AlertaErosaoMargem[] = [];
  for (const [produtoId, compra] of comprasRecentesPorProduto) {
    const precificacao = precificacoesRecentesPorProduto.get(produtoId);
    if (!precificacao || precificacao.custo <= 0) continue;
    const aumentoPct = ((compra.custo_unitario - precificacao.custo) / precificacao.custo) * 100;
    if (aumentoPct > TOLERANCIA_EROSAO_PCT) {
      alertas.push({
        produtoId,
        produtoNome: compra.produto_nome,
        custoPrecificado: precificacao.custo,
        custoRecente: compra.custo_unitario,
        aumentoPct,
      });
    }
  }
  return alertas.sort((a, b) => b.aumentoPct - a.aumentoPct);
}

export interface AlertaRupturaEstoque {
  produtoId: string;
  produtoNome: string;
  estoqueAtual: number;
  mediaSaidaDiaria: number;
  diasRestantes: number;
}

const DIAS_JANELA_CONSUMO = 30;
const LIMITE_DIAS_ALERTA = 14;

export function calcularPrevisaoRuptura(
  produtos: { id: string; nome: string; estoque: number }[],
  saidasPorProduto: Map<string, number>,
): AlertaRupturaEstoque[] {
  const alertas: AlertaRupturaEstoque[] = [];
  for (const produto of produtos) {
    const totalSaidas = saidasPorProduto.get(produto.id) ?? 0;
    const mediaSaidaDiaria = totalSaidas / DIAS_JANELA_CONSUMO;
    if (mediaSaidaDiaria <= 0) continue;
    const diasRestantes = produto.estoque / mediaSaidaDiaria;
    if (diasRestantes <= LIMITE_DIAS_ALERTA) {
      alertas.push({
        produtoId: produto.id,
        produtoNome: produto.nome,
        estoqueAtual: produto.estoque,
        mediaSaidaDiaria,
        diasRestantes,
      });
    }
  }
  return alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/**
 * Quantidade sugerida ao abrir um pedido de compra a partir do alerta de estoque mínimo.
 *
 * Se o produto tem saída média conhecida, repõe 4 semanas de venda (mesma conta do resumo
 * do produto); senão, o suficiente para dobrar o mínimo. Nunca menos que 1.
 */
export function quantidadeSugeridaCompra(p: {
  estoque: number;
  estoque_minimo: number;
  saida_media_semanal: number;
}): number {
  const porVenda = Math.ceil(p.saida_media_semanal * 4) - p.estoque;
  const porMinimo = p.estoque_minimo * 2 - p.estoque;
  return Math.max(1, porVenda > 0 ? porVenda : porMinimo);
}

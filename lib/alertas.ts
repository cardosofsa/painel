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

export interface AlertaErosaoMargem {
  produtoId: string;
  produtoNome: string;
  custoPrecificado: number;
  custoRecente: number;
  aumentoPct: number;
}

import { ID_CUSTO_PRODUTO, type ComponenteKit } from "./pricing";

const TOLERANCIA_EROSAO_PCT = 3;

/**
 * O custo da precificação que é comparável ao `custo_unitario` de uma compra.
 *
 * `precificacoes.custo` é produto + insumos (embalagem, etiqueta...), mas a compra registra
 * só o produto. Comparar os dois escondia aumento: produto 30 + insumos 5 = 35, compra a 34
 * parecia "mais barato" quando o produto subiu 13,3%. A linha `custo-produto` do JSON
 * `componentes` guarda o valor do produto sozinho; sem ela (precificação antiga), fica o
 * custo total, como antes.
 */
export function custoProdutoDaPrecificacao(p: { custo: number; componentes?: ComponenteKit[] | null }): number {
  const linha = Array.isArray(p.componentes) ? p.componentes.find((c) => c?.id === ID_CUSTO_PRODUTO) : undefined;
  const valor = linha ? Number(linha.custoUnitario) * Number(linha.quantidade ?? 1) : NaN;
  return Number.isFinite(valor) && valor > 0 ? valor : p.custo;
}

export function calcularErosaoMargem(
  precificacoesRecentesPorProduto: Map<string, { custo: number; componentes?: ComponenteKit[] | null }>,
  comprasRecentesPorProduto: Map<string, { custo_unitario: number; produto_nome: string }>,
): AlertaErosaoMargem[] {
  const alertas: AlertaErosaoMargem[] = [];
  for (const [produtoId, compra] of comprasRecentesPorProduto) {
    const precificacao = precificacoesRecentesPorProduto.get(produtoId);
    if (!precificacao) continue;
    const custoPrecificado = custoProdutoDaPrecificacao(precificacao);
    if (!(custoPrecificado > 0)) continue;
    const aumentoPct = ((compra.custo_unitario - custoPrecificado) / custoPrecificado) * 100;
    if (aumentoPct > TOLERANCIA_EROSAO_PCT) {
      alertas.push({
        produtoId,
        produtoNome: compra.produto_nome,
        custoPrecificado,
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

// ---------- Preço defasado (Fase 5, onda A) ----------

export interface AlertaPrecoDefasado {
  produtoId: string;
  produtoNome: string;
  custoPrecificado: number;
  custoAtual: number;
  /** % de aumento do custo atual sobre o custo da última precificação (0 se não subiu). */
  aumentoPct: number;
  /** Dias desde a última precificação. */
  dias: number;
  motivo: "custo" | "antiga";
}

const DIAS_PRECIFICACAO_ANTIGA = 120;

/**
 * Preço defasado: o custo de HOJE do produto (`produtos.custo`, com insumos) subiu mais que
 * a tolerância sobre o custo usado na última precificação, ou a precificação passou de 120
 * dias. Diferente da erosão de margem, que olha a última compra: aqui vale também para
 * insumo/embalagem que encareceu. Produtos em `ignorar` (já têm o alerta de erosão) ficam de
 * fora, para não repetir o mesmo aviso.
 */
export function calcularPrecoDefasado(
  produtos: { id: string; nome: string; custo: number }[],
  ultimaPrecificacao: Map<string, { custo: number; criado_em: string }>,
  hoje: Date,
  ignorar: Set<string> = new Set(),
): AlertaPrecoDefasado[] {
  const saida: AlertaPrecoDefasado[] = [];
  for (const p of produtos) {
    if (ignorar.has(p.id)) continue;
    const ult = ultimaPrecificacao.get(p.id);
    if (!ult || !(ult.custo > 0) || !(p.custo > 0)) continue;
    const aumentoPct = ((p.custo - ult.custo) / ult.custo) * 100;
    const dias = Math.max(0, Math.floor((hoje.getTime() - new Date(ult.criado_em).getTime()) / 86_400_000));
    const motivo = aumentoPct > TOLERANCIA_EROSAO_PCT ? "custo" : dias > DIAS_PRECIFICACAO_ANTIGA ? "antiga" : null;
    if (!motivo) continue;
    saida.push({ produtoId: p.id, produtoNome: p.nome, custoPrecificado: ult.custo, custoAtual: p.custo, aumentoPct: Math.max(0, aumentoPct), dias, motivo });
  }
  // Custo que subiu primeiro (maior aumento), depois as antigas (mais velha primeiro).
  return saida.sort((a, b) => (a.motivo === b.motivo ? (a.motivo === "custo" ? b.aumentoPct - a.aumentoPct : b.dias - a.dias) : a.motivo === "custo" ? -1 : 1));
}

/** Última precificação de cada produto (linhas em qualquer ordem). */
export function ultimaPrecificacaoPorProduto(
  linhas: { produto_id: string | null; custo: number; criado_em: string }[],
): Map<string, { custo: number; criado_em: string }> {
  const m = new Map<string, { custo: number; criado_em: string }>();
  for (const l of linhas) {
    if (!l.produto_id) continue;
    const atual = m.get(l.produto_id);
    if (!atual || l.criado_em > atual.criado_em) m.set(l.produto_id, { custo: Number(l.custo), criado_em: l.criado_em });
  }
  return m;
}

/**
 * Regras da tela de Vendas (8.6): em que aba cada venda fica, de onde ela veio e como o
 * valor se divide até chegar no lucro. Puras, cobertas por `vendas-painel.test.ts`.
 */

export type StatusVenda = "paga" | "fiado" | "cancelada";
export type StatusEnvio = "separacao" | "enviado" | "concluido" | null;
export type SituacaoVenda = "aberta" | "concluida" | "cancelada";
export type OrigemVenda = "pdv" | "catalogo" | "marketplace";

export const ROTULO_ENVIO: Record<Exclude<StatusEnvio, null>, string> = {
  separacao: "Em separação",
  enviado: "Enviado",
  concluido: "Entregue",
};

export const ROTULO_ORIGEM: Record<OrigemVenda, string> = {
  pdv: "PDV",
  catalogo: "Catálogo",
  marketplace: "Marketplace",
};

/**
 * "Em aberto" é o que ainda pede trabalho: separar, enviar ou receber (fiado). Venda paga
 * sem envio acompanhado (balcão) ou já entregue está concluída.
 */
export function situacaoVenda(v: { status: StatusVenda; status_envio?: StatusEnvio }): SituacaoVenda {
  if (v.status === "cancelada") return "cancelada";
  if (v.status === "fiado") return "aberta";
  if (v.status_envio === "separacao" || v.status_envio === "enviado") return "aberta";
  return "concluida";
}

export function origemVenda(v: { id: string; observacao?: string | null }, vendasDoCatalogo: Set<string>): OrigemVenda {
  if (vendasDoCatalogo.has(v.id) || (v.observacao ?? "").startsWith("Pedido da vitrine")) return "catalogo";
  return "pdv";
}

export interface DecomposicaoVenda {
  receita: number;
  desconto: number;
  entrega: number;
  custoProdutos: number;
  /** Imposto, taxa de maquininha e outras deduções: o que sobra entre total, custo e lucro. */
  impostosTaxas: number;
  lucro: number;
  /** Lucro ÷ receita líquida (total). */
  margem: number;
}

/**
 * Do total ao lucro. O banco grava total, custo e lucro (com imposto e taxa de maquininha
 * já abatidos); a diferença que sobra é o que foi para imposto e taxas.
 */
export function decomporVenda(v: { subtotal: number; desconto: number; valor_entrega: number; total: number; custo_total: number; lucro: number }): DecomposicaoVenda {
  const impostosTaxas = Math.max(0, Math.round((v.total - v.valor_entrega - v.custo_total - v.lucro) * 100) / 100);
  return {
    receita: v.subtotal,
    desconto: v.desconto,
    entrega: v.valor_entrega,
    custoProdutos: v.custo_total,
    impostosTaxas,
    lucro: v.lucro,
    margem: v.total > 0 ? v.lucro / v.total : 0,
  };
}

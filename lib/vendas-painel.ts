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
  /** Valor já devolvido ao cliente (devoluções): sai da receita. */
  devolvido: number;
  custoProdutos: number;
  /** Imposto, taxa de maquininha e outras deduções: o que sobra entre total, custo, frete e lucro. */
  impostosTaxas: number;
  /** Frete pago pela loja (etiqueta comprada). */
  fretePago: number;
  lucro: number;
  /** Lucro ÷ receita líquida (total). */
  margem: number;
}

const centavos = (x: number) => Math.round(x * 100) / 100;

/**
 * Do total ao lucro, na mesma conta do DRE (0083):
 *   lucro = subtotal − desconto + entrega − devolvido − custo − imposto − taxa − frete pago.
 * O banco grava cada parte; imposto e taxas são o que sobra entre o total, o custo, o frete e
 * o lucro — assim a conta da tela fecha sempre com o lucro gravado, até em venda antiga.
 */
export function decomporVenda(v: {
  subtotal: number;
  desconto: number;
  valor_entrega: number;
  total: number;
  custo_total: number;
  lucro: number;
  valor_devolvido?: number | null;
  frete_custo?: number | null;
}): DecomposicaoVenda {
  const devolvido = Number(v.valor_devolvido ?? 0);
  const fretePago = Number(v.frete_custo ?? 0);
  const liquido = centavos(Number(v.subtotal) - Number(v.desconto) + Number(v.valor_entrega) - devolvido);
  const impostosTaxas = Math.max(0, centavos(liquido - Number(v.custo_total) - fretePago - Number(v.lucro)));
  return {
    receita: Number(v.subtotal),
    desconto: Number(v.desconto),
    entrega: Number(v.valor_entrega),
    devolvido,
    custoProdutos: Number(v.custo_total),
    impostosTaxas,
    fretePago,
    lucro: Number(v.lucro),
    margem: v.total > 0 ? v.lucro / v.total : 0,
  };
}

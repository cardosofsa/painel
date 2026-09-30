/**
 * Regras puras de Compras (Fase 8.4): nomes de status, o que falta receber, sugestão de
 * compra e leitura da planilha de importação. Cobertas por `compras.test.ts`.
 */

import { quantidadeSugeridaCompra } from "@/lib/alertas";
import { lerNumero, mapearColunas, type ErroImportacao } from "@/lib/importar";

/** Valores gravados no banco (0042). Os nomes antigos continuam; só mudam na tela. */
export type StatusCompra = "pendente" | "em_transito" | "parcial" | "recebido" | "cancelado";

export const STATUS_COMPRA: Record<StatusCompra, { rotulo: string; tom: "positive" | "negative" | "neutral" }> = {
  pendente: { rotulo: "Para comprar", tom: "negative" },
  em_transito: { rotulo: "Em trânsito", tom: "neutral" },
  parcial: { rotulo: "Parcial", tom: "neutral" },
  recebido: { rotulo: "Completado", tom: "positive" },
  cancelado: { rotulo: "Cancelado", tom: "neutral" },
};

export const ORDEM_STATUS: StatusCompra[] = ["pendente", "em_transito", "parcial", "recebido", "cancelado"];

/** Pedido que ainda espera mercadoria (conta como "em aberto"). */
export function statusAberto(s: StatusCompra): boolean {
  return s === "pendente" || s === "em_transito" || s === "parcial";
}

export function faltaReceber(item: { quantidade: number; quantidade_recebida?: number | null }): number {
  return Math.max(0, item.quantidade - (item.quantidade_recebida ?? 0));
}

// ---------- Sugestão de compras ----------

export interface ProdutoSugestao {
  id: string;
  nome: string;
  custo: number;
  estoque: number;
  estoque_minimo: number;
  saida_media_semanal: number;
  fornecedor_id: string | null;
}

export interface LinhaSugestao {
  produto: ProdutoSugestao;
  /** Já pedido e ainda não chegou (pedidos em aberto). */
  emAberto: number;
  sugerido: number;
  motivo: "abaixo_minimo" | "acabando";
}

/**
 * O que comprar agora: abaixo do mínimo, ou que acaba em até `diasAlerta` no ritmo de saída.
 * Desconta o que já está pedido e não chegou — senão a sugestão pede duas vezes a mesma coisa.
 */
export function sugestaoCompras(produtos: ProdutoSugestao[], emAbertoPorProduto: Map<string, number>, diasAlerta = 14): LinhaSugestao[] {
  const linhas: LinhaSugestao[] = [];
  for (const p of produtos) {
    const emAberto = emAbertoPorProduto.get(p.id) ?? 0;
    const disponivel = p.estoque + emAberto;
    const porDia = p.saida_media_semanal / 7;
    const abaixo = disponivel <= p.estoque_minimo;
    const acabando = porDia > 0 && disponivel / porDia <= diasAlerta;
    if (!abaixo && !acabando) continue;
    const sugerido = Math.max(1, quantidadeSugeridaCompra({ estoque: disponivel, estoque_minimo: p.estoque_minimo, saida_media_semanal: p.saida_media_semanal }));
    linhas.push({ produto: p, emAberto, sugerido, motivo: abaixo ? "abaixo_minimo" : "acabando" });
  }
  return linhas.sort((a, b) => a.produto.estoque - a.produto.estoque_minimo - (b.produto.estoque - b.produto.estoque_minimo));
}

// ---------- Importação de pedidos ----------

/** Cabeçalhos aceitos do nosso modelo (e variações comuns de outros sistemas). */
export const COLUNAS_IMPORTACAO = {
  pedido: ["pedido", "numero pedido", "n pedido", "numero temporario", "numero"],
  sku: ["sku", "codigo", "codigo do produto", "sku da variacao"],
  quantidade: ["quantidade", "qtd", "qtde"],
  custo: ["custo unitario", "preco unitario", "custo", "preco", "valor unitario"],
  fornecedor: ["fornecedor", "fornecedores"],
  frete: ["frete", "taxa do frete", "valor do frete"],
  observacao: ["observacao", "observacoes", "obs"],
} as const;

export const CABECALHO_MODELO = ["Pedido", "SKU", "Quantidade", "Custo unitário", "Fornecedor", "Frete", "Observação"];

export interface ItemImportado {
  produto_id: string;
  produto_nome: string;
  quantidade: number;
  custo_unitario: number;
}

export interface PedidoImportado {
  chave: string;
  fornecedor_id: string | null;
  fornecedorNome: string | null;
  frete: number;
  observacao: string | null;
  itens: ItemImportado[];
  linhas: number[];
}

/**
 * Lê a matriz da planilha e agrupa as linhas pelo número do pedido. Nada é gravado aqui:
 * a tela mostra a prévia e os erros por linha, e só grava o que a pessoa confirmar.
 *
 * Regras: SKU precisa existir; quantidade inteira > 0; custo vazio usa o custo do produto;
 * fornecedor/frete/observação valem da PRIMEIRA linha de cada pedido (como no modelo).
 */
export function interpretarImportacaoPedidos(
  matriz: string[][],
  produtosPorSku: Map<string, { id: string; nome: string; custo: number }>,
  fornecedoresPorNome: Map<string, string>,
): { pedidos: PedidoImportado[]; erros: ErroImportacao[] } {
  const { linhas, faltando } = mapearColunas(matriz, COLUNAS_IMPORTACAO, ["sku", "quantidade"]);
  const erros: ErroImportacao[] = [];
  if (faltando.length) {
    return { pedidos: [], erros: [{ linha: 1, mensagem: `Faltam as colunas: ${faltando.map((f) => (f === "sku" ? "SKU" : "Quantidade")).join(", ")}. Use o modelo.` }] };
  }
  const grupos = new Map<string, PedidoImportado>();
  for (const l of linhas) {
    const sku = (l.sku ?? "").trim();
    if (!sku && !(l.quantidade ?? "").trim()) continue; // linha vazia
    const produto = produtosPorSku.get(sku.toLowerCase());
    if (!sku) {
      erros.push({ linha: l.__linha, mensagem: "SKU vazio." });
      continue;
    }
    if (!produto) {
      erros.push({ linha: l.__linha, mensagem: `SKU "${sku}" não existe nos seus produtos.` });
      continue;
    }
    const qtd = lerNumero(l.quantidade);
    if (qtd == null || qtd <= 0 || !Number.isInteger(qtd)) {
      erros.push({ linha: l.__linha, mensagem: `Quantidade inválida para "${sku}".` });
      continue;
    }
    const custoLido = lerNumero(l.custo);
    if (custoLido != null && custoLido < 0) {
      erros.push({ linha: l.__linha, mensagem: `Custo negativo para "${sku}".` });
      continue;
    }
    const chave = (l.pedido ?? "").trim() || "1";
    let g = grupos.get(chave);
    if (!g) {
      const nomeFornecedor = (l.fornecedor ?? "").trim() || null;
      const fornecedorId = nomeFornecedor ? (fornecedoresPorNome.get(nomeFornecedor.toLowerCase()) ?? null) : null;
      if (nomeFornecedor && !fornecedorId) erros.push({ linha: l.__linha, mensagem: `Fornecedor "${nomeFornecedor}" não cadastrado: o pedido ${chave} usa o fornecedor escolhido na tela.` });
      g = { chave, fornecedor_id: fornecedorId, fornecedorNome: nomeFornecedor, frete: Math.max(0, lerNumero(l.frete) ?? 0), observacao: (l.observacao ?? "").trim() || null, itens: [], linhas: [] };
      grupos.set(chave, g);
    }
    g.itens.push({ produto_id: produto.id, produto_nome: produto.nome, quantidade: qtd, custo_unitario: custoLido ?? produto.custo });
    g.linhas.push(l.__linha);
  }
  return { pedidos: [...grupos.values()].filter((g) => g.itens.length > 0), erros };
}

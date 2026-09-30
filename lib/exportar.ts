/**
 * Exportação de listas (produtos, pedidos de compra, movimentações, vendas…) em .xlsx,
 * .pdf, imagem ou .csv. Aqui mora só a parte PURA: a tabela e a formatação de cada célula,
 * coberta por `exportar.test.ts`. A geração dos arquivos (que carrega exceljs/jspdf só no
 * clique) fica em `exportar-arquivos.ts`.
 */

import { formatBRL, formatarDataIso } from "@/lib/format";
import { escaparCampo, matrizParaCsv } from "@/lib/csv";

export type TipoColuna = "texto" | "moeda" | "numero" | "inteiro" | "percentual" | "data";

export interface ColunaExport<L> {
  rotulo: string;
  tipo?: TipoColuna;
  /** Largura aproximada em caracteres (xlsx e PDF). */
  largura?: number;
  valor: (linha: L) => string | number | null | undefined;
}

export interface TabelaExport<L = unknown> {
  titulo: string;
  /** Linha abaixo do título: filtro aplicado, período, armazém… */
  subtitulo?: string;
  colunas: ColunaExport<L>[];
  linhas: L[];
  /** Linha de total opcional, na mesma ordem das colunas (null = célula vazia). */
  total?: (string | number | null)[];
}

const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Texto que vai para planilha. Mesma regra de `escaparCampo` (lib/csv.ts): nome digitado
 * por visitante da vitrine pode começar com `=` e virar fórmula no Excel.
 */
export function textoSeguro(valor: unknown): string {
  const bruto = String(valor ?? "");
  return INICIO_DE_FORMULA.test(bruto) && !/^[+-]?\d+([.,]\d+)?$/.test(bruto) ? `'${bruto}` : bruto;
}

/** Valor da célula no xlsx: número fica número (soma no Excel), o resto vira texto seguro. */
export function celulaPlanilha(valor: string | number | null | undefined, tipo: TipoColuna = "texto"): string | number | Date | null {
  if (valor == null || valor === "") return null;
  if (tipo === "data") {
    const s = String(valor);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
    return Number.isNaN(d.getTime()) ? textoSeguro(s) : d;
  }
  if (tipo !== "texto") {
    const n = typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
    return Number.isFinite(n) ? n : textoSeguro(valor);
  }
  return textoSeguro(valor);
}

/** Valor já formatado para leitura (PDF, imagem): "R$ 1.234,50", "12,5%", "30/09/2026". */
export function celulaTexto(valor: string | number | null | undefined, tipo: TipoColuna = "texto"): string {
  if (valor == null || valor === "") return "";
  const n = typeof valor === "number" ? valor : Number(valor);
  switch (tipo) {
    case "moeda":
      return Number.isFinite(n) ? formatBRL(n) : String(valor);
    case "percentual":
      return Number.isFinite(n) ? `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : String(valor);
    case "numero":
      return Number.isFinite(n) ? n.toLocaleString("pt-BR", { maximumFractionDigits: 3 }) : String(valor);
    case "inteiro":
      return Number.isFinite(n) ? Math.round(n).toLocaleString("pt-BR") : String(valor);
    case "data": {
      const s = String(valor);
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? formatarDataIso(s.slice(0, 10)) : s;
    }
    default:
      return String(valor);
  }
}

/** Matriz de textos (cabeçalho + linhas + total), usada no PDF e na imagem. */
export function matrizTexto<L>(t: TabelaExport<L>): { cabecalho: string[]; linhas: string[][]; total: string[] | null } {
  return {
    cabecalho: t.colunas.map((c) => c.rotulo),
    linhas: t.linhas.map((l) => t.colunas.map((c) => celulaTexto(c.valor(l), c.tipo))),
    total: t.total ? t.total.map((v, i) => (v == null ? "" : typeof v === "number" ? celulaTexto(v, t.colunas[i]?.tipo) : String(v))) : null,
  };
}

/** CSV com número cru (ponto decimal troca por vírgula no Excel pt-BR via BOM + separador ","). */
export function tabelaParaCsv<L>(t: TabelaExport<L>): string {
  const cabecalho = t.colunas.map((c) => c.rotulo);
  const linhas = t.linhas.map((l) =>
    t.colunas.map((c) => {
      const v = c.valor(l);
      if (v == null) return "";
      if (c.tipo && c.tipo !== "texto" && c.tipo !== "data" && typeof v === "number") return v;
      return c.tipo === "data" ? celulaTexto(v, "data") : String(v);
    }),
  );
  return matrizParaCsv([cabecalho, ...linhas]);
}

/** Nome de arquivo sem acento nem espaço: "Pedidos de compra" → "pedidos-de-compra-2026-09-30". */
export function nomeArquivo(base: string, extensao: string, hoje = new Date()): string {
  const slug = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "exportacao"}-${hoje.toLocaleDateString("sv-SE")}.${extensao}`;
}

export { escaparCampo };

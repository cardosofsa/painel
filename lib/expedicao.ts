/**
 * Documentos de expedição impressos em massa (como no ERP): lista de separação, lista de
 * resumo e romaneio. PURO — monta `TabelaExport`, e o PDF sai pelo `gerarPdf` que já existe.
 * Coberto por `expedicao.test.ts`.
 */

import type { TabelaExport } from "@/lib/exportar";
import type { PedidoCentral } from "@/lib/pedidos-central";

export interface LinhaSeparacao {
  sku: string;
  produto: string;
  quantidade: number;
  pedidos: number;
}

/** Produtos somados por SKU (ou nome, sem SKU), para o galpão separar de uma vez. */
export function listaSeparacao(pedidos: PedidoCentral[]): TabelaExport<LinhaSeparacao> {
  const m = new Map<string, LinhaSeparacao & { chaves: Set<string> }>();
  for (const p of pedidos) {
    for (const i of p.itens) {
      const chave = (i.sku?.trim() || `nome:${i.nome}`).toLowerCase();
      const atual = m.get(chave) ?? { sku: i.sku?.trim() || "—", produto: i.nome, quantidade: 0, pedidos: 0, chaves: new Set<string>() };
      atual.quantidade += i.quantidade;
      atual.chaves.add(p.chave);
      atual.pedidos = atual.chaves.size;
      m.set(chave, atual);
    }
  }
  const linhas = [...m.values()]
    .map(({ chaves: _chaves, ...l }) => (void _chaves, l))
    .sort((a, b) => a.sku.localeCompare(b.sku, "pt-BR") || a.produto.localeCompare(b.produto, "pt-BR"));
  return {
    titulo: "Lista de separação",
    subtitulo: `${pedidos.length} pedido(s) · ${linhas.reduce((s, l) => s + l.quantidade, 0)} unidade(s)`,
    colunas: [
      { rotulo: "SKU", largura: 18, valor: (l) => l.sku },
      { rotulo: "Produto", largura: 46, valor: (l) => l.produto },
      { rotulo: "Qtd", tipo: "inteiro", valor: (l) => l.quantidade },
      { rotulo: "Pedidos", tipo: "inteiro", valor: (l) => l.pedidos },
      { rotulo: "Separado", valor: () => "[   ]" },
    ],
    linhas,
    total: ["Total", null, linhas.reduce((s, l) => s + l.quantidade, 0), pedidos.length, null],
  };
}

export interface LinhaResumo {
  pedido: string;
  canal: string;
  cliente: string;
  produto: string;
  sku: string;
  quantidade: number;
}

/** Pedido × itens, na ordem da tela (para conferir pedido a pedido). */
export function listaResumo(pedidos: PedidoCentral[]): TabelaExport<LinhaResumo> {
  const linhas: LinhaResumo[] = [];
  for (const p of pedidos) {
    p.itens.forEach((i, n) =>
      linhas.push({
        pedido: n === 0 ? p.numero : "",
        canal: n === 0 ? (p.loja ? `${p.canal} · ${p.loja}` : p.canal) : "",
        cliente: n === 0 ? (p.cliente ?? "") : "",
        produto: i.nome,
        sku: i.sku ?? "",
        quantidade: i.quantidade,
      }),
    );
  }
  return {
    titulo: "Lista de resumo",
    subtitulo: `${pedidos.length} pedido(s)`,
    colunas: [
      { rotulo: "Pedido", largura: 16, valor: (l) => l.pedido },
      { rotulo: "Canal", largura: 20, valor: (l) => l.canal },
      { rotulo: "Cliente", largura: 20, valor: (l) => l.cliente },
      { rotulo: "Produto", largura: 36, valor: (l) => l.produto },
      { rotulo: "SKU", largura: 16, valor: (l) => l.sku },
      { rotulo: "Qtd", tipo: "inteiro", valor: (l) => l.quantidade },
    ],
    linhas,
  };
}

export interface LinhaRomaneio {
  pedido: string;
  destinatario: string;
  destino: string;
  logistica: string;
  volumes: number;
}

/** Romaneio de coleta: um pedido por linha e espaço para a assinatura de quem retira. */
export function romaneio(pedidos: PedidoCentral[], rastreios: Record<string, string | null> = {}): TabelaExport<LinhaRomaneio & { rastreio: string }> {
  const linhas = pedidos.map((p) => ({
    pedido: p.numeroExterno && p.numeroExterno !== p.numero ? `${p.numero} (${p.numeroExterno})` : p.numero,
    destinatario: p.cliente ?? "",
    destino: [p.cidade, p.uf].filter(Boolean).join("/"),
    logistica: p.logistica ?? "",
    volumes: 1,
    rastreio: rastreios[p.chave] ?? "",
  }));
  const logisticas = [...new Set(linhas.map((l) => l.logistica).filter(Boolean))];
  return {
    titulo: "Romaneio de coleta",
    subtitulo: `${linhas.length} pacote(s)${logisticas.length ? ` · ${logisticas.join(", ")}` : ""} · Data: ____/____/______`,
    colunas: [
      { rotulo: "Pedido", largura: 22, valor: (l) => l.pedido },
      { rotulo: "Destinatário", largura: 26, valor: (l) => l.destinatario },
      { rotulo: "Destino", largura: 18, valor: (l) => l.destino },
      { rotulo: "Logística", largura: 18, valor: (l) => l.logistica },
      { rotulo: "Rastreio", largura: 20, valor: (l) => l.rastreio },
      { rotulo: "Vol.", tipo: "inteiro", valor: (l) => l.volumes },
    ],
    linhas,
    total: [`Total: ${linhas.length} pacote(s)`, "Assinatura de quem retirou: ______________________", null, "Documento: ____________", null, linhas.length],
  };
}

/** Cor estável para uma tag (mesma tag, mesma cor). */
export function corDaTag(tag: string): number {
  let h = 0;
  for (const c of tag.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h % 6;
}

/** "urgente, Brinde,  urgente " → ["urgente", "Brinde"] (sem repetidas, até 8, 24 letras). */
export function normalizarTags(texto: string): string[] {
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const t of texto.split(/[,;\n]/)) {
    const tag = t.trim().replace(/\s+/g, " ").slice(0, 24);
    if (!tag || vistas.has(tag.toLowerCase())) continue;
    vistas.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= 8) break;
  }
  return out;
}

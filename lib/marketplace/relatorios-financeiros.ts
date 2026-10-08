/**
 * Relatórios financeiros exportados dos marketplaces (Fase 13.3): gasto com anúncios
 * (Shopee Ads) e repasses liberados (Shopee "Minha Renda", liberações do Mercado Livre).
 * PURO, coberto por `relatorios-financeiros.test.ts`.
 *
 * As plataformas mudam nome de coluna sem avisar e põem um preâmbulo (loja, período) antes
 * do cabeçalho. Por isso: a linha do cabeçalho é procurada nas primeiras 30 linhas, cada
 * coluna aceita vários apelidos (pt e en) e, faltando uma obrigatória, o erro lista os
 * cabeçalhos que a planilha tem — para a pessoa saber o que mandar de volta.
 */

import { lerNumero, mapearColunas, normalizarCabecalho, type ErroImportacao } from "@/lib/importar";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** "01/09/2026", "1/9/2026", "2026-09-01", "2026-09-01T03:00:00Z", "01-09-2026" → "2026-09-01". */
export function lerDataRelatorio(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Primeira linha (até a 30ª) que tem alguma das colunas-chave. */
function linhaDoCabecalho(matriz: string[][], chaves: readonly string[]): number {
  const alvo = chaves.map(normalizarCabecalho);
  for (let i = 0; i < Math.min(30, matriz.length); i++) {
    const cab = matriz[i].map(normalizarCabecalho);
    if (cab.some((h) => alvo.includes(h))) return i;
  }
  return 0;
}

function cabecalhosAchados(matriz: string[][], linha: number): string {
  return (matriz[linha] ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 20).join(", ");
}

// ---------- Shopee Ads ----------

const APELIDOS_ADS = {
  campanha: ["nome do anuncio", "anuncio", "nome da campanha", "campanha", "ad name", "campaign name", "nome"],
  valor: ["despesas", "despesa", "gasto", "gastos", "custo", "investimento", "expense", "spend", "cost"],
  pedidos: ["conversoes", "pedidos", "itens vendidos", "orders", "conversions"],
  vendas: ["gmv", "receita", "vendas", "receita direta", "sales"],
  sku: ["sku", "id do produto", "product id", "id do item"],
} as const;

export interface LinhaAnuncio {
  campanha: string;
  sku: string | null;
  valor: number;
  pedidos: number | null;
  vendas: number | null;
}

export interface RelatorioAnuncios {
  /** Período lido do preâmbulo ("01/09/2026 - 30/09/2026"); null = a pessoa informa. */
  periodo: { inicio: string; fim: string } | null;
  linhas: LinhaAnuncio[];
  total: number;
  erros: ErroImportacao[];
  faltando: string[];
}

export function interpretarRelatorioAnuncios(matriz: string[][]): RelatorioAnuncios {
  const cab = linhaDoCabecalho(matriz, [...APELIDOS_ADS.campanha, ...APELIDOS_ADS.valor]);
  // Período: duas datas numa das linhas antes do cabeçalho.
  let periodo: RelatorioAnuncios["periodo"] = null;
  for (const linha of matriz.slice(0, cab)) {
    const datas = linha.join(" ").match(/\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/g) ?? [];
    if (datas.length >= 2) {
      const [a, b] = [lerDataRelatorio(datas[0]), lerDataRelatorio(datas[1])];
      if (a && b) periodo = a <= b ? { inicio: a, fim: b } : { inicio: b, fim: a };
      break;
    }
  }
  const { linhas, faltando } = mapearColunas(matriz, APELIDOS_ADS, ["campanha", "valor"], cab);
  if (faltando.length) {
    return { periodo, linhas: [], total: 0, erros: [{ linha: cab + 1, mensagem: `Não achei as colunas ${faltando.join(" e ")}. A planilha tem: ${cabecalhosAchados(matriz, cab)}.` }], faltando };
  }
  const erros: ErroImportacao[] = [];
  const saida = new Map<string, LinhaAnuncio>();
  for (const l of linhas) {
    const campanha = (l.campanha ?? "").trim();
    if (!campanha || /^(total|soma|-)$/i.test(campanha)) continue;
    const valor = lerNumero(l.valor ?? "");
    if (valor === null) {
      erros.push({ linha: l.__linha, mensagem: `"${campanha}": gasto inválido (${l.valor || "vazio"}).` });
      continue;
    }
    if (valor <= 0) continue;
    // Mesmo anúncio em mais de uma linha (um por posicionamento) soma.
    const atual = saida.get(campanha);
    const pedidos = lerNumero(l.pedidos ?? "");
    const vendas = lerNumero(l.vendas ?? "");
    saida.set(campanha, {
      campanha: campanha.slice(0, 200),
      sku: (l.sku ?? "").trim().slice(0, 100) || atual?.sku || null,
      valor: r2((atual?.valor ?? 0) + valor),
      pedidos: pedidos === null && atual?.pedidos == null ? null : (atual?.pedidos ?? 0) + (pedidos ?? 0),
      vendas: vendas === null && atual?.vendas == null ? null : r2((atual?.vendas ?? 0) + (vendas ?? 0)),
    });
  }
  const lista = [...saida.values()];
  return { periodo, linhas: lista, total: r2(lista.reduce((s, x) => s + x.valor, 0)), erros, faltando: [] };
}

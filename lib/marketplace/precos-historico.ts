/**
 * Histórico de preço dos anúncios sincronizados (0102). Puro, coberto por
 * `precos-historico.test.ts`: dado o preço de antes e o de agora de cada anúncio, diz o que
 * entra no histórico. Só entra quando muda (ou na primeira leitura), para o histórico contar
 * as mudanças e não as sincronizações.
 */
export interface PrecoLido {
  id: string;
  preco: number | null;
}

export function precosQueMudaram(antes: Map<string, number | null>, depois: PrecoLido[]): { anuncio_id: string; preco: number }[] {
  const saida: { anuncio_id: string; preco: number }[] = [];
  for (const d of depois) {
    if (d.preco === null || !(d.preco > 0)) continue;
    const anterior = antes.get(d.id);
    if (anterior !== undefined && anterior !== null && Math.abs(anterior - d.preco) < 0.005) continue;
    saida.push({ anuncio_id: d.id, preco: Math.round(d.preco * 100) / 100 });
  }
  return saida;
}

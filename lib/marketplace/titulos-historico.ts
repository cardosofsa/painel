/**
 * Versões do título de um anúncio × vendas (0104). Puro, coberto por `titulos-historico.test.ts`.
 *
 * - `titulosQueMudaram`: o que a sincronização grava no histórico. Compara com a ÚLTIMA versão
 *   guardada (não com a leitura anterior), então a primeira sincronização depois da 0104 já
 *   registra o título de hoje como ponto de partida.
 * - `compararVersoes`: cada versão vale do momento em que foi lida até a seguinte; as vendas do
 *   período vêm somadas do banco. A comparação é por DIA (versões duram tempos diferentes) e
 *   avisa quando o período é curto demais para concluir algo.
 */

/** Abaixo disso, a versão não teve tempo de mostrar resultado. */
export const DIAS_MINIMOS_VERSAO = 7;

const DIA_MS = 24 * 60 * 60 * 1000;
const limpar = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

export function titulosQueMudaram(ultimo: Map<string, string>, atuais: { id: string; titulo: string | null | undefined }[]): { anuncio_id: string; titulo: string }[] {
  const saida: { anuncio_id: string; titulo: string }[] = [];
  for (const a of atuais) {
    const titulo = limpar(a.titulo).slice(0, 300);
    if (!titulo) continue;
    if (limpar(ultimo.get(a.id)) === titulo) continue;
    saida.push({ anuncio_id: a.id, titulo });
  }
  return saida;
}

export interface VersaoTitulo {
  titulo: string;
  /** ISO: quando esta versão foi lida (ou criada pelo Painel). */
  desde: string;
  origem: "sincronizacao" | "painel";
}

export interface VendasPeriodo {
  unidades: number;
  receita: number;
  pedidos: number;
}

export interface VersaoComparada extends VersaoTitulo {
  ate: string | null;
  dias: number;
  unidades: number;
  receita: number;
  pedidos: number;
  unidadesPorDia: number;
  /** Unidades por dia em relação à versão anterior (0,25 = +25%); null na primeira ou se a anterior não vendeu. */
  variacao: number | null;
  /** Período curto demais para concluir (menos de `DIAS_MINIMOS_VERSAO` dias). */
  poucoTempo: boolean;
  atual: boolean;
}

/**
 * Períodos de cada versão, em ordem cronológica (para o servidor somar as vendas de cada um).
 * Versões repetidas em seguida (mesmo título) viram uma só.
 */
export function periodosDasVersoes(versoes: VersaoTitulo[]): (VersaoTitulo & { ate: string | null })[] {
  const ordenadas = [...versoes].sort((a, b) => a.desde.localeCompare(b.desde));
  const unicas: VersaoTitulo[] = [];
  for (const v of ordenadas) {
    if (unicas.length && limpar(unicas[unicas.length - 1].titulo) === limpar(v.titulo)) continue;
    unicas.push(v);
  }
  return unicas.map((v, i) => ({ ...v, ate: unicas[i + 1]?.desde ?? null }));
}

export function compararVersoes(periodos: (VersaoTitulo & { ate: string | null })[], vendas: VendasPeriodo[], agora: Date): VersaoComparada[] {
  const saida: VersaoComparada[] = [];
  periodos.forEach((p, i) => {
    const v = vendas[i] ?? { unidades: 0, receita: 0, pedidos: 0 };
    const fim = p.ate ? new Date(p.ate).getTime() : agora.getTime();
    const dias = Math.max(0, (fim - new Date(p.desde).getTime()) / DIA_MS);
    // Menos de um dia conta como um dia: evita "por dia" gigante numa versão de horas.
    const porDia = v.unidades / Math.max(1, dias);
    const anterior = saida[i - 1];
    saida.push({
      ...p,
      dias: Math.round(dias * 10) / 10,
      unidades: v.unidades,
      receita: v.receita,
      pedidos: v.pedidos,
      unidadesPorDia: Math.round(porDia * 100) / 100,
      variacao: anterior && anterior.unidadesPorDia > 0 ? Math.round((porDia / anterior.unidadesPorDia - 1) * 1000) / 1000 : null,
      poucoTempo: dias < DIAS_MINIMOS_VERSAO,
      atual: p.ate === null,
    });
  });
  return saida;
}

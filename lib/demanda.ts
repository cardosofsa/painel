/**
 * Previsão de demanda (Fase 5, onda A): em vez da média reta dos últimos 60 dias, olha a
 * venda semana a semana (12 semanas) e segue a tendência. Produto que está acelerando pede
 * mais; o que está esfriando, menos. Puro, coberto por `demanda.test.ts`.
 *
 * Método: suavização exponencial dupla (Holt), com α = 0,5 para o nível e β = 0,3 para a
 * tendência, prevendo a média das próximas 4 semanas. Com pouco histórico (menos de 3
 * semanas com venda), fica na média simples: tendência de 2 pontos é ruído.
 */

export type Tendencia = "subindo" | "estavel" | "caindo";

export interface PrevisaoDemanda {
  /** Unidades por dia previstas para as próximas semanas. */
  porDia: number;
  /** Média simples das semanas observadas (unidades/semana), para comparar. */
  mediaSemanal: number;
  tendencia: Tendencia;
  /** Quantas das semanas tiveram venda. */
  semanasComVenda: number;
}

const ALFA = 0.5;
const BETA = 0.3;
const HORIZONTE = 4;
const LIMIAR_TENDENCIA = 0.15;

/** `serie`: unidades por semana, da mais antiga para a mais recente. */
export function preverDemanda(serie: number[]): PrevisaoDemanda {
  const n = serie.length;
  const total = serie.reduce((s, v) => s + Math.max(0, v), 0);
  const mediaSemanal = n ? total / n : 0;
  const semanasComVenda = serie.filter((v) => v > 0).length;
  if (!n || total <= 0) return { porDia: 0, mediaSemanal: 0, tendencia: "estavel", semanasComVenda: 0 };
  if (semanasComVenda < 3 || n < 4) return { porDia: mediaSemanal / 7, mediaSemanal, tendencia: "estavel", semanasComVenda };

  let nivel = (serie[0] + serie[1]) / 2;
  let tend = serie[1] - serie[0];
  for (let i = 2; i < n; i++) {
    const anterior = nivel;
    nivel = ALFA * serie[i] + (1 - ALFA) * (nivel + tend);
    tend = BETA * (nivel - anterior) + (1 - BETA) * tend;
  }
  // Média das próximas HORIZONTE semanas: nível + tendência × (1 + 2 + … + H) / H.
  let semanal = nivel + (tend * (HORIZONTE + 1)) / 2;
  // Trava: nem negativo, nem mais que o triplo do que já se vendeu em média.
  semanal = Math.min(Math.max(0, semanal), mediaSemanal * 3);

  // Tendência = a previsão contra a média do período: 15% acima ou abaixo já conta.
  const razao = semanal / mediaSemanal;
  const tendencia: Tendencia = razao > 1 + LIMIAR_TENDENCIA ? "subindo" : razao < 1 - LIMIAR_TENDENCIA ? "caindo" : "estavel";
  return { porDia: semanal / 7, mediaSemanal, tendencia, semanasComVenda };
}

/**
 * Venda por semana de cada produto, `semanas` semanas até `hoje` (a última é a semana
 * corrente, contada pelos últimos 7 dias). Kit vendido conta em cada componente.
 */
export function vendasPorSemana(
  vendas: { produto_id: string | null; quantidade: number; data: string | null }[],
  semanas: number,
  hoje: Date,
  kits: Map<string, { produto_id: string; quantidade: number }[]> = new Map(),
): Map<string, number[]> {
  const fim = hoje.getTime();
  const series = new Map<string, number[]>();
  const somar = (id: string, idx: number, q: number) => {
    let s = series.get(id);
    if (!s) {
      s = new Array(semanas).fill(0);
      series.set(id, s);
    }
    s[idx] += q;
  };
  for (const v of vendas) {
    if (!v.produto_id || !v.data || v.quantidade <= 0) continue;
    const t = new Date(v.data).getTime();
    if (!Number.isFinite(t) || t > fim) continue;
    const atras = Math.floor((fim - t) / (7 * 86_400_000));
    if (atras >= semanas) continue;
    const idx = semanas - 1 - atras;
    const comp = kits.get(v.produto_id);
    if (comp?.length) for (const c of comp) somar(c.produto_id, idx, v.quantidade * c.quantidade);
    else somar(v.produto_id, idx, v.quantidade);
  }
  return series;
}

export const ROTULO_TENDENCIA: Record<Tendencia, string> = {
  subindo: "Vendas subindo",
  estavel: "Vendas estáveis",
  caindo: "Vendas caindo",
};

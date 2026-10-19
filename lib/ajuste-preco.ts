/**
 * Ajuste de Preço: para um produto numa loja, o preço mínimo, o ideal, o máximo de
 * REFERÊNCIA, as faixas de comissão e as zonas mortas, e o resultado em qualquer preço que a
 * pessoa arrastar na régua. Puro, coberto por `ajuste-preco.test.ts`; as contas são as de
 * `lib/pricing.ts` e `lib/raio-x.ts`.
 */
import { encontrarFaixa, zonaMortaDeFaixa, type FaixaComissao, type ResultadoPrecificacao, type TaxasPlataforma } from "./pricing";
import { precoIdeal, precoMinimo, resultadoNoPreco } from "./raio-x";
import type { LojaParaPreco } from "./precos-loja";
import { rotuloTaxaFaixa } from "./faixas";

export interface EntradaAjuste {
  custo: number;
  loja: LojaParaPreco;
  /** Frações (0,06 = 6%). */
  impostoPct: number;
  margemAlvo: number;
  /** Margem mínima aceitável (padrão 10%). */
  margemMinima?: number;
  precoAtual: number | null;
  concorrentes: number[];
  /** Unidades vendidas em 30 dias (0 = não se sabe). */
  vendas30d: number;
  /** Para as regras de giro e de kit (opcionais). */
  estoque?: number;
  tendencia?: "subindo" | "estavel" | "caindo";
  /** Unidades vendidas por dia, previstas (lib/demanda). */
  vendaPorDia?: number;
  kits?: { id: string; nome: string }[];
}

export interface FaixaNaRegua {
  min: number;
  max: number | null;
  rotulo: string;
}

export interface Ajuste {
  /** Lucro zero. */
  precoMinimo: number | null;
  /** Atinge a margem mínima. */
  precoMinimoMargem: number | null;
  precoIdeal: number | null;
  /** Referência, não garantia: não há dado de elasticidade. */
  precoMaximo: number | null;
  motivoMaximo: string | null;
  faixas: FaixaNaRegua[];
  zonasMortas: { inicio: number; fim: number }[];
  atual: ResultadoPrecificacao | null;
  escala: { de: number; ate: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const usaFaixas = (l: LojaParaPreco) => l.tipoTaxa === "faixas" && l.faixas.length > 0;

export function contextoDoAjuste(e: EntradaAjuste): { custo: number; taxas: TaxasPlataforma; faixas: FaixaComissao[] } {
  return {
    custo: e.custo,
    taxas: {
      impostoPct: e.impostoPct,
      taxaAdicionalPct: 0,
      taxaVariavelPct: e.loja.comissaoPct / 100,
      taxaFixa: e.loja.taxaFixa,
      taxaExtraValor: e.loja.taxaExtraValor ?? undefined,
      taxaExtraTipo: e.loja.taxaExtraTipo,
    },
    faixas: usaFaixas(e.loja) ? e.loja.faixas : [],
  };
}

/** O próximo preço "x,90" a partir de `preco` (para cima). */
export function psicologicoAcima(preco: number): number {
  const base = Math.floor(preco);
  return r2(base + 0.9 >= preco ? base + 0.9 : base + 1.9);
}

/** Resultado (lucro, margem, taxas) e faixa de comissão num preço qualquer. */
export function noPreco(e: EntradaAjuste, preco: number): { resultado: ResultadoPrecificacao; faixa: FaixaComissao | null; porMes: number | null } {
  const ctx = contextoDoAjuste(e);
  const resultado = resultadoNoPreco(ctx, preco);
  return {
    resultado,
    faixa: ctx.faixas.length ? encontrarFaixa(ctx.faixas, preco) : null,
    porMes: e.vendas30d > 0 ? r2(resultado.lucroLiquido * e.vendas30d) : null,
  };
}

export function calcularAjuste(e: EntradaAjuste): Ajuste {
  const ctx = contextoDoAjuste(e);
  const minimo = precoMinimo(ctx);
  const comMargem = precoIdeal({ ...ctx, margemAlvo: e.margemMinima ?? 0.1 });
  const ideal = precoIdeal({ ...ctx, margemAlvo: e.margemAlvo });
  const idealPreco = ideal.viavel ? ideal.precoVenda : null;

  // Máximo de referência: o MENOR entre o último preço antes da faixa seguinte, o maior
  // concorrente e o preço "x,90" mais próximo — sempre a partir do ideal.
  let precoMaximo: number | null = null;
  let motivoMaximo: string | null = null;
  if (idealPreco !== null) {
    const candidatos: { preco: number; motivo: string }[] = [];
    const proxima = ctx.faixas.filter((f) => f.min > idealPreco).sort((a, b) => a.min - b.min)[0];
    if (proxima) candidatos.push({ preco: r2(proxima.min - 0.01), motivo: "último preço antes da faixa de comissão seguinte" });
    const concorrentes = e.concorrentes.filter((c) => c > idealPreco);
    if (concorrentes.length) candidatos.push({ preco: Math.max(...concorrentes), motivo: "maior preço de concorrente cadastrado" });
    candidatos.push({ preco: psicologicoAcima(idealPreco), motivo: "preço psicológico mais próximo" });
    const menor = candidatos.reduce((a, b) => (b.preco < a.preco ? b : a));
    precoMaximo = menor.preco;
    motivoMaximo = menor.motivo;
  }

  const base = { impostoPct: ctx.taxas.impostoPct, taxaAdicionalPct: 0, taxaExtraValor: ctx.taxas.taxaExtraValor, taxaExtraTipo: ctx.taxas.taxaExtraTipo };
  const zonasMortas = ctx.faixas
    .filter((f) => f.min > 0)
    .map((f) => zonaMortaDeFaixa(ctx.faixas, f.min, base))
    .filter((z): z is NonNullable<typeof z> => z !== null)
    .map((z) => ({ inicio: z.inicio, fim: z.fim }));

  const pontos = [minimo, idealPreco, precoMaximo, e.precoAtual].filter((p): p is number => p !== null && p > 0);
  const de = pontos.length ? Math.max(0, Math.floor(Math.min(...pontos) * 0.85)) : 0;
  const ate = pontos.length ? Math.ceil(Math.max(...pontos) * 1.15) : 100;

  return {
    precoMinimo: minimo,
    precoMinimoMargem: comMargem.viavel ? comMargem.precoVenda : null,
    precoIdeal: idealPreco,
    precoMaximo,
    motivoMaximo,
    faixas: [...ctx.faixas].sort((a, b) => a.min - b.min).map((f) => ({ min: f.min, max: f.max, rotulo: rotuloTaxaFaixa(f) })),
    zonasMortas,
    atual: e.precoAtual && e.precoAtual > 0 ? resultadoNoPreco(ctx, e.precoAtual) : null,
    escala: { de, ate: Math.max(ate, de + 1) },
  };
}

/** Posição de um preço na régua, em % (0 a 100). */
export function posicaoNaRegua(preco: number, escala: { de: number; ate: number }): number {
  return Math.max(0, Math.min(100, ((preco - escala.de) / (escala.ate - escala.de)) * 100));
}

export interface EstrategiaAjuste {
  id: "subir_na_faixa" | "sair_zona_morta" | "abaixo_minimo" | "abaixo_margem" | "acima_maximo" | "giro" | "kit";
  titulo: string;
  detalhe: string;
  /** Preço sugerido pela regra (clicar aplica na régua). */
  preco: number | null;
}

/**
 * Estratégias por regra (sem IA), para o preço que está na régua. A IA, quando entrar, só
 * explica e prioriza estas — não inventa outras com números próprios.
 */
export function estrategiasDeAjuste(e: EntradaAjuste, a: Ajuste, preco: number): EstrategiaAjuste[] {
  const lista: EstrategiaAjuste[] = [];
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const ctx = contextoDoAjuste(e);
  const lucro = (p: number) => resultadoNoPreco(ctx, p).lucroLiquido;

  if (a.precoMinimo !== null && preco < a.precoMinimo) {
    lista.push({ id: "abaixo_minimo", titulo: "Cada venda dá prejuízo", detalhe: `Abaixo de ${brl(a.precoMinimo)} você paga para vender.`, preco: a.precoMinimo });
  } else if (a.precoMinimoMargem !== null && preco < a.precoMinimoMargem) {
    lista.push({ id: "abaixo_margem", titulo: "Margem abaixo do mínimo", detalhe: `Para ter ${Math.round((e.margemMinima ?? 0.1) * 100)}% de margem, o preço precisa ser ${brl(a.precoMinimoMargem)}.`, preco: a.precoMinimoMargem });
  }

  const zona = a.zonasMortas.find((z) => preco >= z.inicio && preco <= z.fim);
  if (zona) {
    const melhor = r2(zona.inicio - 0.01);
    lista.push({ id: "sair_zona_morta", titulo: "Sair da zona morta", detalhe: `Entre ${brl(zona.inicio)} e ${brl(zona.fim)} você recebe menos que a ${brl(melhor)}: baixe e ganhe ${brl(r2(lucro(melhor) - lucro(preco)))} a mais por venda.`, preco: melhor });
  } else if (ctx.faixas.length) {
    const faixa = encontrarFaixa(ctx.faixas, preco);
    // Até o fim da faixa, mas sem passar do máximo de referência (não sugerir o que a régua desaconselha).
    const alvo = faixa.max !== null ? Math.min(faixa.max, a.precoMaximo ?? faixa.max) : null;
    if (alvo !== null && alvo - preco >= 0.5) {
      const ganho = r2(lucro(alvo) - lucro(preco));
      if (ganho > 0) lista.push({ id: "subir_na_faixa", titulo: `Subir até ${brl(alvo)} sem mudar de faixa`, detalhe: `A comissão continua a mesma e você ganha ${brl(ganho)} a mais por venda.`, preco: alvo });
    }
  }

  // Giro: muito estoque para a venda de hoje e a venda caindo. Um preço de entrada, sem
  // descer abaixo da margem mínima.
  const dias = e.vendaPorDia && e.vendaPorDia > 0 ? (e.estoque ?? 0) / e.vendaPorDia : null;
  if (e.tendencia === "caindo" && (e.estoque ?? 0) >= 5 && dias !== null && dias >= 45 && a.precoMinimoMargem !== null) {
    const entrada = r2(Math.max(a.precoMinimoMargem, preco * 0.93));
    if (entrada < preco - 0.01) lista.push({ id: "giro", titulo: "Preço de entrada para girar o estoque", detalhe: `O estoque dá para ${Math.round(dias)} dias e a venda está caindo. Testar ${brl(entrada)} por algumas semanas, sem sair da margem mínima.`, preco: entrada });
  }
  if (e.kits && e.kits.length) {
    lista.push({ id: "kit", titulo: "Vender também em kit", detalhe: `${e.kits.map((k) => k.nome).slice(0, 2).join(" e ")} já ${e.kits.length > 1 ? "estão cadastrados" : "está cadastrado"}: o kit dilui a tarifa fixa e aumenta o tíquete.`, preco: null });
  }

  if (a.precoMaximo !== null && preco > a.precoMaximo) {
    lista.push({ id: "acima_maximo", titulo: "Acima da referência de máximo", detalhe: `Passa de ${brl(a.precoMaximo)} (${a.motivoMaximo}). Não é proibido, mas pode vender menos.`, preco: a.precoMaximo });
  }
  return lista;
}

/**
 * Série de unidades por semana, da mais antiga para a atual, a partir das linhas de
 * `vendas_semanais_por_anuncio` (só vêm as semanas COM venda; as outras viram 0).
 * `hoje` em AAAA-MM-DD (dia no Brasil); a semana começa na segunda, como o `date_trunc`.
 */
export function serieSemanal(linhas: { semana: string; unidades: number }[], semanas: number, hoje: string): number[] {
  const [a, m, d] = hoje.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d));
  const deslocamento = (dia.getUTCDay() + 6) % 7; // segunda = 0
  const segundaAtual = Date.UTC(a, m - 1, d - deslocamento);
  const serie = new Array<number>(semanas).fill(0);
  for (const l of linhas) {
    const [la, lm, ld] = l.semana.slice(0, 10).split("-").map(Number);
    const atras = Math.round((segundaAtual - Date.UTC(la, lm - 1, ld)) / (7 * 86_400_000));
    if (atras >= 0 && atras < semanas) serie[semanas - 1 - atras] += Number(l.unidades) || 0;
  }
  return serie;
}

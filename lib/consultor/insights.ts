/**
 * Consultor de desempenho (Vendas › Insights). PURO, coberto por `insights.test.ts`.
 *
 * Os NÚMEROS e as regras são determinísticos: vêm dos pedidos já sincronizados, do período
 * anterior e do gasto com Ads. Nada aqui passa por IA. Todo veredito carrega a amostra (pedidos
 * e período) e abaixo do mínimo vira "ainda cedo" em vez de conclusão.
 */

import { hojeIsoBrasil, inicioDiaBrasil, somarDiasIso } from "@/lib/format";
import { rankearAnuncios, type AnuncioCadastrado, type LinhaRanking, type PedidoRanking } from "@/lib/marketplace/ranking-anuncios";

/** Limiares em um lugar só, para ajustar sem caçar número solto. */
export const LIMIARES = {
  /** Pedidos mínimos para qualquer veredito sobre um anúncio. */
  amostraMinima: 3,
  /** Pedidos mínimos para "replicar" e para comparar tendência. */
  amostraSolida: 5,
  margemBoa: 0.15,
  margemFraca: 0.05,
  margemApertada: 0.1,
  problemaAlto: 0.2,
  problemaAtencao: 0.1,
  /** Queda de faturamento vs. período anterior que pede atenção. */
  quedaAtencao: 0.3,
  /** Unidades mínimas para falar de faixa de preço. */
  unidadesFaixa: 20,
} as const;

export type Veredito = "replicar" | "atencao" | "nao_vale" | "parado" | "ainda_cedo" | "ok";

export interface GastoAds {
  loja_id: string | null;
  periodo_inicio: string;
  periodo_fim: string;
  produto_id: string | null;
  valor: number;
}

export interface LinhaConsultor extends LinhaRanking {
  veredito: Veredito;
  /** Por que o veredito saiu assim, já com os números. */
  motivos: string[];
  /** Variação do faturamento vs. período anterior (fração); null sem base de comparação. */
  tendencia: number | null;
  gastoAds: number;
  /** Lucro depois do gasto com Ads atribuído ao anúncio. */
  lucroAposAds: number;
  /** Variação mais vendida do anúncio (por unidades), se houver mais de uma. */
  campea: { nome: string; unidades: number; participacao: number } | null;
}

export interface FaixaPreco {
  de: number;
  ate: number;
  unidades: number;
  receita: number;
  lucro: number;
  margem: number | null;
}

export interface ResultadoConsultor {
  dias: number;
  linhas: LinhaConsultor[];
  faixas: FaixaPreco[] | null;
  melhorFaixa: FaixaPreco | null;
  /** Gasto com Ads do período que não deu para ligar a nenhum anúncio. */
  adsSemAnuncio: number;
  adsTotal: number;
  /** Poucos pedidos no período todo: os vereditos não são conclusivos. */
  amostraFraca: boolean;
  pedidosPeriodo: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const MS_DIA = 86_400_000;
const diaUtc = (iso: string) => Math.floor(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / MS_DIA);
const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Parte do gasto que cai dentro da janela [inicioIso, fimIso], proporcional aos dias. */
export function gastoNaJanela(g: GastoAds, inicioIso: string, fimIso: string): number {
  const gi = diaUtc(g.periodo_inicio);
  const gf = diaUtc(g.periodo_fim);
  const total = gf - gi + 1;
  const sobre = Math.min(gf, diaUtc(fimIso)) - Math.max(gi, diaUtc(inicioIso)) + 1;
  if (total <= 0 || sobre <= 0) return 0;
  return g.valor * (sobre / total);
}

/** Faixas por quartil das unidades vendidas (cada faixa tem ~25% das unidades). */
export function faixasDePreco(pedidos: readonly PedidoRanking[], inicio: Date, fim: Date): FaixaPreco[] | null {
  const unidades: { preco: number; lucro: number }[] = [];
  for (const p of pedidos) {
    if (!p.criado_em_plataforma || !["a_enviar", "enviado", "concluido"].includes(p.status)) continue;
    const q = new Date(p.criado_em_plataforma);
    if (q < inicio || q > fim) continue;
    const total = p.itens.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);
    if (total <= 0) continue;
    for (const i of p.itens) {
      const lucroItem = (p.lucro * (i.preco_unitario * i.quantidade)) / total;
      for (let k = 0; k < i.quantidade; k++) unidades.push({ preco: i.preco_unitario, lucro: lucroItem / i.quantidade });
    }
  }
  if (unidades.length < LIMIARES.unidadesFaixa) return null;
  unidades.sort((a, b) => a.preco - b.preco);
  const n = unidades.length;
  const cortes = [0, Math.ceil(n / 4), Math.ceil(n / 2), Math.ceil((3 * n) / 4), n];
  const faixas: FaixaPreco[] = [];
  for (let b = 0; b < 4; b++) {
    const fatia = unidades.slice(cortes[b], cortes[b + 1]);
    if (fatia.length === 0) continue;
    const receita = fatia.reduce((s, u) => s + u.preco, 0);
    const lucro = fatia.reduce((s, u) => s + u.lucro, 0);
    faixas.push({ de: fatia[0].preco, ate: fatia[fatia.length - 1].preco, unidades: fatia.length, receita: r2(receita), lucro: r2(lucro), margem: receita > 0 ? lucro / receita : null });
  }
  return faixas;
}

function campeaDe(linha: LinhaRanking, pedidos: readonly PedidoRanking[], inicio: Date, fim: Date): LinhaConsultor["campea"] {
  if (linha.variacoes < 2) return null;
  const por = new Map<string, { nome: string; unidades: number }>();
  for (const p of pedidos) {
    if (p.loja_id !== linha.lojaId || !p.criado_em_plataforma || !["a_enviar", "enviado", "concluido"].includes(p.status)) continue;
    const q = new Date(p.criado_em_plataforma);
    if (q < inicio || q > fim) continue;
    for (const i of p.itens) {
      const chave = `${p.loja_id}|${(i.sku_principal ?? "").trim().toLowerCase() || i.nome.trim().toLowerCase()}`;
      if (chave !== linha.chave || !i.variacao?.trim()) continue;
      const k = i.variacao.trim().toLowerCase();
      const v = por.get(k) ?? { nome: i.variacao.trim(), unidades: 0 };
      v.unidades += i.quantidade;
      por.set(k, v);
    }
  }
  const top = [...por.values()].sort((a, b) => b.unidades - a.unidades)[0];
  return top && linha.unidades > 0 ? { ...top, participacao: top.unidades / linha.unidades } : null;
}

function julgar(l: LinhaRanking, anterior: LinhaRanking | undefined, lucroAposAds: number, gastoAds: number): Pick<LinhaConsultor, "veredito" | "motivos" | "tendencia"> {
  const motivos: string[] = [];
  const tendencia = anterior && anterior.pedidos >= LIMIARES.amostraSolida && anterior.receita > 0 ? l.receita / anterior.receita - 1 : null;
  const amostra = `${l.pedidos} pedido${l.pedidos === 1 ? "" : "s"}`;

  if (l.receita <= 0) return { veredito: "parado", motivos: ["Nenhuma venda no período."], tendencia };
  if (l.pedidos < LIMIARES.amostraMinima) return { veredito: "ainda_cedo", motivos: [`Só ${amostra} no período: pouco para concluir algo.`], tendencia };

  // Problemas, do mais grave ao menos grave.
  if (gastoAds > 0 && lucroAposAds <= 0) motivos.push(`Depois de ${formatar(gastoAds)} em Ads, o lucro fica em ${formatar(lucroAposAds)} (${amostra}).`);
  if (l.margem != null && l.margem < LIMIARES.margemFraca && l.pedidos >= LIMIARES.amostraSolida) motivos.push(`Margem de ${pct(l.margem)} em ${amostra}: quase não sobra lucro.`);
  if (l.taxaProblema != null && l.taxaProblema >= LIMIARES.problemaAlto && l.pedidos >= LIMIARES.amostraSolida) motivos.push(`${pct(l.taxaProblema)} dos pedidos foram cancelados ou devolvidos.`);
  if (motivos.length) return { veredito: "nao_vale", motivos, tendencia };

  if (tendencia != null && tendencia <= -LIMIARES.quedaAtencao) motivos.push(`Faturamento caiu ${pct(-tendencia)} em relação ao período anterior.`);
  if (l.margem != null && l.margem < LIMIARES.margemApertada) motivos.push(`Margem apertada: ${pct(l.margem)}.`);
  if (l.taxaProblema != null && l.taxaProblema >= LIMIARES.problemaAtencao) motivos.push(`${pct(l.taxaProblema)} dos pedidos cancelados ou devolvidos.`);
  if (l.custoIncompleto) motivos.push("Há item sem produto vinculado: o lucro pode estar acima do real.");
  if (motivos.length) return { veredito: "atencao", motivos, tendencia };

  if (l.classe === "A" && l.margem != null && l.margem >= LIMIARES.margemBoa && l.pedidos >= LIMIARES.amostraSolida) {
    const m = [`Está entre os que mais faturam (classe A), com margem de ${pct(l.margem)} em ${amostra}.`];
    if (tendencia != null && tendencia > 0) m.push(`Faturamento subiu ${pct(tendencia)} vs. o período anterior.`);
    return { veredito: "replicar", motivos: m, tendencia };
  }
  return { veredito: "ok", motivos: [], tendencia };
}

function formatar(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Analisa o período `[inicio, fim]` contra o período anterior de mesmo tamanho.
 * `inicioIso`/`fimIso` são as datas (AAAA-MM-DD) da mesma janela, para repartir o gasto com Ads.
 */
export function analisarDesempenho(
  pedidos: readonly PedidoRanking[],
  anuncios: readonly AnuncioCadastrado[],
  ads: readonly GastoAds[],
  dias: number,
  inicio: Date,
  fim: Date,
  inicioIso: string,
  fimIso: string,
): ResultadoConsultor {
  const anteriorFim = new Date(inicio.getTime() - 1);
  const anteriorInicio = new Date(inicio);
  anteriorInicio.setDate(anteriorInicio.getDate() - dias);
  const atual = rankearAnuncios(pedidos, anuncios, inicio, fim, "receita");
  const anterior = new Map(rankearAnuncios(pedidos, anuncios, anteriorInicio, anteriorFim, "receita").map((l) => [l.chave, l]));

  // Gasto com Ads: ligado ao anúncio pelo produto; repartido igualmente se vários anúncios usam o mesmo produto.
  const donos = new Map<string, LinhaRanking[]>();
  for (const l of atual) for (const id of l.produtoIds) donos.set(id, [...(donos.get(id) ?? []), l]);
  const gastoPor = new Map<string, number>();
  let adsTotal = 0;
  let adsSemAnuncio = 0;
  for (const g of ads) {
    const v = gastoNaJanela(g, inicioIso, fimIso);
    if (v <= 0) continue;
    adsTotal += v;
    const alvo = g.produto_id ? donos.get(g.produto_id) : undefined;
    if (!alvo?.length) {
      adsSemAnuncio += v;
      continue;
    }
    for (const l of alvo) gastoPor.set(l.chave, (gastoPor.get(l.chave) ?? 0) + v / alvo.length);
  }

  const linhas: LinhaConsultor[] = atual.map((l) => {
    const gastoAds = r2(gastoPor.get(l.chave) ?? 0);
    const lucroAposAds = r2(l.lucro - gastoAds);
    return { ...l, ...julgar(l, anterior.get(l.chave), lucroAposAds, gastoAds), gastoAds, lucroAposAds, campea: campeaDe(l, pedidos, inicio, fim) };
  });

  const faixas = faixasDePreco(pedidos, inicio, fim);
  const melhorFaixa = faixas ? ([...faixas].sort((a, b) => b.lucro - a.lucro)[0] ?? null) : null;
  const pedidosPeriodo = linhas.reduce((s, l) => s + l.pedidos, 0);
  return { dias, linhas, faixas, melhorFaixa, adsSemAnuncio: r2(adsSemAnuncio), adsTotal: r2(adsTotal), amostraFraca: pedidosPeriodo < LIMIARES.amostraSolida * 2, pedidosPeriodo };
}

export const PERIODOS_INSIGHTS = [30, 60, 90] as const;

/**
 * Janela dos últimos `dias` dias (contando hoje, no fuso de Brasília), opcionalmente de uma só
 * loja. É a ÚNICA definição do período: a tela e a geração por IA chamam esta função, então o
 * que a IA narra é exatamente o que o usuário vê.
 */
export function analisarPorDias(
  dados: { pedidos: readonly PedidoRanking[]; anuncios: readonly AnuncioCadastrado[]; ads: readonly GastoAds[] },
  dias: number,
  agora: Date,
  lojaId?: string | null,
): ResultadoConsultor {
  const hoje = hojeIsoBrasil(agora);
  const inicioIso = somarDiasIso(hoje, -(dias - 1));
  // Gasto sem loja (campanha geral) vale para qualquer filtro de loja.
  const daLoja = <T extends { loja_id: string | null }>(x: readonly T[]) => (lojaId ? x.filter((i) => i.loja_id === lojaId || i.loja_id === null) : [...x]);
  return analisarDesempenho(daLoja(dados.pedidos), daLoja(dados.anuncios), daLoja(dados.ads), dias, inicioDiaBrasil(inicioIso), agora, inicioIso, hoje);
}

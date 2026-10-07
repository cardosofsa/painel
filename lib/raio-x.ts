/**
 * Raio-X do anúncio: o preço que você PRATICA (digitado, média dos pedidos ou o que está
 * no ar no marketplace) contra o preço IDEAL da sua regra (margem-alvo, taxas e faixa de
 * comissão da loja). Quanto ganha ou perde por venda e por mês, nota de 0 a 100, selo e
 * dicas. Puro, coberto por `raio-x.test.ts`; os cálculos são os de `lib/pricing.ts`.
 */

import {
  precoEmCentavos,
  resolverComFaixas,
  resolverPorLucro,
  resolverPorMargem,
  resultadoParaPreco,
  resultadoParaPrecoComFaixas,
  zonaMortaDeFaixa,
  type FaixaComissao,
  type ResultadoPrecificacao,
  type TaxasPlataforma,
  type ZonaMorta,
} from "./pricing";
import { formatBRL } from "./format";

export type FontePreco = "digitado" | "pedidos" | "anuncio";
export type SeloRaioX = "saudavel" | "apertada" | "prejuizo" | "caro" | "zona_morta" | "sem_preco";

export const ROTULO_SELO: Record<SeloRaioX, string> = {
  saudavel: "Saudável",
  apertada: "Margem apertada",
  prejuizo: "No prejuízo",
  caro: "Acima do ideal",
  zona_morta: "Na zona morta",
  sem_preco: "Sem preço praticado",
};

export const ROTULO_FONTE: Record<FontePreco, string> = {
  digitado: "Digitado por você",
  pedidos: "Média dos pedidos (30 dias)",
  anuncio: "Preço do anúncio no ar",
};

export interface EntradaRaioX {
  /** Custo de hoje (do produto, se vinculado; senão o da precificação). */
  custo: number;
  /** Custo usado quando a precificação foi salva — para avisar se mudou. */
  custoPrecificado: number;
  /** Taxas em fração (0,2 = 20%). `taxaVariavelPct`/`taxaFixa` valem só sem faixas. */
  taxas: TaxasPlataforma;
  faixas: FaixaComissao[];
  /** Margem líquida desejada em fração. */
  margemAlvo: number;
  precoPraticado: number | null;
  fonte: FontePreco | null;
  /** Unidades vendidas nos últimos 30 dias (0 se não se sabe). */
  vendasMes: number;
}

export interface ResultadoRaioX {
  ideal: ResultadoPrecificacao;
  /** Abaixo disso o lucro é negativo. */
  precoMinimo: number | null;
  praticado: ResultadoPrecificacao | null;
  /** Lucro no praticado − lucro no ideal (negativo = deixando dinheiro na mesa). */
  diferencaPorVenda: number | null;
  diferencaMes: number | null;
  nota: number | null;
  selo: SeloRaioX;
  zonaMorta: ZonaMorta | null;
  dicas: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

function taxasBase(t: TaxasPlataforma): Omit<TaxasPlataforma, "taxaVariavelPct" | "taxaFixa"> {
  return { impostoPct: t.impostoPct, taxaAdicionalPct: t.taxaAdicionalPct, taxaExtraValor: t.taxaExtraValor, taxaExtraTipo: t.taxaExtraTipo };
}

export function precoIdeal(e: Pick<EntradaRaioX, "custo" | "taxas" | "faixas" | "margemAlvo">): ResultadoPrecificacao {
  return e.faixas.length ? resolverComFaixas(e.custo, "margem", e.margemAlvo, taxasBase(e.taxas), e.faixas).resultado : resolverPorMargem(e.custo, e.margemAlvo, e.taxas);
}

export function resultadoNoPreco(e: Pick<EntradaRaioX, "custo" | "taxas" | "faixas">, preco: number): ResultadoPrecificacao {
  return e.faixas.length ? resultadoParaPrecoComFaixas(preco, e.custo, taxasBase(e.taxas), e.faixas) : resultadoParaPreco(preco, e.custo, e.taxas);
}

/**
 * Preço de empate (lucro zero), levado ao centavo PARA CIMA: arredondar normal podia
 * devolver um centavo abaixo do empate (12,5125 → 12,51), um "mínimo" que já dá prejuízo.
 * Com faixas, `precoEmCentavos` não deixa o centavo a mais atravessar o piso da faixa.
 */
export function precoMinimo(e: Pick<EntradaRaioX, "custo" | "taxas" | "faixas">): number | null {
  const r = e.faixas.length ? resolverComFaixas(e.custo, "lucro", 0, taxasBase(e.taxas), e.faixas).resultado : resolverPorLucro(e.custo, 0, e.taxas);
  return r.viavel ? precoEmCentavos(r.precoVenda, true, e.faixas) : null;
}

/**
 * Nota de 0 a 100. Pesa quanto da margem-alvo o preço entrega (até 85 pontos) e tira
 * pontos de quem está muito acima do ideal (pode estar perdendo venda) ou na zona morta.
 * Prejuízo fica sempre abaixo de 20.
 */
export function notaRaioX(margemPraticada: number, margemAlvo: number, precoPraticado: number, precoIdeal: number, naZonaMorta: boolean): number {
  if (margemPraticada < 0) return Math.max(0, Math.round(15 + margemPraticada * 100));
  const alvo = Math.max(margemAlvo, 0.01);
  let nota = Math.min(1, margemPraticada / alvo) * 85 + 15;
  const acima = precoIdeal > 0 ? precoPraticado / precoIdeal - 1 : 0;
  if (acima > 0.25) nota -= Math.min(30, (acima - 0.25) * 100);
  if (naZonaMorta) nota = Math.min(nota, 50);
  return Math.max(0, Math.min(100, Math.round(nota)));
}

export function analisarRaioX(e: EntradaRaioX): ResultadoRaioX {
  const ideal = precoIdeal(e);
  const minimo = precoMinimo(e);
  const dicas: string[] = [];

  if (e.custoPrecificado > 0 && Math.abs(e.custo - e.custoPrecificado) / e.custoPrecificado > 0.01) {
    const subiu = e.custo > e.custoPrecificado;
    dicas.push(`O custo ${subiu ? "subiu" : "caiu"} de ${formatBRL(e.custoPrecificado)} para ${formatBRL(e.custo)} desde a precificação${subiu ? ": confira se o preço acompanhou" : ""}.`);
  }

  if (e.precoPraticado === null || !(e.precoPraticado > 0)) {
    if (ideal.viavel) dicas.unshift(`Informe o preço que você usa hoje para comparar com o ideal de ${formatBRL(ideal.precoVenda)}.`);
    return { ideal, precoMinimo: minimo, praticado: null, diferencaPorVenda: null, diferencaMes: null, nota: null, selo: "sem_preco", zonaMorta: null, dicas };
  }

  const praticado = resultadoNoPreco(e, e.precoPraticado);
  const zona = e.faixas.length ? zonaMortaDeFaixa(e.faixas, e.precoPraticado, taxasBase(e.taxas)) : null;
  const diferenca = ideal.viavel ? r2(praticado.lucroLiquido - ideal.lucroLiquido) : null;
  const diferencaMes = diferenca !== null && e.vendasMes > 0 ? r2(diferenca * e.vendasMes) : null;
  const nota = ideal.viavel ? notaRaioX(praticado.margemEfetivaPct, e.margemAlvo, e.precoPraticado, ideal.precoVenda, !!zona) : null;

  let selo: SeloRaioX;
  if (praticado.lucroLiquido < 0) selo = "prejuizo";
  else if (zona) selo = "zona_morta";
  else if (ideal.viavel && e.precoPraticado > ideal.precoVenda * 1.25) selo = "caro";
  else if (praticado.margemEfetivaPct < e.margemAlvo * 0.7) selo = "apertada";
  else selo = "saudavel";

  if (selo === "prejuizo" && minimo) dicas.unshift(`Você paga para vender: abaixo de ${formatBRL(minimo)} cada venda dá prejuízo.`);
  if (zona) dicas.unshift(`Baixe para ${formatBRL(zona.precoMelhor)}: a comissão cai de faixa e você recebe ${formatBRL(zona.ganhoLiquido)} a mais por venda.`);
  if (ideal.viavel && diferenca !== null && diferenca < -0.009 && !zona) {
    const mes = diferencaMes !== null ? ` (≈ ${formatBRL(Math.abs(diferencaMes))} por mês com ${e.vendasMes} vendas)` : "";
    dicas.push(`Subir para ${formatBRL(ideal.precoVenda)} rende ${formatBRL(Math.abs(diferenca))} a mais por venda${mes}.`);
  }
  if (selo === "caro") {
    const pct = Math.round((e.precoPraticado / ideal.precoVenda - 1) * 100);
    dicas.push(`O preço está ${pct}% acima do ideal. Se as vendas caíram, teste algo perto de ${formatBRL(ideal.precoVenda)}.`);
  }
  const fixo = praticado.precoVenda > 0 ? (praticado.precoVenda - praticado.custoTotal - praticado.lucroLiquido - praticado.taxaVariavelValor - praticado.taxaAdicionalValor - praticado.impostoValor - praticado.taxaExtraCalculada) / praticado.precoVenda : 0;
  if (fixo > 0.12) dicas.push(`A tarifa fixa come ${Math.round(fixo * 100)}% do preço: um kit com 2 unidades dilui essa tarifa.`);

  return { ideal, precoMinimo: minimo, praticado, diferencaPorVenda: diferenca, diferencaMes, nota, selo, zonaMorta: zona, dicas };
}

/** "Dinheiro na mesa" para ordenar a lista: quanto deixa de ganhar por mês (positivo = perde). */
export function perdaMensal(r: ResultadoRaioX): number {
  if (r.diferencaMes !== null) return -r.diferencaMes;
  return r.diferencaPorVenda !== null ? -r.diferencaPorVenda : 0;
}

// ---------- Montagem da lista (a partir das precificações salvas) ----------

export interface PrecificacaoRaioX {
  id: string;
  produto_id: string | null;
  produto_nome: string;
  titulo_anuncio: string | null;
  loja_id: string | null;
  canal: string | null;
  custo: number;
  taxa_variavel_pct: number;
  taxa_fixa: number;
  taxa_adicional_pct: number;
  imposto_pct: number;
  taxa_extra_valor: number | null;
  taxa_extra_tipo: "percentual" | "fixo" | null;
  margem_pct: number | null;
  preco_calculado: number;
  lucro: number;
  criado_em: string;
  origem?: string;
}

export interface LojaRaioX {
  id: string;
  nome: string;
  canalNome: string;
  faixas: FaixaComissao[];
}

export interface FontesRaioX {
  digitados: Record<string, { preco: number; observado_em: string }>;
  noAr: Record<string, { preco: number; lido_em: string | null }>;
  vendas: Record<string, { quantidade: number; preco_medio: number }>;
}

export interface ItemRaioX {
  chave: string;
  precificacao: PrecificacaoRaioX;
  rotulo: string;
  loja: string;
  /** Todas as fontes conhecidas, para a tela mostrar e deixar escolher. */
  precos: Partial<Record<FontePreco, number>>;
  resultado: ResultadoRaioX;
}

/** Um anúncio = produto (ou nome) + loja (ou canal). */
export function chaveRaioX(p: Pick<PrecificacaoRaioX, "produto_id" | "produto_nome" | "loja_id" | "canal">): string {
  return `${p.produto_id ?? p.produto_nome.trim().toLowerCase()}|${p.loja_id ?? (p.canal ?? "").trim().toLowerCase()}`;
}

/**
 * A precificação mais recente de cada anúncio, com o preço praticado na ordem: o que está
 * no ar no marketplace → o que a pessoa digitou → a média dos pedidos dos últimos 30 dias.
 */
export function montarItensRaioX(
  precificacoes: PrecificacaoRaioX[],
  lojas: LojaRaioX[],
  custoAtual: Map<string, number>,
  fontes: FontesRaioX,
  preferida?: Record<string, FontePreco>,
): ItemRaioX[] {
  const lojaPorId = new Map(lojas.map((l) => [l.id, l]));
  const vistos = new Set<string>();
  const itens: ItemRaioX[] = [];
  const ordenadas = [...precificacoes].sort((a, b) => b.criado_em.localeCompare(a.criado_em));
  for (const p of ordenadas) {
    if (p.origem === "em_massa") continue;
    const chave = chaveRaioX(p);
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    const loja = p.loja_id ? lojaPorId.get(p.loja_id) : undefined;
    const faixas = loja?.faixas ?? [];
    const custoHoje = p.produto_id ? (custoAtual.get(p.produto_id) ?? Number(p.custo)) : Number(p.custo);
    const kProdLoja = p.produto_id ? `${p.produto_id}|${p.loja_id ?? ""}` : null;
    const precos: Partial<Record<FontePreco, number>> = {};
    if (kProdLoja && p.loja_id && fontes.noAr[kProdLoja]) precos.anuncio = fontes.noAr[kProdLoja].preco;
    if (fontes.digitados[chave]) precos.digitado = fontes.digitados[chave].preco;
    const venda = kProdLoja ? fontes.vendas[kProdLoja] : undefined;
    if (venda && venda.quantidade > 0) precos.pedidos = venda.preco_medio;

    const escolhida = preferida?.[chave];
    const fonte: FontePreco | null = escolhida && precos[escolhida] ? escolhida : precos.anuncio ? "anuncio" : precos.digitado ? "digitado" : precos.pedidos ? "pedidos" : null;
    const margemAlvo = p.margem_pct !== null && p.margem_pct !== undefined ? Number(p.margem_pct) : Number(p.preco_calculado) > 0 ? Number(p.lucro) / Number(p.preco_calculado) : 0.2;

    const resultado = analisarRaioX({
      custo: custoHoje,
      custoPrecificado: Number(p.custo),
      taxas: {
        impostoPct: Number(p.imposto_pct),
        taxaFixa: Number(p.taxa_fixa),
        taxaVariavelPct: Number(p.taxa_variavel_pct),
        taxaAdicionalPct: Number(p.taxa_adicional_pct),
        taxaExtraValor: p.taxa_extra_valor ?? undefined,
        taxaExtraTipo: p.taxa_extra_tipo,
      },
      faixas,
      margemAlvo,
      precoPraticado: fonte ? (precos[fonte] ?? null) : null,
      fonte,
      vendasMes: venda?.quantidade ?? 0,
    });
    itens.push({
      chave,
      precificacao: p,
      rotulo: p.titulo_anuncio?.trim() || p.produto_nome,
      loja: loja ? `${loja.canalNome} · ${loja.nome}` : p.canal || "Sem loja",
      precos,
      resultado,
    });
  }
  return itens.sort((a, b) => perdaMensal(b.resultado) - perdaMensal(a.resultado));
}

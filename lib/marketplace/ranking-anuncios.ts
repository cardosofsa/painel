/**
 * Ranking de anúncios da Shopee (Vendas › Ranking de anúncios). PURO, coberto por
 * `ranking-anuncios.test.ts`. Usa só o que o Painel já sincroniza: pedidos e itens
 * (`pedidos_marketplace*`) e a lista de anúncios (`marketplace_anuncios`).
 *
 * "Anúncio" aqui é o item pai da Shopee: as variações do mesmo anúncio somam juntas. A chave é
 * o SKU principal; sem ele, o título. Só pedidos que contam como venda entram no ranking
 * (`STATUS_VENDA`); cancelados e devolvidos viram taxa de problema, nunca faturamento.
 */

import type { StatusMarketplace } from "./shopee-planilha";

export const STATUS_VENDA: readonly StatusMarketplace[] = ["a_enviar", "enviado", "concluido"];
const STATUS_PROBLEMA: readonly StatusMarketplace[] = ["cancelado", "devolvido"];

export interface ItemRanking {
  /** Produto vinculado ao item; liga o anúncio ao gasto com Ads (`gastos_anuncios.produto_id`). */
  produto_id?: string | null;
  sku_principal?: string | null;
  nome: string;
  variacao: string | null;
  quantidade: number;
  preco_unitario: number;
}

export interface PedidoRanking {
  loja_id: string;
  status: StatusMarketplace;
  criado_em_plataforma: string | null;
  lucro: number;
  custo_incompleto: boolean;
  itens: ItemRanking[];
}

export interface AnuncioCadastrado {
  /** Id em `marketplace_anuncios` (para Analisar e Ajuste de Preço). */
  id?: string;
  loja_id: string;
  sku_principal: string | null;
  nome_item: string | null;
  nome: string | null;
  imagem_url: string | null;
  link: string | null;
}

export interface LinhaRanking {
  chave: string;
  nome: string;
  lojaId: string;
  /** Um anúncio cadastrado deste item (`marketplace_anuncios.id`), quando há. */
  anuncioId: string | null;
  imagemUrl: string | null;
  link: string | null;
  pedidos: number;
  unidades: number;
  receita: number;
  /** Lucro do pedido repartido entre os itens pela fatia da receita. */
  lucro: number;
  /** lucro / receita; null sem receita. */
  margem: number | null;
  /** Algum pedido do anúncio com item sem custo conhecido: o lucro está inflado. */
  custoIncompleto: boolean;
  /** Fração de pedidos cancelados/devolvidos sobre todos os do período; null sem pedidos. */
  taxaProblema: number | null;
  variacoes: number;
  /** Produtos vinculados aos itens vendidos/cadastrados (ordenados), para ligar ao gasto com Ads. */
  produtoIds: string[];
  /** Fatia do faturamento total e acumulada (curva ABC), de 0 a 1. */
  participacao: number;
  acumulado: number;
  classe: "A" | "B" | "C" | null;
  /** Posição na ordenação por receita; 0 = parado. */
  posicao: number;
}

export type Criterio = "receita" | "unidades" | "lucro" | "margem";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const r2 = (n: number) => Math.round(n * 100) / 100;

export function chaveAnuncio(loja: string, skuPrincipal: string | null | undefined, nome: string | null | undefined): string {
  return `${loja}|${norm(skuPrincipal) || norm(nome)}`;
}

/** Título do anúncio sem a variação ("Kit X · Azul" → "Kit X"). */
function tituloLimpo(nome: string | null, nomeItem: string | null): string {
  return (nomeItem ?? nome ?? "").trim() || "(sem título)";
}

interface Acc {
  linha: LinhaRanking;
  pedidosVenda: Set<number>;
  pedidosTodos: Set<number>;
  pedidosProblema: Set<number>;
  variacoes: Set<string>;
  produtos: Set<string>;
}

/**
 * Agrega os pedidos de `[inicio, fim]` por anúncio. Anúncios cadastrados sem nenhuma venda no
 * período entram com zeros (são os "parados"). Ordenado por `criterio`, decrescente.
 */
export function rankearAnuncios(
  pedidos: readonly PedidoRanking[],
  anuncios: readonly AnuncioCadastrado[],
  inicio: Date,
  fim: Date,
  criterio: Criterio = "receita",
): LinhaRanking[] {
  const mapa = new Map<string, Acc>();
  const obter = (loja: string, sku: string | null | undefined, nome: string, nomeItem: string | null): Acc | null => {
    const chave = chaveAnuncio(loja, sku, nomeItem ?? nome);
    if (chave.endsWith("|")) return null;
    let a = mapa.get(chave);
    if (!a) {
      a = {
        linha: {
          chave,
          nome: tituloLimpo(nome, nomeItem),
          lojaId: loja,
          anuncioId: null,
          imagemUrl: null,
          link: null,
          pedidos: 0,
          unidades: 0,
          receita: 0,
          lucro: 0,
          margem: null,
          custoIncompleto: false,
          taxaProblema: null,
          variacoes: 0,
          produtoIds: [],
          participacao: 0,
          acumulado: 0,
          classe: null,
          posicao: 0,
        },
        pedidosVenda: new Set(),
        pedidosTodos: new Set(),
        pedidosProblema: new Set(),
        variacoes: new Set(),
        produtos: new Set(),
      };
      mapa.set(chave, a);
    }
    return a;
  };

  for (const an of anuncios) {
    const a = obter(an.loja_id, an.sku_principal, an.nome ?? "", an.nome_item);
    if (!a) continue;
    a.linha.anuncioId ??= an.id ?? null;
    a.linha.imagemUrl ??= an.imagem_url;
    a.linha.link ??= an.link;
  }

  pedidos.forEach((p, idx) => {
    if (!p.criado_em_plataforma) return;
    const quando = new Date(p.criado_em_plataforma);
    if (quando < inicio || quando > fim) return;
    const venda = STATUS_VENDA.includes(p.status);
    const problema = STATUS_PROBLEMA.includes(p.status);
    if (!venda && !problema) return; // "não pago" não é venda nem problema
    const totalItens = p.itens.reduce((s, i) => s + i.preco_unitario * i.quantidade, 0);
    for (const item of p.itens) {
      const a = obter(p.loja_id, item.sku_principal, item.nome, null);
      if (!a) continue;
      a.pedidosTodos.add(idx);
      if (item.produto_id) a.produtos.add(item.produto_id);
      if (problema) {
        a.pedidosProblema.add(idx);
        continue;
      }
      const receita = item.preco_unitario * item.quantidade;
      a.pedidosVenda.add(idx);
      a.linha.unidades += item.quantidade;
      a.linha.receita += receita;
      if (totalItens > 0) a.linha.lucro += p.lucro * (receita / totalItens);
      if (p.custo_incompleto) a.linha.custoIncompleto = true;
      if (item.variacao?.trim()) a.variacoes.add(norm(item.variacao));
    }
  });

  const linhas = [...mapa.values()].map((a) => {
    const l = a.linha;
    l.pedidos = a.pedidosVenda.size;
    l.receita = r2(l.receita);
    l.lucro = r2(l.lucro);
    l.margem = l.receita > 0 ? l.lucro / l.receita : null;
    l.taxaProblema = a.pedidosTodos.size > 0 ? a.pedidosProblema.size / a.pedidosTodos.size : null;
    l.variacoes = a.variacoes.size;
    l.produtoIds = [...a.produtos].sort();
    return l;
  });

  const valor = (l: LinhaRanking) => (criterio === "unidades" ? l.unidades : criterio === "lucro" ? l.lucro : criterio === "margem" ? (l.margem ?? -Infinity) : l.receita);
  linhas.sort((x, y) => valor(y) - valor(x) || y.receita - x.receita || x.nome.localeCompare(y.nome, "pt-BR"));

  // Participação e curva ABC pela receita (corte 80% / 95%), na ordem do critério escolhido.
  const total = linhas.reduce((s, l) => s + l.receita, 0);
  let acum = 0;
  let pos = 0;
  for (const l of linhas) {
    if (l.receita <= 0) continue;
    acum += l.receita;
    l.participacao = total > 0 ? l.receita / total : 0;
    l.acumulado = total > 0 ? acum / total : 0;
    // A classe vale pela fração acumulada ANTES deste anúncio: o que cruza o 80% ainda é A.
    const antes = total > 0 ? (acum - l.receita) / total : 0;
    l.classe = antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C";
    l.posicao = ++pos;
  }
  return linhas;
}

export interface ResumoRanking {
  anuncios: number;
  comVenda: number;
  parados: number;
  receita: number;
  lucro: number;
  unidades: number;
  pedidos: number;
}

export function resumirRanking(linhas: readonly LinhaRanking[]): ResumoRanking {
  const comVenda = linhas.filter((l) => l.receita > 0);
  return {
    anuncios: linhas.length,
    comVenda: comVenda.length,
    parados: linhas.length - comVenda.length,
    receita: r2(comVenda.reduce((s, l) => s + l.receita, 0)),
    lucro: r2(comVenda.reduce((s, l) => s + l.lucro, 0)),
    unidades: comVenda.reduce((s, l) => s + l.unidades, 0),
    pedidos: comVenda.reduce((s, l) => s + l.pedidos, 0),
  };
}

// ---------- Filtros, comparação e ordenação da tela ----------

/** Abaixo disso a margem é "baixa" (10%). */
export const MARGEM_BAIXA = 0.1;
/** A partir disso, "muitos cancelamentos" (10% dos pedidos). */
export const CANCELAMENTO_ALTO = 0.1;
/** Variação do faturamento contra o período anterior para "em queda" / "em alta" (30%). */
export const VARIACAO_FORTE = 0.3;

export type Situacao = "todos" | "vendendo" | "parados" | "prejuizo" | "margem_baixa" | "cancelamentos" | "em_queda" | "em_alta" | "sem_custo";

export interface ComparacaoAnterior {
  /** Faturamento do mesmo anúncio no período anterior de mesmo tamanho; null = não dá para comparar. */
  receitaAnterior: number | null;
  /** (atual - anterior) / anterior; null sem venda antes ou sem comparação. */
  variacao: number | null;
  /** Vendeu no período e não tinha vendido no anterior. */
  novo: boolean;
}

/** Junta a cada linha o faturamento do período anterior. `anterior = null`: a janela carregada não cobre. */
export function compararComAnterior(atual: readonly LinhaRanking[], anterior: readonly LinhaRanking[] | null): Map<string, ComparacaoAnterior> {
  const antes = new Map((anterior ?? []).map((l) => [l.chave, l.receita]));
  const saida = new Map<string, ComparacaoAnterior>();
  for (const l of atual) {
    if (!anterior) {
      saida.set(l.chave, { receitaAnterior: null, variacao: null, novo: false });
      continue;
    }
    const r = antes.get(l.chave) ?? 0;
    saida.set(l.chave, { receitaAnterior: r2(r), variacao: r > 0 ? (l.receita - r) / r : null, novo: r <= 0 && l.receita > 0 });
  }
  return saida;
}

/** Em quais situações (filtros) a linha entra. "todos" sempre. */
export function situacoesDa(l: LinhaRanking, c?: ComparacaoAnterior): Set<Situacao> {
  const s = new Set<Situacao>(["todos"]);
  s.add(l.receita > 0 ? "vendendo" : "parados");
  if (l.receita > 0 && l.lucro < 0) s.add("prejuizo");
  if (l.margem !== null && l.margem >= 0 && l.margem < MARGEM_BAIXA) s.add("margem_baixa");
  if (l.taxaProblema !== null && l.taxaProblema >= CANCELAMENTO_ALTO) s.add("cancelamentos");
  if (l.custoIncompleto) s.add("sem_custo");
  if (c?.variacao != null && c.variacao <= -VARIACAO_FORTE) s.add("em_queda");
  // Parou de vender (tinha venda antes e agora não) também é queda.
  if (c && c.receitaAnterior != null && c.receitaAnterior > 0 && l.receita <= 0) s.add("em_queda");
  if ((c?.variacao != null && c.variacao >= VARIACAO_FORTE) || c?.novo) s.add("em_alta");
  return s;
}

export interface FiltrosRanking {
  busca: string;
  situacao: Situacao;
  classe: "" | "A" | "B" | "C";
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarRanking(linhas: readonly LinhaRanking[], f: FiltrosRanking, comparacao?: Map<string, ComparacaoAnterior>): LinhaRanking[] {
  const termos = semAcento(f.busca).split(/\s+/).filter(Boolean);
  return linhas.filter((l) => {
    if (f.classe && l.classe !== f.classe) return false;
    if (f.situacao !== "todos" && !situacoesDa(l, comparacao?.get(l.chave)).has(f.situacao)) return false;
    if (termos.length) {
      const alvo = semAcento(l.nome);
      if (!termos.every((t) => alvo.includes(t))) return false;
    }
    return true;
  });
}

/** Quantos anúncios caem em cada situação (para os chips), já com a busca e a classe aplicadas. */
export function contarSituacoes(linhas: readonly LinhaRanking[], comparacao?: Map<string, ComparacaoAnterior>): Record<Situacao, number> {
  const c: Record<Situacao, number> = { todos: 0, vendendo: 0, parados: 0, prejuizo: 0, margem_baixa: 0, cancelamentos: 0, em_queda: 0, em_alta: 0, sem_custo: 0 };
  for (const l of linhas) for (const s of situacoesDa(l, comparacao?.get(l.chave))) c[s]++;
  return c;
}

export type ColunaOrdem = "posicao" | "nome" | "pedidos" | "unidades" | "receita" | "lucro" | "margem" | "taxaProblema" | "variacao";

/** Ordena pela coluna clicada. Vazios (sem margem, sem comparação) vão sempre para o fim. */
export function ordenarRanking(linhas: readonly LinhaRanking[], coluna: ColunaOrdem, direcao: "asc" | "desc", comparacao?: Map<string, ComparacaoAnterior>): LinhaRanking[] {
  const valor = (l: LinhaRanking): number | string | null => {
    switch (coluna) {
      case "nome":
        return semAcento(l.nome);
      case "posicao":
        return l.posicao || null;
      case "margem":
        return l.margem;
      case "taxaProblema":
        return l.taxaProblema;
      case "variacao":
        return comparacao?.get(l.chave)?.variacao ?? null;
      default:
        return l[coluna];
    }
  };
  const sinal = direcao === "asc" ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const va = valor(a);
    const vb = valor(b);
    if (va === null && vb === null) return a.nome.localeCompare(b.nome, "pt-BR");
    if (va === null) return 1;
    if (vb === null) return -1;
    const d = typeof va === "string" ? va.localeCompare(vb as string, "pt-BR") : va - (vb as number);
    return d * sinal || b.receita - a.receita || a.nome.localeCompare(b.nome, "pt-BR");
  });
}

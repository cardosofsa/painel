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
          participacao: 0,
          acumulado: 0,
          classe: null,
          posicao: 0,
        },
        pedidosVenda: new Set(),
        pedidosTodos: new Set(),
        pedidosProblema: new Set(),
        variacoes: new Set(),
      };
      mapa.set(chave, a);
    }
    return a;
  };

  for (const an of anuncios) {
    const a = obter(an.loja_id, an.sku_principal, an.nome ?? "", an.nome_item);
    if (!a) continue;
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

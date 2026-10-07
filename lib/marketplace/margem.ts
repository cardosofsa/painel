/**
 * Margem real de pedido de marketplace: taxas que a plataforma COBROU (da planilha) + custo
 * do produto cadastrado (base + insumos, `produtos.custo`) + imposto da conta. PURO, coberto
 * por `margem.test.ts`.
 */

import { encontrarFaixa, type FaixaComissao } from "@/lib/pricing";
import type { ItemMarketplace, OrigemTaxas, PedidoMarketplace, TaxaDetalhe } from "./shopee-planilha";

export interface ProdutoVinculavel {
  id: string;
  sku: string | null;
  custo: number;
}

export interface VinculoSku {
  sku_externo: string;
  produto_id: string;
}

const chave = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * Qual produto cadastrado é cada item: primeiro o vínculo feito à mão (pelo SKU da Shopee),
 * depois SKU igual ao do produto (SKU da variação, depois o principal). null = sem vínculo.
 */
export function produtoDoItem(item: Pick<ItemMarketplace, "sku" | "skuPrincipal">, produtos: ProdutoVinculavel[], vinculos: VinculoSku[]): string | null {
  const porVinculo = new Map(vinculos.map((v) => [chave(v.sku_externo), v.produto_id]));
  const porSku = new Map(produtos.filter((p) => p.sku).map((p) => [chave(p.sku), p.id]));
  for (const s of [item.sku, item.skuPrincipal]) {
    const k = chave(s);
    if (!k) continue;
    const v = porVinculo.get(k) ?? porSku.get(k);
    if (v) return v;
  }
  return null;
}

/** Chave de SKU que o vínculo manual grava (a da variação, ou a principal). */
export function skuExterno(item: Pick<ItemMarketplace, "sku" | "skuPrincipal" | "nome" | "variacao">): string {
  return (item.sku || item.skuPrincipal || `${item.nome}${item.variacao ? ` · ${item.variacao}` : ""}`).trim();
}

export interface MargemPedido {
  receita: number;
  taxas: number;
  custo: number;
  imposto: number;
  lucro: number;
  /** Fração sobre a receita. */
  margemPct: number;
  /** Algum item sem produto vinculado (custo desconhecido, conta como 0). */
  custoIncompleto: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Linha que a RPC `importar_pedidos_marketplace` (0046) recebe. */
export interface PedidoParaGravar {
  numero: string;
  status: PedidoMarketplace["status"];
  status_original: string;
  criado_em: string | null;
  pago_em: string | null;
  comprador: string | null;
  cidade: string | null;
  uf: string | null;
  rastreio: string | null;
  logistica: string | null;
  prazo_envio: string | null;
  subtotal: number;
  desconto_vendedor: number;
  cupom_vendedor: number;
  comissao: number;
  taxa_servico: number;
  taxa_transacao: number;
  frete_comprador: number;
  repasse: number;
  custo: number;
  imposto: number;
  lucro: number;
  custo_incompleto: boolean;
  /** 0085 (ausentes na planilha antiga: a RPC trata como "planilha"). */
  taxas_origem?: OrigemTaxas;
  taxa_outras?: number;
  taxas_detalhe?: TaxaDetalhe[];
  escrow_liberado_em?: string | null;
  itens: {
    produto_id: string | null;
    sku: string | null;
    sku_principal: string | null;
    nome: string;
    variacao: string | null;
    quantidade: number;
    preco_unitario: number;
    custo_unitario: number | null;
  }[];
}

/**
 * Taxas ESTIMADAS pela regra de faixas do canal (comissão % + tarifa fixa por unidade, faixa
 * escolhida pelo preço unitário) — só para pedido cuja renda a plataforma ainda não informou.
 * Sem faixas cadastradas, fica como veio (sem taxa). PURO.
 */
export function estimarTaxasPorFaixas(p: PedidoMarketplace, faixas: FaixaComissao[]): PedidoMarketplace {
  if (p.taxasOrigem !== "estimado" || !faixas.length || p.status === "cancelado") return p;
  let comissao = 0;
  let tarifa = 0;
  for (const i of p.itens) {
    const f = encontrarFaixa(faixas, i.precoUnitario);
    comissao += i.precoUnitario * i.quantidade * (f.comissaoPct / 100);
    tarifa += (f.tarifaFixa ?? 0) * i.quantidade;
  }
  comissao = r2(comissao);
  tarifa = r2(tarifa);
  return {
    ...p,
    comissao,
    taxaServico: tarifa,
    taxaTransacao: 0,
    taxaOutras: 0,
    taxasDetalhe: [
      { rotulo: "Comissão (estimada)", valor: comissao },
      ...(tarifa > 0 ? [{ rotulo: "Tarifa por item (estimada)", valor: tarifa }] : []),
    ],
    repasse: r2(p.subtotal - p.cupomVendedor - comissao - tarifa),
  };
}

/** Vincula os itens, calcula a margem e monta o que vai para o banco. */
export function montarPedidosParaGravar(
  pedidosEntrada: PedidoMarketplace[],
  produtos: ProdutoVinculavel[],
  vinculos: VinculoSku[],
  impostoPct: number,
  /** Faixas do canal da loja, para estimar as taxas de pedido ainda sem renda informada. */
  faixas: FaixaComissao[] = [],
): PedidoParaGravar[] {
  const custo = new Map(produtos.map((p) => [p.id, p.custo]));
  const pedidos = pedidosEntrada.map((p) => estimarTaxasPorFaixas(p, faixas));
  return pedidos.map((p) => {
    const itens = p.itens.map((i) => ({ ...i, produtoId: produtoDoItem(i, produtos, vinculos) }));
    const m = margemPedido({ ...p, itens }, custo, impostoPct);
    return {
      numero: p.numero,
      status: p.status,
      status_original: p.statusOriginal,
      criado_em: p.criadoEm,
      pago_em: p.pagoEm,
      comprador: p.comprador,
      cidade: p.cidade,
      uf: p.uf,
      rastreio: p.rastreio,
      logistica: p.logistica,
      prazo_envio: p.prazoEnvio,
      subtotal: p.subtotal,
      desconto_vendedor: p.descontoVendedor,
      cupom_vendedor: p.cupomVendedor,
      comissao: p.comissao,
      taxa_servico: p.taxaServico,
      taxa_transacao: p.taxaTransacao,
      frete_comprador: p.fretePagoComprador,
      repasse: p.repasse,
      custo: m.custo,
      imposto: m.imposto,
      lucro: m.lucro,
      custo_incompleto: m.custoIncompleto,
      ...(p.taxasOrigem
        ? { taxas_origem: p.taxasOrigem, taxa_outras: p.taxaOutras ?? 0, taxas_detalhe: p.taxasDetalhe ?? [], escrow_liberado_em: p.escrowLiberadoEm ?? null }
        : {}),
      itens: itens.map((i) => ({
        produto_id: i.produtoId,
        sku: i.sku,
        sku_principal: i.skuPrincipal,
        nome: i.nome,
        variacao: i.variacao,
        quantidade: i.quantidade,
        preco_unitario: i.precoUnitario,
        custo_unitario: i.produtoId ? (custo.get(i.produtoId) ?? null) : null,
      })),
    };
  });
}

/**
 * Lucro = venda − taxas e encargos − imposto − custo. As taxas entram pelo repasse (venda −
 * tudo o que a plataforma descontou); o IMPOSTO incide sobre a VENDA (subtotal, antes de
 * qualquer taxa), como no regime da conta.
 */
export function margemPedido(
  pedido: Pick<PedidoMarketplace, "status" | "subtotal" | "cupomVendedor" | "comissao" | "taxaServico" | "taxaTransacao" | "repasse" | "taxaOutras"> & {
    itens: (Pick<ItemMarketplace, "quantidade"> & { produtoId: string | null })[];
  },
  custoPorProduto: Map<string, number>,
  /** Fração (0,06 = 6%). */
  impostoPct: number,
): MargemPedido {
  if (pedido.status === "cancelado") {
    return { receita: 0, taxas: 0, custo: 0, imposto: 0, lucro: 0, margemPct: 0, custoIncompleto: false };
  }
  let custo = 0;
  let custoIncompleto = false;
  for (const i of pedido.itens) {
    const c = i.produtoId ? custoPorProduto.get(i.produtoId) : undefined;
    if (c == null) custoIncompleto = true;
    else custo += c * i.quantidade;
  }
  const receita = pedido.subtotal;
  const taxas = pedido.cupomVendedor + pedido.comissao + pedido.taxaServico + pedido.taxaTransacao + (pedido.taxaOutras ?? 0);
  const imposto = receita * Math.max(0, impostoPct);
  const lucro = pedido.repasse - custo - imposto;
  return {
    receita: r2(receita),
    taxas: r2(taxas),
    custo: r2(custo),
    imposto: r2(imposto),
    lucro: r2(lucro),
    margemPct: receita > 0 ? lucro / receita : 0,
    custoIncompleto,
  };
}

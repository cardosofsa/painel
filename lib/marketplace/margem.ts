/**
 * Margem real de pedido de marketplace: taxas que a plataforma COBROU (da planilha) + custo
 * do produto cadastrado (base + insumos, `produtos.custo`) + imposto da conta. PURO, coberto
 * por `margem.test.ts`.
 */

import type { ItemMarketplace, PedidoMarketplace } from "./shopee-planilha";

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
 *
 * Variação sem SKU próprio (0084): o vínculo manual fica na chave "SKU principal · variação"
 * (ver `skuExterno`), que vem ANTES do principal — assim "Kit 2" e "Kit 3" do mesmo anúncio
 * vão cada um para a sua variação filha, e um vínculo antigo feito pelo principal continua
 * valendo para as variações que não ganharam vínculo próprio.
 */
export function produtoDoItem(
  item: Pick<ItemMarketplace, "sku" | "skuPrincipal"> & Partial<Pick<ItemMarketplace, "nome" | "variacao">>,
  produtos: ProdutoVinculavel[],
  vinculos: VinculoSku[],
): string | null {
  const porVinculo = new Map(vinculos.map((v) => [chave(v.sku_externo), v.produto_id]));
  const porSku = new Map(produtos.filter((p) => p.sku).map((p) => [chave(p.sku), p.id]));
  const k = chave(item.sku);
  if (k) {
    const v = porVinculo.get(k) ?? porSku.get(k);
    if (v) return v;
  }
  if (!k && item.variacao?.trim()) {
    const v = porVinculo.get(chave(skuExterno({ sku: null, skuPrincipal: item.skuPrincipal, nome: item.nome ?? "", variacao: item.variacao })));
    if (v) return v;
  }
  const kp = chave(item.skuPrincipal);
  if (kp) {
    const v = porVinculo.get(kp) ?? porSku.get(kp);
    if (v) return v;
  }
  return null;
}

/** "Azul,P" (pedido) e "Azul · P" (anúncio) viram a mesma coisa. */
export function normalizarVariacao(variacao: string): string {
  return variacao
    .trim()
    .split(/\s*[,·]\s*/)
    .filter(Boolean)
    .join(" · ");
}

/**
 * Chave de SKU que o vínculo manual grava: o SKU da variação; sem ele, "SKU principal (ou
 * nome) · variação"; sem variação, o SKU principal (ou o nome). Igual à função SQL
 * `chave_item_marketplace` (0084), que o `revincular_itens_marketplace` usa.
 */
export function skuExterno(item: Pick<ItemMarketplace, "sku" | "skuPrincipal" | "nome" | "variacao">): string {
  const sku = item.sku?.trim();
  if (sku) return sku;
  const base = item.skuPrincipal?.trim() || (item.nome ?? "").trim();
  const variacao = item.variacao?.trim() ? normalizarVariacao(item.variacao) : "";
  return variacao ? `${base} · ${variacao}` : base;
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

/** Vincula os itens, calcula a margem e monta o que vai para o banco. */
export function montarPedidosParaGravar(
  pedidos: PedidoMarketplace[],
  produtos: ProdutoVinculavel[],
  vinculos: VinculoSku[],
  impostoPct: number,
): PedidoParaGravar[] {
  const custo = new Map(produtos.map((p) => [p.id, p.custo]));
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

export function margemPedido(
  pedido: Pick<PedidoMarketplace, "status" | "subtotal" | "cupomVendedor" | "comissao" | "taxaServico" | "taxaTransacao" | "repasse"> & {
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
  const taxas = pedido.cupomVendedor + pedido.comissao + pedido.taxaServico + pedido.taxaTransacao;
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

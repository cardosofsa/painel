/**
 * Planilha de pedidos da Shopee (Central do Vendedor → Meus Pedidos → Exportar). PURO, coberto
 * por `shopee-planilha.test.ts`.
 *
 * - Uma linha por ITEM: as linhas com o mesmo "ID do pedido" viram um pedido.
 * - Os nomes de coluna mudam de tempos em tempos (e entre a versão em português e a em
 *   inglês), então cada campo aceita vários apelidos.
 * - Taxas (comissão, serviço, transação) às vezes vêm repetidas em todas as linhas do pedido
 *   e às vezes por item. Regra: se todas as linhas do pedido trazem o MESMO valor, é do
 *   pedido (conta uma vez); se variam, são por item (soma).
 */

import { lerNumero, mapearColunas, type ErroImportacao } from "@/lib/importar";

export type StatusMarketplace = "nao_pago" | "a_enviar" | "enviado" | "concluido" | "cancelado" | "devolvido";

export const ROTULO_STATUS_MARKETPLACE: Record<StatusMarketplace, string> = {
  nao_pago: "Não pago",
  a_enviar: "A enviar",
  enviado: "Enviado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
};

/** Status em que o produto saiu (ou vai sair) do estoque. */
export const STATUS_BAIXA_ESTOQUE: readonly StatusMarketplace[] = ["a_enviar", "enviado", "concluido"];

export interface ItemMarketplace {
  sku: string | null;
  skuPrincipal: string | null;
  nome: string;
  variacao: string | null;
  quantidade: number;
  /** Preço acordado (já com desconto de produto), por unidade. */
  precoUnitario: number;
  precoOriginal: number | null;
}

export interface PedidoMarketplace {
  numero: string;
  status: StatusMarketplace;
  statusOriginal: string;
  criadoEm: string | null;
  pagoEm: string | null;
  comprador: string | null;
  cidade: string | null;
  uf: string | null;
  rastreio: string | null;
  /** Opção de envio da Shopee (Shopee Express, Correios...). Definida pela plataforma. */
  logistica: string | null;
  /** Data limite para enviar (ISO). */
  prazoEnvio: string | null;
  itens: ItemMarketplace[];
  /** Σ preço acordado × quantidade. */
  subtotal: number;
  /** Informativo: já está embutido no preço acordado. */
  descontoVendedor: number;
  cupomVendedor: number;
  comissao: number;
  taxaServico: number;
  taxaTransacao: number;
  /** Frete pago pelo comprador (informativo: a Shopee repassa à transportadora). */
  fretePagoComprador: number;
  /** Quanto deve cair na conta: subtotal − cupom do vendedor − taxas. */
  repasse: number;
}

const APELIDOS = {
  numero: ["id do pedido", "n do pedido", "numero do pedido", "order id", "order sn"],
  status: ["status do pedido", "order status"],
  criadoEm: ["data de criacao do pedido", "order creation date", "data do pedido"],
  pagoEm: ["hora do pagamento do pedido", "order paid time", "data de pagamento"],
  skuPrincipal: ["n de referencia do sku principal", "nº de referencia do sku principal", "parent sku reference no", "sku principal"],
  sku: ["numero de referencia sku", "n de referencia sku", "sku reference no", "sku da variacao", "sku"],
  nome: ["nome do produto", "product name"],
  variacao: ["nome da variacao", "variation name"],
  precoOriginal: ["preco original", "original price"],
  precoAcordado: ["preco acordado", "deal price", "preco de venda"],
  quantidade: ["quantidade", "quantity"],
  subtotalItem: ["subtotal do produto", "product subtotal"],
  descontoVendedor: ["desconto do vendedor", "seller discount"],
  cupomVendedor: ["cupom do vendedor", "seller voucher", "voucher do vendedor"],
  comissao: ["taxa de comissao", "commission fee"],
  taxaServico: ["taxa de servico", "service fee"],
  taxaTransacao: ["taxa de transacao", "transaction fee"],
  fretePagoComprador: ["taxa de envio pagas pelo comprador", "taxa de envio paga pelo comprador", "buyer paid shipping fee"],
  comprador: ["nome de usuario comprador", "username buyer", "nome de usuario do comprador"],
  cidade: ["cidade", "city"],
  uf: ["uf", "estado", "state", "province"],
  rastreio: ["numero de rastreamento", "tracking number"],
  logistica: ["opcao de envio", "metodo de envio", "shipping option", "canal de envio"],
  prazoEnvio: ["data prevista de envio", "ship by date", "enviar ate"],
} as const;

/** "A Enviar", "To ship", "Concluído", "Cancelado"... → status interno. */
export function statusShopee(bruto: string): StatusMarketplace {
  const s = bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (/cancel/.test(s)) return "cancelado";
  if (/devol|reembol|return|refund/.test(s)) return "devolvido";
  if (/conclu|complet|entregue|delivered/.test(s)) return "concluido";
  if (/enviado|shipped|a caminho|em transito|shipping/.test(s) && !/a enviar|to ship|para enviar/.test(s)) return "enviado";
  if (/nao pago|a pagar|unpaid|aguardando pagamento/.test(s)) return "nao_pago";
  return "a_enviar";
}

/** "2024-05-10 14:32", "10/05/2024 14:32" ou ISO → ISO (horário de Brasília). */
export function dataShopee(bruto: string | undefined): string | null {
  const s = (bruto ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00`;
  return null;
}

const num = (v: string | undefined) => Math.abs(lerNumero(v) ?? 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Valores iguais em todas as linhas = do pedido (uma vez); diferentes = por item (soma). */
function taxaDoPedido(valores: number[]): number {
  if (valores.length === 0) return 0;
  const todosIguais = valores.every((v) => Math.abs(v - valores[0]) < 0.005);
  return r2(todosIguais ? valores[0] : valores.reduce((a, b) => a + b, 0));
}

/** Acha a linha do cabeçalho (a planilha às vezes tem título antes). */
function linhaDoCabecalho(matriz: string[][]): number {
  for (let i = 0; i < Math.min(10, matriz.length); i++) {
    const t = matriz[i].join("|").toLowerCase();
    if (/(id do pedido|order id|n. do pedido|numero do pedido)/.test(t.normalize("NFD").replace(/[̀-ͯ]/g, ""))) return i;
  }
  return 0;
}

export function interpretarPlanilhaShopee(matriz: string[][]): {
  pedidos: PedidoMarketplace[];
  erros: ErroImportacao[];
  faltando: string[];
} {
  const cab = linhaDoCabecalho(matriz);
  const { linhas, faltando } = mapearColunas(matriz, APELIDOS, ["numero", "quantidade", "nome"], cab);
  if (faltando.length) return { pedidos: [], erros: [], faltando };

  const erros: ErroImportacao[] = [];
  const grupos = new Map<string, typeof linhas>();
  for (const l of linhas) {
    const numero = (l.numero ?? "").trim();
    if (!numero) continue;
    const q = lerNumero(l.quantidade);
    if (q == null || q <= 0 || !Number.isInteger(q)) {
      erros.push({ linha: l.__linha, mensagem: `Quantidade inválida no pedido ${numero}.` });
      continue;
    }
    const g = grupos.get(numero) ?? [];
    g.push(l);
    grupos.set(numero, g);
  }

  const pedidos: PedidoMarketplace[] = [];
  for (const [numero, ls] of grupos) {
    const p0 = ls[0];
    const itens: ItemMarketplace[] = ls.map((l) => {
      const quantidade = lerNumero(l.quantidade) ?? 1;
      const acordado = lerNumero(l.precoAcordado);
      const subItem = lerNumero(l.subtotalItem);
      const precoUnitario = acordado ?? (subItem != null ? subItem / quantidade : lerNumero(l.precoOriginal) ?? 0);
      return {
        sku: l.sku?.trim() || null,
        skuPrincipal: l.skuPrincipal?.trim() || null,
        nome: l.nome?.trim() || "Produto",
        variacao: l.variacao?.trim() || null,
        quantidade,
        precoUnitario: r2(Math.abs(precoUnitario)),
        precoOriginal: lerNumero(l.precoOriginal),
      };
    });
    const subtotal = r2(itens.reduce((a, i) => a + i.precoUnitario * i.quantidade, 0));
    const descontoVendedor = taxaDoPedido(ls.map((l) => num(l.descontoVendedor)));
    const cupomVendedor = taxaDoPedido(ls.map((l) => num(l.cupomVendedor)));
    const comissao = taxaDoPedido(ls.map((l) => num(l.comissao)));
    const taxaServico = taxaDoPedido(ls.map((l) => num(l.taxaServico)));
    const taxaTransacao = taxaDoPedido(ls.map((l) => num(l.taxaTransacao)));
    const statusOriginal = (p0.status ?? "").trim();
    const status = statusShopee(statusOriginal);
    pedidos.push({
      numero,
      status,
      statusOriginal,
      criadoEm: dataShopee(p0.criadoEm),
      pagoEm: dataShopee(p0.pagoEm),
      comprador: p0.comprador?.trim() || null,
      cidade: p0.cidade?.trim() || null,
      uf: (p0.uf ?? "").trim().toUpperCase().slice(0, 2) || null,
      rastreio: p0.rastreio?.trim() || null,
      logistica: p0.logistica?.trim() || null,
      prazoEnvio: dataShopee(p0.prazoEnvio),
      itens,
      subtotal,
      descontoVendedor,
      cupomVendedor,
      comissao,
      taxaServico,
      taxaTransacao,
      fretePagoComprador: taxaDoPedido(ls.map((l) => num(l.fretePagoComprador))),
      // O desconto do vendedor já está no "preço acordado" (original − acordado): só o cupom sai daqui.
      repasse: status === "cancelado" ? 0 : r2(subtotal - cupomVendedor - comissao - taxaServico - taxaTransacao),
    });
  }
  return { pedidos, erros, faltando: [] };
}

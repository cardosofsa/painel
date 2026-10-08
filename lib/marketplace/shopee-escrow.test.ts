import { describe, expect, it } from "vitest";
import escrowResposta from "./fixtures/escrow-2610082QFT1WTB.json";
import pedidoResposta from "./fixtures/pedido-2610082QFT1WTB.json";
import { pedidoDaApi, taxasDoEscrow, type EscrowApi, type PedidoApi } from "./shopee-api";
import { estimarTaxasPorFaixas, montarPedidosParaGravar } from "./margem";

/**
 * Pedido real 2610082QFT1WTB (FITA-BIKE-UN): Subtotal 27,49; frete 0; Taxas e Encargos −10,54
 * (comissão 5,11 + serviço 4,88 [transação 0,38 + por item 4,50] + recarga automática 0,55);
 * Renda estimada 16,95. Fixtures no formato da resposta v2 da Shopee.
 */
const escrow = escrowResposta.response.order_income as EscrowApi;
const pedido = pedidoResposta.response.order_list[0] as PedidoApi;
const IMPOSTO = 0.12;
const CUSTO = 6;

describe("taxas reais do escrow (get_escrow_detail v2)", () => {
  it("encargos = venda − renda, com a recarga automática e sem contar a transação duas vezes", () => {
    const t = taxasDoEscrow(escrow, 27.49)!;
    expect(t.repasse).toBe(16.95);
    expect(t.total).toBe(10.54);
    expect(t.comissao).toBe(5.11);
    expect(t.taxaServico).toBe(4.88);
    // A taxa de serviço líquida (4,88) já inclui a de transação (0,38).
    expect(t.taxaTransacao).toBe(0);
    expect(t.outras).toBe(0.55);
    expect(t.detalhe).toEqual([
      { rotulo: "Comissão", valor: 5.11 },
      { rotulo: "Taxa de serviço", valor: 4.88 },
      { rotulo: "Taxa da recarga automática", valor: 0.55 },
    ]);
  });

  it("transação separada da taxa de serviço também fecha em 10,54", () => {
    const t = taxasDoEscrow({ ...escrow, service_fee: 4.5, seller_transaction_fee: 0.38 }, 27.49)!;
    expect(t.total).toBe(10.54);
    expect(t.taxaTransacao).toBe(0.38);
    expect(t.outras).toBe(0.55);
  });

  it("taxa que a Shopee criou e o código não conhece vira 'Outros ajustes' e a soma bate", () => {
    const t = taxasDoEscrow({ ...escrow, service_fee: 4.5, escrow_amount: 16.45 }, 27.49)!;
    expect(t.total).toBe(11.04);
    expect(t.detalhe.at(-1)).toEqual({ rotulo: "Outros ajustes da plataforma", valor: 0.5 });
    expect(t.comissao + t.taxaServico + t.taxaTransacao + t.outras + t.cupomVendedor).toBeCloseTo(11.04, 2);
  });

  it("frete pago pelo vendedor e valor depois de ajuste", () => {
    const t = taxasDoEscrow({ ...escrow, final_shipping_fee: -3, escrow_amount: 13.95, escrow_amount_after_adjustment: 13.45 }, 27.49)!;
    expect(t.repasse).toBe(13.45);
    expect(t.detalhe).toContainEqual({ rotulo: "Frete pago pelo vendedor", valor: 3 });
    expect(t.total).toBe(14.04);
  });

  it("sem escrow_amount não há taxa real (cai na estimativa)", () => {
    expect(taxasDoEscrow(null, 27.49)).toBeNull();
    expect(taxasDoEscrow({ commission_fee: 5.11 }, 27.49)).toBeNull();
  });
});

describe("lucro do pedido 2610082QFT1WTB", () => {
  it("venda − taxas reais − imposto sobre a VENDA − custo", () => {
    const p = pedidoDaApi(pedido, escrow, "2026-10-12T15:00:00.000Z");
    expect(p.taxasOrigem).toBe("real");
    expect(p.status).toBe("concluido");
    expect(p.repasse).toBe(16.95);
    expect(p.escrowLiberadoEm).toBe("2026-10-12T15:00:00.000Z");
    const [g] = montarPedidosParaGravar([p], [{ id: "fita", sku: "FITA-BIKE-UN", custo: CUSTO }], [], IMPOSTO);
    // Imposto sobre 27,49 (não sobre a renda de 16,95): 3,30.
    expect(g.imposto).toBe(3.3);
    expect(g.lucro).toBe(Math.round((27.49 - 10.54 - 3.3 - CUSTO) * 100) / 100);
    expect(g.lucro).toBe(7.65);
    expect(g.taxas_origem).toBe("real");
    expect(g.taxa_outras).toBe(0.55);
    expect(g.comissao + g.taxa_servico + g.taxa_transacao + (g.taxa_outras ?? 0) + g.cupom_vendedor).toBeCloseTo(10.54, 2);
    expect(g.taxas_detalhe?.map((t) => t.rotulo)).toContain("Taxa da recarga automática");
  });

  it("sem a renda: estimado pelas faixas do canal (20% + R$ 4,50 por item)", () => {
    const p = pedidoDaApi(pedido, null);
    expect(p.taxasOrigem).toBe("estimado");
    const faixas = [{ min: 0, max: null, comissaoPct: 20, tarifaFixa: 4.5 }];
    const e = estimarTaxasPorFaixas(p, faixas);
    expect(e.comissao).toBe(5.5);
    expect(e.taxaServico).toBe(4.5);
    expect(e.repasse).toBe(17.49);
    const [g] = montarPedidosParaGravar([p], [{ id: "fita", sku: "FITA-BIKE-UN", custo: CUSTO }], [], IMPOSTO, faixas);
    expect(g.taxas_origem).toBe("estimado");
    expect(g.lucro).toBe(Math.round((27.49 - 10 - 3.3 - CUSTO) * 100) / 100);
  });

  it("pedido com taxa real não é reestimado pelas faixas", () => {
    const p = pedidoDaApi(pedido, escrow);
    expect(estimarTaxasPorFaixas(p, [{ min: 0, max: null, comissaoPct: 20, tarifaFixa: 4.5 }])).toBe(p);
  });

  it("cancelado não repassa nada", () => {
    const p = pedidoDaApi({ ...pedido, order_status: "CANCELLED" }, escrow);
    expect(p.repasse).toBe(0);
  });
});

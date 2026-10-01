import { describe, expect, it } from "vitest";
import { corDaTag, listaResumo, listaSeparacao, normalizarTags, romaneio } from "./expedicao";
import type { PedidoCentral } from "./pedidos-central";

const pedido = (o: Partial<PedidoCentral>): PedidoCentral => ({
  chave: "venda:1",
  origem: "pdv",
  id: "1",
  numero: "V-0001",
  numeroExterno: null,
  data: "2026-10-01T10:00:00.000Z",
  pagoEm: null,
  cliente: "Ana",
  cidade: "Recife",
  uf: "PE",
  canal: "PDV",
  loja: null,
  lojaId: null,
  itens: [],
  total: 0,
  custo: 0,
  taxas: 0,
  lucro: 0,
  etapa: "enviar",
  pagamento: "pago",
  formaPagamento: null,
  logistica: "Correios",
  logisticaFixa: false,
  prazoEnvio: null,
  semCusto: false,
  motivoReserva: null,
  tags: [],
  observacaoInterna: null,
  oculto: false,
  editavel: true,
  ...o,
});

const pedidos = [
  pedido({ chave: "venda:1", numero: "V-1", itens: [{ nome: "Fita preta", sku: "FITA-P", quantidade: 2, preco: 10 }, { nome: "Luva", sku: "LUVA", quantidade: 1, preco: 30 }] }),
  pedido({ chave: "mkt:2", numero: "2610ABC", numeroExterno: "2610ABC", canal: "Shopee", loja: "cardosoeshop", cliente: "felipe", logistica: "Shopee Xpress", itens: [{ nome: "Fita preta", sku: "fita-p", quantidade: 3, preco: 10 }, { nome: "Brinde", sku: null, quantidade: 1, preco: 0 }] }),
];

describe("listaSeparacao", () => {
  it("soma por SKU (sem diferenciar maiúscula) e conta em quantos pedidos aparece", () => {
    const t = listaSeparacao(pedidos);
    expect(t.linhas.map((l) => [l.sku, l.quantidade, l.pedidos])).toEqual([
      ["—", 1, 1],
      ["FITA-P", 5, 2],
      ["LUVA", 1, 1],
    ]);
    expect(t.total).toEqual(["Total", null, 7, 2, null]);
  });
});

describe("listaResumo", () => {
  it("uma linha por item, cabeçalho do pedido só na primeira", () => {
    const t = listaResumo(pedidos);
    expect(t.linhas).toHaveLength(4);
    expect(t.linhas[0]).toMatchObject({ pedido: "V-1", canal: "PDV", produto: "Fita preta" });
    expect(t.linhas[1].pedido).toBe("");
    expect(t.linhas[2]).toMatchObject({ pedido: "2610ABC", canal: "Shopee · cardosoeshop" });
  });
});

describe("romaneio", () => {
  it("um pacote por pedido, destino, logística, rastreio e linha de assinatura", () => {
    const t = romaneio(pedidos, { "mkt:2": "BR123" });
    expect(t.linhas.map((l) => [l.pedido, l.destino, l.rastreio])).toEqual([
      ["V-1", "Recife/PE", ""],
      ["2610ABC", "Recife/PE", "BR123"],
    ]);
    expect(t.subtitulo).toContain("Correios, Shopee Xpress");
    expect(String(t.total?.[1])).toContain("Assinatura");
  });
});

describe("tags", () => {
  it("normaliza: corta espaços, tira repetidas, até 8", () => {
    expect(normalizarTags("urgente, Brinde,  urgente ;  ")).toEqual(["urgente", "Brinde"]);
    expect(normalizarTags(Array.from({ length: 12 }, (_, i) => `t${i}`).join(","))).toHaveLength(8);
  });
  it("cor estável e dentro da paleta", () => {
    expect(corDaTag("Urgente")).toBe(corDaTag("urgente"));
    expect(corDaTag("x")).toBeGreaterThanOrEqual(0);
    expect(corDaTag("x")).toBeLessThan(6);
  });
});

import { describe, expect, it } from "vitest";
import {
  contarEtapas,
  etapaDaVenda,
  etapaDoMarketplace,
  filtrarCentral,
  FILTROS_VAZIOS,
  indicadores,
  montarCentral,
  type FiltrosCentral,
  type PedidoMktIn,
  type VendaIn,
} from "./pedidos-central";

const venda = (o: Partial<VendaIn>): VendaIn => ({
  id: "v1",
  numero: "V-0001",
  data_venda: "2026-10-01T15:00:00.000Z",
  cliente_nome: "Ana",
  forma_pagamento: "Pix",
  status: "paga",
  status_envio: null,
  total: 100,
  custo_total: 40,
  lucro: 50,
  observacao: null,
  venda_itens: [{ produto_nome: "Fita", produto_sku: "FITA-1", quantidade: 1, preco_unitario: 100 }],
  ...o,
});

const mkt = (o: Partial<PedidoMktIn>): PedidoMktIn => ({
  id: "m1",
  loja_id: "l1",
  numero: "2610ABC",
  status: "a_enviar",
  status_original: "READY_TO_SHIP",
  criado_em_plataforma: "2026-10-01T14:00:00.000Z",
  pago_em: "2026-10-01T14:05:00.000Z",
  comprador: "felipe",
  cidade: "Ribeirão Pires",
  uf: "SP",
  subtotal: 92.89,
  cupom_vendedor: 0,
  comissao: 13,
  taxa_servico: 4,
  taxa_transacao: 0,
  custo: 40,
  lucro: 20.54,
  custo_incompleto: false,
  logistica: "Shopee Xpress",
  pedidos_marketplace_itens: [{ sku: "FITA-MOTO-UN", nome: "Fita moto", variacao: null, quantidade: 1, preco_unitario: 92.89 }],
  ...o,
});

const f = (o: Partial<FiltrosCentral> = {}): FiltrosCentral => ({ ...FILTROS_VAZIOS, periodo: { inicio: "2026-10-01", fim: "2026-10-01" }, ...o });
const lojas = [{ id: "l1", nome: "cardosoeshop", canalNome: "Shopee" }];

describe("etapas", () => {
  it("venda: etapa da 0047; sem ela, deduz do status_envio; cancelada é cancelada", () => {
    expect(etapaDaVenda({ status: "paga", etapa: "emitir" })).toBe("emitir");
    expect(etapaDaVenda({ status: "paga", status_envio: "separacao" })).toBe("imprimir");
    expect(etapaDaVenda({ status: "fiado", status_envio: "enviado" })).toBe("enviado");
    expect(etapaDaVenda({ status: "paga", status_envio: null })).toBe("concluido");
    expect(etapaDaVenda({ status: "cancelada", etapa: "emitir" })).toBe("cancelado");
  });
  it("marketplace: status da Shopee vira etapa", () => {
    expect(etapaDoMarketplace("a_enviar", "READY_TO_SHIP")).toBe("imprimir");
    expect(etapaDoMarketplace("a_enviar", "A Enviar")).toBe("imprimir");
    expect(etapaDoMarketplace("a_enviar", "PROCESSED")).toBe("enviar");
    expect(etapaDoMarketplace("enviado", "SHIPPED")).toBe("enviado");
    expect(etapaDoMarketplace("concluido", "COMPLETED")).toBe("concluido");
    expect(etapaDoMarketplace("nao_pago", "UNPAID")).toBe("pagamento");
    expect(etapaDoMarketplace("devolvido", "TO_RETURN")).toBe("cancelado");
  });
});

describe("montarCentral", () => {
  const lista = montarCentral({
    vendas: [venda({ id: "v1", etapa: "emitir" }), venda({ id: "v2", numero: "V-0002", etapa: "concluido" })],
    pedidosCatalogo: [
      { id: "c1", numero: "P-0009", cliente_nome: "Bia", total: 59.7, status: "pendente", criado_em: "2026-10-01T10:00:00.000Z", venda_id: null, itens: [{ produto_nome: "Kit", quantidade: 1, preco_unitario: 59.7 }] },
      { id: "c2", numero: "P-0008", cliente_nome: "Ana", total: 100, status: "convertido", criado_em: "2026-09-30T10:00:00.000Z", venda_id: "v1", entrega_uf: "pe", itens: [] },
    ],
    marketplace: [mkt({})],
    lojas,
  });

  it("junta as três origens; pedido já convertido não duplica", () => {
    expect(lista.map((p) => p.chave).sort()).toEqual(["catalogo:c1", "mkt:m1", "venda:v1", "venda:v2"]);
  });
  it("venda vinda do catálogo leva origem, nº do pedido e UF da entrega", () => {
    const v1 = lista.find((p) => p.chave === "venda:v1")!;
    expect(v1.origem).toBe("catalogo");
    expect(v1.numeroExterno).toBe("P-0008");
    expect(v1.uf).toBe("PE");
  });
  it("pedido do catálogo a confirmar está em Para Emitir e pode ser aprovado", () => {
    const c1 = lista.find((p) => p.chave === "catalogo:c1")!;
    expect(c1.etapa).toBe("emitir");
    expect(c1.editavel).toBe(true);
    expect(c1.pagamento).toBe("pendente");
  });
  it("marketplace: loja, canal, taxas, logística travada", () => {
    const m = lista.find((p) => p.chave === "mkt:m1")!;
    expect(m).toMatchObject({ canal: "Shopee", loja: "cardosoeshop", taxas: 17, lucro: 20.54, logistica: "Shopee Xpress", logisticaFixa: true, editavel: false, etapa: "imprimir" });
  });

  it("pendentes aparecem fora do período; concluídos respeitam o período", () => {
    const antigas = montarCentral({
      vendas: [venda({ id: "a", data_venda: "2026-09-20T12:00:00.000Z", etapa: "imprimir" }), venda({ id: "b", data_venda: "2026-09-20T12:00:00.000Z", etapa: "concluido" })],
      pedidosCatalogo: [],
      marketplace: [],
      lojas,
    });
    const r = filtrarCentral(antigas, f(), "todos").map((p) => p.id);
    expect(r).toEqual(["a"]);
    expect(contarEtapas(antigas, f()).imprimir).toBe(1);
    expect(contarEtapas(antigas, f()).concluido).toBe(0);
  });

  it("filtros: canal/loja, busca por SKU, UF, prejuízo, sem custo", () => {
    expect(filtrarCentral(lista, f({ canais: ["loja:l1"] }), "todos").map((p) => p.chave)).toEqual(["mkt:m1"]);
    expect(filtrarCentral(lista, f({ canais: ["pdv"] }), "todos").map((p) => p.chave)).toEqual(["venda:v2"]);
    expect(filtrarCentral(lista, f({ busca: "fita-moto" }), "todos").map((p) => p.chave)).toEqual(["mkt:m1"]);
    expect(filtrarCentral(lista, f({ uf: "sp" }), "todos").map((p) => p.chave)).toEqual(["mkt:m1"]);
    expect(filtrarCentral(lista, f({ soPrejuizo: true }), "todos")).toHaveLength(0);
    const semCusto = montarCentral({ vendas: [], pedidosCatalogo: [], marketplace: [mkt({ custo_incompleto: true })], lojas });
    expect(filtrarCentral(semCusto, f({ soSemCusto: true }), "todos")).toHaveLength(1);
  });

  it("indicadores contam só pedidos válidos do período", () => {
    const i = indicadores(lista, f());
    // v1 (100) + v2 (100) + mkt (92,89); pedido a confirmar fica de fora
    expect(i.pedidos).toBe(3);
    expect(i.valor).toBeCloseTo(292.89);
    expect(i.lucro).toBeCloseTo(120.54);
  });
});

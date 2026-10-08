import { describe, expect, it } from "vitest";
import { contarCancelamentos, contarSubabas, diasParaResponder, filtrarRetornos, ordenarRetornos, retornoDeDevolucaoSistema, retornoDeLinhaShopee, retornoDePedidoCancelado, rotuloStatusShopee, subabaDoRetorno } from "./retornos";

const lojas = new Map([["L1", "Cardoso e-Shop"]]);
const shopee = (id: string, status: string, extra: Record<string, unknown> = {}) =>
  retornoDeLinhaShopee({ id, loja_id: "L1", return_sn: `SN${id}`, numero_pedido: "2610ABC", status, motivo: "Produto com defeito", valor_reembolso: 39.9, comprador: "maria_s", rastreio: null, itens: [{ nome: "Fita de cetim", quantidade: 2 }], criado_em_plataforma: `2026-10-0${id}T12:00:00Z`, prazo_resposta: null, ...extra }, lojas);

describe("subabaDoRetorno", () => {
  it("mapeia os status da Shopee para as sub-abas", () => {
    expect(subabaDoRetorno("REQUESTED", null)).toBe("em_analise");
    expect(subabaDoRetorno("JUDGING", null)).toBe("em_analise");
    expect(subabaDoRetorno("ACCEPTED", "BR1")).toBe("em_devolucao");
    expect(subabaDoRetorno("ACCEPTED", null)).toBe("aprovadas");
    expect(subabaDoRetorno("PROCESSING", null)).toBe("em_devolucao");
    expect(subabaDoRetorno("CLOSED", null)).toBe("aprovadas");
    expect(subabaDoRetorno("SELLER_DISPUTE", null)).toBe("em_disputa");
    expect(subabaDoRetorno("CANCELLED", null)).toBe("canceladas");
  });
  it("status novo ou em minúsculas não some: vai para análise (ou segue o mapa)", () => {
    expect(subabaDoRetorno("ALGO_NOVO", null)).toBe("em_analise");
    expect(subabaDoRetorno("cancelled", null)).toBe("canceladas");
  });
  it("o chip mostra o rótulo e o status original para conferência", () => {
    expect(rotuloStatusShopee("JUDGING")).toBe("Em análise · JUDGING");
    expect(rotuloStatusShopee("ALGO_NOVO")).toBe("ALGO_NOVO");
  });
});

describe("cartões", () => {
  it("retorno da Shopee traz loja, pedido, itens e sub-aba", () => {
    const r = shopee("1", "ACCEPTED", { rastreio: "BR9" });
    expect(r).toMatchObject({ origem: "shopee", loja: "Cardoso e-Shop", numeroPedido: "2610ABC", referencia: "SN1", subaba: "em_devolucao", valor: 39.9, rastreio: "BR9" });
    expect(r.itens).toEqual([{ nome: "Fita de cetim", quantidade: 2 }]);
  });
  it("devolução do sistema entra em Aprovadas com a forma do reembolso", () => {
    const r = retornoDeDevolucaoSistema({ id: "d1", numero: "D-0001", tipo: "devolucao", motivo: "Não gostou", valor_estorno: "25.5", forma: "abater", criado_em: "2026-10-03T10:00:00Z", vendas: { numero: "V-0007", cliente_nome: "João" } });
    expect(r).toMatchObject({ origem: "sistema", subaba: "aprovadas", numeroPedido: "V-0007", comprador: "João", valor: 25.5, statusRotulo: "Devolução · abatido do fiado" });
    expect(retornoDeDevolucaoSistema({ id: "d2", numero: "D-2", tipo: "troca", forma: "troca", vendas: null }).statusRotulo).toBe("Troca · troca");
  });
});

describe("lista", () => {
  const lista = ordenarRetornos([shopee("1", "REQUESTED"), shopee("2", "JUDGING"), shopee("3", "SELLER_DISPUTE"), shopee("4", "CANCELLED"), retornoDeDevolucaoSistema({ id: "d1", numero: "D-1", tipo: "devolucao", forma: "reembolso", criado_em: "2026-10-05T00:00:00Z", vendas: null })]);
  it("ordena do mais recente ao mais antigo", () => {
    expect(lista.map((r) => r.id)).toEqual(["sistema:d1", "shopee:4", "shopee:3", "shopee:2", "shopee:1"]);
  });
  it("conta por sub-aba; Todos é o total", () => {
    expect(contarSubabas(lista)).toEqual({ todos: 5, em_analise: 2, em_devolucao: 0, aprovadas: 1, em_disputa: 1, canceladas: 1, pedidos_cancelados: 0 });
  });
  it("filtra por sub-aba e por busca sem acento", () => {
    expect(filtrarRetornos(lista, "em_disputa", "").map((r) => r.referencia)).toEqual(["SN3"]);
    expect(filtrarRetornos(lista, "todos", "CETIM").length).toBe(4);
    expect(filtrarRetornos(lista, "todos", "defeíto").length).toBe(4);
    expect(filtrarRetornos(lista, "todos", "sn2").map((r) => r.referencia)).toEqual(["SN2"]);
    expect(filtrarRetornos(lista, "aprovadas", "cetim")).toEqual([]);
  });
});

describe("diasParaResponder", () => {
  it("conta os dias até o prazo no fuso de Brasília", () => {
    expect(diasParaResponder("2026-10-12T15:00:00Z", "2026-10-10")).toBe(2);
    expect(diasParaResponder("2026-10-08T15:00:00Z", "2026-10-10")).toBe(-2);
    expect(diasParaResponder("2026-10-11T01:00:00Z", "2026-10-10")).toBe(0);
    expect(diasParaResponder(null, "2026-10-10")).toBeNull();
  });
});

describe("pedidos cancelados", () => {
  const cancelado = (chave: string, origem: "pdv" | "catalogo" | "marketplace", canceladoPor: "comprador" | "vendedor" | "sistema" | null, extra: object = {}) =>
    retornoDePedidoCancelado({ chave, origem, numero: `N-${chave}`, loja: origem === "marketplace" ? "Cardoso e-Shop" : null, canal: "Shopee", cliente: "Ana", total: 50, data: "2026-10-04T12:00:00Z", canceladoPor, motivo: null, itens: [{ nome: "Fita", quantidade: 1 }], ...extra });

  it("diz quem cancelou: comprador, vendedor, sistema da Shopee ou o meu sistema", () => {
    expect(cancelado("a", "marketplace", "comprador")).toMatchObject({ quem: "comprador", statusRotulo: "Cancelado pelo comprador", origem: "shopee", subaba: "pedidos_cancelados" });
    expect(cancelado("b", "marketplace", "vendedor").statusRotulo).toBe("Cancelado pelo vendedor");
    expect(cancelado("c", "marketplace", "sistema")).toMatchObject({ quem: "sistema_shopee", statusRotulo: "Cancelado pelo sistema da Shopee" });
    expect(cancelado("d", "pdv", null)).toMatchObject({ quem: "painel", origem: "sistema", statusRotulo: "Cancelado no meu sistema" });
    expect(cancelado("e", "catalogo", null).quem).toBe("painel");
  });
  it("pedido antigo da Shopee, sem a informação, fica só Cancelado", () => {
    expect(cancelado("f", "marketplace", null)).toMatchObject({ quem: "desconhecido", statusRotulo: "Cancelado" });
  });
  it("conta e filtra por quem cancelou; Todos mistura devoluções e cancelados", () => {
    const todos = [shopee("1", "REQUESTED"), cancelado("a", "marketplace", "comprador"), cancelado("c", "marketplace", "sistema"), cancelado("d", "pdv", null), cancelado("f", "marketplace", null)];
    expect(contarCancelamentos(todos)).toEqual({ todos: 4, comprador: 1, vendedor: 0, sistema_shopee: 1, painel: 1, desconhecido: 1 });
    expect(contarSubabas(todos)).toMatchObject({ todos: 5, em_analise: 1, pedidos_cancelados: 4 });
    expect(filtrarRetornos(todos, "pedidos_cancelados", "", "sistema_shopee").map((r) => r.referencia)).toEqual(["N-c"]);
    expect(filtrarRetornos(todos, "pedidos_cancelados", "", "todos")).toHaveLength(4);
    // O filtro de quem só vale nessa sub-aba.
    expect(filtrarRetornos(todos, "todos", "", "comprador")).toHaveLength(5);
  });
});

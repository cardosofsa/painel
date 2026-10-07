import { describe, expect, it } from "vitest";
import { dataShopee, interpretarPlanilhaShopee, statusShopee } from "./shopee-planilha";
import { margemPedido, montarPedidosParaGravar, normalizarVariacao, produtoDoItem, skuExterno } from "./margem";

// Amostra no formato da exportação da Central do Vendedor (colunas reais, valores inventados).
const CAB = [
  "ID do pedido",
  "Status do pedido",
  "Data de criação do pedido",
  "Hora do pagamento do pedido",
  "Nº de referência do SKU principal",
  "Nome do Produto",
  "Número de referência SKU",
  "Nome da variação",
  "Preço original",
  "Preço acordado",
  "Quantidade",
  "Subtotal do produto",
  "Cupom do vendedor",
  "Taxa de comissão",
  "Taxa de serviço",
  "Taxa de transação",
  "Nome de usuário (comprador)",
  "Cidade",
  "UF",
];

const PLANILHA = [
  CAB,
  ["2405A1", "A Enviar", "2024-05-10 14:32", "2024-05-10 14:35", "FITA", "Fita de guidão", "FITA-PRETA", "Preta", "39,90", "34,90", "2", "69,80", "0", "11,17", "4,19", "1,40", "joao_b", "Recife", "PE"],
  ["2405A1", "A Enviar", "2024-05-10 14:32", "2024-05-10 14:35", "LUVA", "Luva", "LUVA-M", "M", "50,00", "50,00", "1", "50,00", "0", "11,17", "4,19", "1,40", "joao_b", "Recife", "PE"],
  ["2405B2", "Cancelado", "11/05/2024 09:00", "", "FITA", "Fita de guidão", "FITA-AZUL", "Azul", "39,90", "34,90", "1", "34,90", "5,00", "5,58", "2,09", "0,70", "maria", "Natal", "rn"],
  ["2405C3", "Concluído", "2024-05-12 10:00", "2024-05-12 10:01", "", "Kit", "", "", "", "100", "1", "100", "10", "14", "6", "2", "ana", "Recife", "PE"],
];

describe("statusShopee", () => {
  it("traduz os status da Shopee", () => {
    expect(statusShopee("A Enviar")).toBe("a_enviar");
    expect(statusShopee("To ship")).toBe("a_enviar");
    expect(statusShopee("Enviado")).toBe("enviado");
    expect(statusShopee("Concluído")).toBe("concluido");
    expect(statusShopee("Cancelado")).toBe("cancelado");
    expect(statusShopee("Não pago")).toBe("nao_pago");
    expect(statusShopee("Devolução/Reembolso")).toBe("devolvido");
  });
});

describe("dataShopee", () => {
  it("aceita AAAA-MM-DD e DD/MM/AAAA, com horário de Brasília", () => {
    expect(dataShopee("2024-05-10 14:32")).toBe("2024-05-10T14:32:00-03:00");
    expect(dataShopee("11/05/2024 09:00")).toBe("2024-05-11T09:00:00-03:00");
    expect(dataShopee("")).toBeNull();
    expect(dataShopee("ontem")).toBeNull();
  });
});

describe("interpretarPlanilhaShopee", () => {
  const { pedidos, erros, faltando } = interpretarPlanilhaShopee(PLANILHA);

  it("agrupa as linhas pelo ID do pedido", () => {
    expect(faltando).toEqual([]);
    expect(erros).toEqual([]);
    expect(pedidos.map((p) => p.numero)).toEqual(["2405A1", "2405B2", "2405C3"]);
    expect(pedidos[0].itens).toHaveLength(2);
  });

  it("taxa repetida em todas as linhas conta uma vez só", () => {
    const p = pedidos[0];
    expect(p.subtotal).toBe(119.8);
    expect(p.comissao).toBe(11.17);
    expect(p.taxaServico).toBe(4.19);
    expect(p.repasse).toBe(103.04);
  });

  it("lê comprador, cidade, UF em maiúscula e datas", () => {
    expect(pedidos[1].uf).toBe("RN");
    expect(pedidos[0].cidade).toBe("Recife");
    expect(pedidos[0].criadoEm).toBe("2024-05-10T14:32:00-03:00");
    expect(pedidos[1].pagoEm).toBeNull();
  });

  it("cancelado não tem repasse", () => {
    expect(pedidos[1].status).toBe("cancelado");
    expect(pedidos[1].repasse).toBe(0);
  });

  it("cupom do vendedor sai do repasse", () => {
    expect(pedidos[2].repasse).toBe(68);
  });

  it("taxa diferente por linha é somada", () => {
    const m = [CAB, [...PLANILHA[1]], [...PLANILHA[2]]];
    m[2][13] = "5,00";
    const r = interpretarPlanilhaShopee(m);
    expect(r.pedidos[0].comissao).toBe(16.17);
  });

  it("acha o cabeçalho mesmo com linha de título antes", () => {
    const r = interpretarPlanilhaShopee([["Relatório de pedidos"], ...PLANILHA]);
    expect(r.pedidos).toHaveLength(3);
  });

  it("aponta coluna obrigatória que falta e quantidade inválida", () => {
    expect(interpretarPlanilhaShopee([["Pedido", "Nome do Produto"]]).faltando).toContain("numero");
    const m = [CAB, [...PLANILHA[1]]];
    m[1][10] = "1,5";
    const r = interpretarPlanilhaShopee(m);
    expect(r.erros[0].linha).toBe(2);
    expect(r.pedidos).toHaveLength(0);
  });
});

describe("vínculo e margem", () => {
  const produtos = [
    { id: "p1", sku: "FITA-PRETA", custo: 12 },
    { id: "p2", sku: "luva-m", custo: 20 },
  ];

  it("vínculo manual vence; senão SKU igual sem diferenciar maiúscula", () => {
    expect(produtoDoItem({ sku: "LUVA-M", skuPrincipal: "LUVA" }, produtos, [])).toBe("p2");
    expect(produtoDoItem({ sku: "FITA-AZUL", skuPrincipal: "FITA" }, produtos, [{ sku_externo: "fita-azul", produto_id: "p1" }])).toBe("p1");
    expect(produtoDoItem({ sku: null, skuPrincipal: null }, produtos, [])).toBeNull();
  });

  it("skuExterno usa o SKU, ou nome + variação sem SKU", () => {
    expect(skuExterno({ sku: "A", skuPrincipal: "B", nome: "X", variacao: null })).toBe("A");
    expect(skuExterno({ sku: null, skuPrincipal: null, nome: "Kit", variacao: "Azul" })).toBe("Kit · Azul");
  });

  it("skuExterno: variação sem SKU próprio vira 'SKU principal · variação' (0084)", () => {
    expect(skuExterno({ sku: null, skuPrincipal: "FITA", nome: "Fita", variacao: "Kit 2" })).toBe("FITA · Kit 2");
    expect(skuExterno({ sku: "  ", skuPrincipal: "FITA", nome: "Fita", variacao: null })).toBe("FITA");
    // "Azul,P" (pedido) e "Azul · P" (anúncio) dão a mesma chave.
    expect(skuExterno({ sku: null, skuPrincipal: "X", nome: "n", variacao: "Azul,P" })).toBe(skuExterno({ sku: null, skuPrincipal: "X", nome: "n", variacao: "Azul · P" }));
    expect(normalizarVariacao(" Azul , P ")).toBe("Azul · P");
  });

  it("cada variação do anúncio vai para a sua variação filha; o vínculo do principal fica de reserva", () => {
    const vinculos = [
      { sku_externo: "fita · kit 2", produto_id: "k2" },
      { sku_externo: "FITA · Kit 3", produto_id: "k3" },
      { sku_externo: "FITA", produto_id: "pai" },
    ];
    expect(produtoDoItem({ sku: null, skuPrincipal: "FITA", nome: "Fita", variacao: "Kit 2" }, produtos, vinculos)).toBe("k2");
    expect(produtoDoItem({ sku: null, skuPrincipal: "FITA", nome: "Fita", variacao: "Kit 3" }, produtos, vinculos)).toBe("k3");
    expect(produtoDoItem({ sku: null, skuPrincipal: "FITA", nome: "Fita", variacao: "Kit 4" }, produtos, vinculos)).toBe("pai");
    // SKU da variação continua valendo primeiro.
    expect(produtoDoItem({ sku: "LUVA-M", skuPrincipal: "FITA", nome: "Fita", variacao: "Kit 2" }, produtos, vinculos)).toBe("p2");
  });

  it("lucro = repasse − custo − imposto", () => {
    const { pedidos } = interpretarPlanilhaShopee(PLANILHA);
    const p = pedidos[0];
    const itens = p.itens.map((i) => ({ ...i, produtoId: produtoDoItem(i, produtos, []) }));
    const m = margemPedido({ ...p, itens }, new Map(produtos.map((x) => [x.id, x.custo])), 0.06);
    expect(m.custo).toBe(44);
    expect(m.taxas).toBe(16.76);
    expect(m.imposto).toBe(7.19);
    expect(m.lucro).toBe(51.85);
    expect(m.custoIncompleto).toBe(false);
  });

  it("montarPedidosParaGravar leva vínculo, custo unitário e margem", () => {
    const { pedidos } = interpretarPlanilhaShopee(PLANILHA);
    const [g] = montarPedidosParaGravar(pedidos.slice(0, 1), produtos, [], 0.06);
    expect(g.numero).toBe("2405A1");
    expect(g.itens.map((i) => [i.produto_id, i.custo_unitario])).toEqual([
      ["p1", 12],
      ["p2", 20],
    ]);
    expect(g.lucro).toBe(51.85);
    expect(g.repasse).toBe(103.04);
  });

  it("item sem vínculo marca custo incompleto; cancelado zera", () => {
    const { pedidos } = interpretarPlanilhaShopee(PLANILHA);
    const p = pedidos[2];
    const m = margemPedido({ ...p, itens: p.itens.map((i) => ({ ...i, produtoId: null })) }, new Map(), 0);
    expect(m.custoIncompleto).toBe(true);
    expect(m.lucro).toBe(68);
    const c = margemPedido({ ...pedidos[1], itens: [] }, new Map(), 0.06);
    expect(c.receita).toBe(0);
  });
});

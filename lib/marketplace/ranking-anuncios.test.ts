import { describe, expect, it } from "vitest";
import { compararComAnterior, contarSituacoes, filtrarRanking, ordenarRanking, rankearAnuncios, resumirRanking, situacoesDa, type AnuncioCadastrado, type PedidoRanking } from "./ranking-anuncios";

const INI = new Date("2026-10-01T00:00:00Z");
const FIM = new Date("2026-10-31T23:59:59Z");

function pedido(p: Partial<PedidoRanking> & Pick<PedidoRanking, "itens">): PedidoRanking {
  return { loja_id: "L1", status: "concluido", criado_em_plataforma: "2026-10-10T12:00:00Z", lucro: 0, custo_incompleto: false, ...p };
}
const item = (sku: string | null, nome: string, qtd: number, preco: number, variacao: string | null = null) => ({ sku_principal: sku, nome, variacao, quantidade: qtd, preco_unitario: preco });
const anuncio = (sku: string | null, nomeItem: string): AnuncioCadastrado => ({ loja_id: "L1", sku_principal: sku, nome_item: nomeItem, nome: nomeItem, imagem_url: null, link: null });

describe("rankearAnuncios", () => {
  it("soma as variações do mesmo anúncio e ordena por receita", () => {
    const r = rankearAnuncios(
      [
        pedido({ lucro: 10, itens: [item("KIT-A", "Kit A", 1, 50, "P")] }),
        pedido({ lucro: 20, itens: [item("KIT-A", "Kit A", 2, 50, "M")] }),
        pedido({ lucro: 5, itens: [item("KIT-B", "Kit B", 1, 40)] }),
      ],
      [],
      INI,
      FIM,
    );
    expect(r.map((l) => l.nome)).toEqual(["Kit A", "Kit B"]);
    expect(r[0]).toMatchObject({ pedidos: 2, unidades: 3, receita: 150, lucro: 30, variacoes: 2, posicao: 1 });
    expect(r[0].margem).toBeCloseTo(0.2);
  });

  it("reparte o lucro do pedido entre os itens pela fatia da receita", () => {
    const r = rankearAnuncios([pedido({ lucro: 30, itens: [item("A", "A", 1, 30), item("B", "B", 1, 60)] })], [], INI, FIM);
    expect(r.find((l) => l.nome === "A")?.lucro).toBe(10);
    expect(r.find((l) => l.nome === "B")?.lucro).toBe(20);
  });

  it("cancelado/devolvido não vira faturamento, só taxa de problema; não pago é ignorado", () => {
    const r = rankearAnuncios(
      [
        pedido({ itens: [item("A", "A", 1, 100)] }),
        pedido({ status: "cancelado", itens: [item("A", "A", 1, 100)] }),
        pedido({ status: "devolvido", itens: [item("A", "A", 1, 100)] }),
        pedido({ status: "nao_pago", itens: [item("A", "A", 1, 100)] }),
      ],
      [],
      INI,
      FIM,
    );
    expect(r[0].receita).toBe(100);
    expect(r[0].taxaProblema).toBeCloseTo(2 / 3);
  });

  it("respeita o período e ignora pedido sem data", () => {
    const r = rankearAnuncios(
      [
        pedido({ criado_em_plataforma: "2026-09-30T23:00:00Z", itens: [item("A", "A", 1, 10)] }),
        pedido({ criado_em_plataforma: null, itens: [item("A", "A", 1, 10)] }),
      ],
      [],
      INI,
      FIM,
    );
    expect(r).toEqual([]);
  });

  it("anúncio cadastrado sem venda entra como parado, ao final", () => {
    const r = rankearAnuncios([pedido({ itens: [item("A", "A", 1, 10)] })], [anuncio("A", "A"), anuncio("Z", "Zeta")], INI, FIM);
    expect(r.map((l) => l.nome)).toEqual(["A", "Zeta"]);
    expect(r[1]).toMatchObject({ receita: 0, pedidos: 0, posicao: 0, classe: null, margem: null });
    expect(resumirRanking(r)).toMatchObject({ anuncios: 2, comVenda: 1, parados: 1 });
  });

  it("casa pedido e anúncio sem SKU pelo título, ignorando caixa e espaços", () => {
    const r = rankearAnuncios([pedido({ itens: [item(null, " kit sem sku ", 1, 10)] })], [anuncio(null, "Kit Sem SKU")], INI, FIM);
    expect(r).toHaveLength(1);
    expect(r[0].pedidos).toBe(1);
  });

  it("não mistura lojas e marca custo incompleto", () => {
    const r = rankearAnuncios(
      [pedido({ itens: [item("A", "A", 1, 10)], custo_incompleto: true }), pedido({ loja_id: "L2", itens: [item("A", "A", 1, 10)] })],
      [],
      INI,
      FIM,
    );
    expect(r).toHaveLength(2);
    expect(r.filter((l) => l.custoIncompleto)).toHaveLength(1);
  });

  it("classifica em ABC: o anúncio que cruza os 80% ainda é A", () => {
    const itens = [70, 20, 6, 4].map((v, i) => item(`S${i}`, `P${i}`, 1, v));
    const r = rankearAnuncios(itens.map((it) => pedido({ itens: [it] })), [], INI, FIM);
    expect(r.map((l) => l.classe)).toEqual(["A", "A", "B", "C"]);
  });

  it("ordena por margem e por unidades", () => {
    const peds = [pedido({ lucro: 1, itens: [item("A", "A", 5, 10)] }), pedido({ lucro: 20, itens: [item("B", "B", 1, 40)] })];
    expect(rankearAnuncios(peds, [], INI, FIM, "unidades")[0].nome).toBe("A");
    expect(rankearAnuncios(peds, [], INI, FIM, "margem")[0].nome).toBe("B");
  });
});

describe("filtros, comparação e ordenação", () => {
  const ANT_INI = new Date("2026-09-01T00:00:00Z");
  const ANT_FIM = new Date("2026-09-30T23:59:59Z");
  const pedidos = [
    pedido({ lucro: 30, itens: [item("A", "Caneca Azul Porcelana", 2, 50)] }),
    pedido({ lucro: -5, itens: [item("B", "Garrafa Térmica", 1, 40)] }),
    pedido({ lucro: 2, itens: [item("C", "Copo Vidro", 1, 40)] }),
    pedido({ status: "cancelado", itens: [item("C", "Copo Vidro", 1, 40)] }),
    // Período anterior
    pedido({ criado_em_plataforma: "2026-09-10T12:00:00Z", lucro: 10, itens: [item("A", "Caneca Azul Porcelana", 1, 50)] }),
    pedido({ criado_em_plataforma: "2026-09-10T12:00:00Z", lucro: 50, itens: [item("D", "Prato Fundo", 4, 50)] }),
  ];
  const anuncios = [anuncio("D", "Prato Fundo"), { ...anuncio("A", "Caneca Azul Porcelana"), id: "an-a" }];
  const atual = rankearAnuncios(pedidos, anuncios, INI, FIM);
  const anterior = rankearAnuncios(pedidos, anuncios, ANT_INI, ANT_FIM);
  const comp = compararComAnterior(atual, anterior);
  const linha = (nome: string) => atual.find((l) => l.nome === nome)!;

  it("guarda o id do anúncio cadastrado", () => {
    expect(linha("Caneca Azul Porcelana").anuncioId).toBe("an-a");
    expect(linha("Garrafa Térmica").anuncioId).toBeNull();
  });

  it("compara com o período anterior: alta, novo, e o que parou de vender é queda", () => {
    expect(comp.get(linha("Caneca Azul Porcelana").chave)).toMatchObject({ receitaAnterior: 50, variacao: 1, novo: false });
    expect(comp.get(linha("Garrafa Térmica").chave)).toMatchObject({ receitaAnterior: 0, variacao: null, novo: true });
    expect(situacoesDa(linha("Prato Fundo"), comp.get(linha("Prato Fundo").chave)).has("em_queda")).toBe(true);
    expect(situacoesDa(linha("Garrafa Térmica"), comp.get(linha("Garrafa Térmica").chave)).has("em_alta")).toBe(true);
    // Sem janela para comparar: nada de alta/queda.
    expect(compararComAnterior(atual, null).get(linha("Caneca Azul Porcelana").chave)).toEqual({ receitaAnterior: null, variacao: null, novo: false });
  });

  it("situações: prejuízo, margem baixa, cancelamentos, parado", () => {
    expect(situacoesDa(linha("Garrafa Térmica")).has("prejuizo")).toBe(true);
    expect(situacoesDa(linha("Copo Vidro")).has("margem_baixa")).toBe(true);
    expect(situacoesDa(linha("Copo Vidro")).has("cancelamentos")).toBe(true);
    expect(situacoesDa(linha("Prato Fundo")).has("parados")).toBe(true);
    const c = contarSituacoes(atual, comp);
    expect(c).toMatchObject({ todos: 4, vendendo: 3, parados: 1, prejuizo: 1, em_alta: 3, em_queda: 1 });
  });

  it("busca sem acento e por várias palavras, classe e situação juntas", () => {
    expect(filtrarRanking(atual, { busca: "termica", situacao: "todos", classe: "" }).map((l) => l.nome)).toEqual(["Garrafa Térmica"]);
    expect(filtrarRanking(atual, { busca: "azul caneca", situacao: "todos", classe: "" })).toHaveLength(1);
    expect(filtrarRanking(atual, { busca: "", situacao: "vendendo", classe: "A" }).every((l) => l.classe === "A")).toBe(true);
    expect(filtrarRanking(atual, { busca: "", situacao: "em_queda", classe: "" }, comp).map((l) => l.nome)).toEqual(["Prato Fundo"]);
  });

  it("ordena pela coluna; vazios sempre no fim", () => {
    expect(ordenarRanking(atual, "lucro", "asc").map((l) => l.nome)[0]).toBe("Garrafa Térmica");
    const porMargem = ordenarRanking(atual, "margem", "asc");
    expect(porMargem[porMargem.length - 1].nome).toBe("Prato Fundo");
    expect(ordenarRanking(atual, "nome", "asc").map((l) => l.nome)).toEqual(["Caneca Azul Porcelana", "Copo Vidro", "Garrafa Térmica", "Prato Fundo"]);
    const porVariacao = ordenarRanking(atual, "variacao", "desc", comp);
    expect(porVariacao[0].nome).toBe("Caneca Azul Porcelana");
  });
});

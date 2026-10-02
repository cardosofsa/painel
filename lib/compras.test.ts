import { describe, expect, it } from "vitest";
import { consumoDiario, diasDoPrazo, faltaReceber, interpretarImportacaoPedidos, statusAberto, sugestaoCompras } from "./compras";

describe("compras", () => {
  it("falta receber nunca fica negativo", () => {
    expect(faltaReceber({ quantidade: 10, quantidade_recebida: 4 })).toBe(6);
    expect(faltaReceber({ quantidade: 10 })).toBe(10);
    expect(faltaReceber({ quantidade: 5, quantidade_recebida: 7 })).toBe(0);
  });

  it("aberto = para comprar, em trânsito ou parcial", () => {
    expect(["pendente", "em_transito", "parcial"].every((s) => statusAberto(s as never))).toBe(true);
    expect(statusAberto("recebido")).toBe(false);
    expect(statusAberto("cancelado")).toBe(false);
  });

  it("sugestão desconta o que já foi pedido e ordena pelo mais crítico", () => {
    const base = { custo: 1, fornecedor_id: null, saida_media_semanal: 0 };
    const r = sugestaoCompras(
      [
        { ...base, id: "a", nome: "A", estoque: 2, estoque_minimo: 10 },
        { ...base, id: "b", nome: "B", estoque: 0, estoque_minimo: 10 },
        { ...base, id: "c", nome: "C", estoque: 2, estoque_minimo: 10 },
        { ...base, id: "d", nome: "D", estoque: 50, estoque_minimo: 10 },
        { ...base, id: "e", nome: "E", estoque: 20, estoque_minimo: 5, saida_media_semanal: 14 },
      ],
      new Map([["c", 20]]),
    );
    expect(r.map((x) => x.produto.id)).toEqual(["b", "a", "e"]);
    expect(r[0].sugerido).toBe(20);
    expect(r[2].motivo).toBe("acabando");
  });

  it("prazo do fornecedor em texto vira dias", () => {
    expect(diasDoPrazo("7 dias")).toBe(7);
    expect(diasDoPrazo("2 semanas")).toBe(14);
    expect(diasDoPrazo("1 mês")).toBe(30);
    expect(diasDoPrazo("48h")).toBe(2);
    expect(diasDoPrazo("")).toBe(7);
    expect(diasDoPrazo("a combinar", 10)).toBe(10);
  });

  it("ritmo real soma os canais e o kit conta para os componentes", () => {
    const kits = new Map([["kit", [{ produto_id: "caneca", quantidade: 2 }]]]);
    const r = consumoDiario([{ produto_id: "caneca", quantidade: 10 }, { produto_id: "kit", quantidade: 5 }, { produto_id: null, quantidade: 3 }], 10, kits);
    expect(r.get("caneca")).toBe(2);
    expect(r.has("kit")).toBe(false);
  });

  it("cobertura: acaba antes de o pedido chegar → sugere cobrir prazo + alvo", () => {
    const hoje = new Date("2026-10-02T12:00:00.000Z");
    const p = { id: "a", nome: "A", custo: 1, fornecedor_id: "f", estoque: 20, estoque_minimo: 2, saida_media_semanal: 0 };
    const r = sugestaoCompras([p], new Map(), 14, { consumo: new Map([["a", 2]]), prazoPorFornecedor: new Map([["f", 10]]), coberturaAlvo: 30, hoje });
    // 20 / 2 = 10 dias; prazo 10 → pedir hoje. Alvo = 2 × (10 + 30) = 80 → comprar 60.
    expect(r[0]).toMatchObject({ ritmo: "vendas", diasCobertura: 10, prazo: 10, pedirAte: "2026-10-02", sugerido: 60 });
    const folgado = sugestaoCompras([{ ...p, estoque: 200 }], new Map(), 14, { consumo: new Map([["a", 2]]), prazoPorFornecedor: new Map([["f", 10]]), coberturaAlvo: 30, hoje });
    expect(folgado).toEqual([]);
  });

  it("importação agrupa por pedido e aponta erro por linha", () => {
    const matriz = [
      ["Pedido", "SKU", "Quantidade", "Custo unitário", "Fornecedor", "Frete"],
      ["1", "FITA-MOTO", "10", "25,50", "Distribuidora X", "15"],
      ["1", "fita-bike", "5", "", "", ""],
      ["2", "NAO-EXISTE", "3", "1", "", ""],
      ["2", "FITA-MOTO", "0", "1", "", ""],
      ["3", "FITA-MOTO", "2", "", "Desconhecido", ""],
      ["", "", "", "", "", ""],
    ];
    const produtos = new Map([
      ["fita-moto", { id: "p1", nome: "Fita Moto", custo: 20 }],
      ["fita-bike", { id: "p2", nome: "Fita Bike", custo: 10 }],
    ]);
    const r = interpretarImportacaoPedidos(matriz, produtos, new Map([["distribuidora x", "f1"]]));
    expect(r.pedidos.map((p) => [p.chave, p.fornecedor_id, p.frete, p.itens.length])).toEqual([
      ["1", "f1", 15, 2],
      ["3", null, 0, 1],
    ]);
    expect(r.pedidos[0].itens[1]).toMatchObject({ produto_id: "p2", custo_unitario: 10 });
    expect(r.pedidos[0].itens[0].custo_unitario).toBe(25.5);
    expect(r.erros.map((e) => e.linha)).toEqual([4, 5, 6]);
  });

  it("sem coluna obrigatória avisa antes de tudo", () => {
    const r = interpretarImportacaoPedidos([["Pedido", "Produto"], ["1", "x"]], new Map(), new Map());
    expect(r.erros[0].mensagem).toMatch(/SKU, Quantidade/);
  });
});

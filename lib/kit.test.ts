import { describe, expect, it } from "vitest";
import { calcularKit, nomeDoKit, type EntradaKit } from "./kit";

const itens = [
  { produtoId: "a", nome: "Caneca", quantidade: 2, custo: 10, preco: 30 },
  { produtoId: "b", nome: "Pires", quantidade: 1, custo: 5, preco: 15 },
];
const base: EntradaKit = { itens, extra: 3, loja: null, impostoPct: 0, modo: "preco", parametro: 60 };

describe("kit", () => {
  it("custo, avulso e economia do cliente", () => {
    const r = calcularKit(base);
    expect(r.custoKit).toBe(28);
    expect(r.precoAvulso).toBe(75);
    expect(r.resultado.precoVenda).toBe(60);
    expect(r.resultado.lucroLiquido).toBe(32);
    expect(r.economia).toBe(15);
    expect(r.economiaPct).toBeCloseTo(0.2);
  });

  it("desconto sobre o avulso", () => {
    expect(calcularKit({ ...base, modo: "desconto", parametro: 10 }).resultado.precoVenda).toBe(67.5);
  });

  it("margem alvo com imposto", () => {
    const r = calcularKit({ ...base, modo: "margem", parametro: 20, impostoPct: 10 });
    expect(r.resultado.margemEfetivaPct).toBeCloseTo(0.2);
  });

  it("no marketplace a tarifa fixa é paga uma vez: kit rende mais que avulso", () => {
    const loja = { tipoTaxa: "fixo" as const, comissaoPct: 20, taxaFixa: 4, taxaExtraValor: null, taxaExtraTipo: null, faixas: [] };
    const r = calcularKit({ ...base, extra: 0, loja, modo: "preco", parametro: 75 });
    // Avulso: 3 vendas pagando R$ 4 cada; kit: uma venda só.
    expect(r.lucroAvulso).toBe(2 * (30 - 10 - 6 - 4) + (15 - 5 - 3 - 4));
    expect(r.diferencaLucro).toBe(8);
  });

  it("nome sugerido", () => {
    expect(nomeDoKit(itens)).toBe("Kit 2 Caneca + 1 Pires");
  });
});

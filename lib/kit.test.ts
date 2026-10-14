import { describe, expect, it } from "vitest";
import { calcularKit, nomeDoKit, textoQuantidade, type EntradaKit } from "./kit";

const itens = [
  { id: "a", produtoId: "a", nome: "Caneca", quantidade: 2, custo: 10, preco: 30 },
  { id: "b", produtoId: "b", nome: "Pires", quantidade: 1, custo: 5, preco: 15 },
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

describe("kit com item que ainda não está cadastrado", () => {
  const livre = { id: "livre-1", produtoId: null, nome: "Caneca nova", quantidade: 2, custo: 10, preco: 30 };
  const entrada = { extra: 0, loja: null, impostoPct: 6, modo: "desconto" as const, parametro: 10 };
  it("tem o mesmo custo e preço que o item cadastrado igual", () => {
    const cadastrado = calcularKit({ ...entrada, itens: [{ ...livre, id: "a", produtoId: "a" }] });
    const semCadastro = calcularKit({ ...entrada, itens: [livre] });
    expect(semCadastro.custoKit).toBe(cadastrado.custoKit);
    expect(semCadastro.resultado.precoVenda).toBe(cadastrado.resultado.precoVenda);
  });
  it("mistura item cadastrado e sem cadastro", () => {
    const r = calcularKit({ ...entrada, itens: [{ id: "b", produtoId: "b", nome: "Pires", quantidade: 1, custo: 5, preco: 15 }, livre] });
    expect(r.custoKit).toBe(25);
    expect(r.precoAvulso).toBe(75);
  });

  it("peso: 250 g com custo e preço por kg", () => {
    const r = calcularKit({
      itens: [{ id: "f", produtoId: null, nome: "Farinha", quantidade: 250, unidade: "g", custo: 30, preco: 60 }],
      extra: 0,
      loja: null,
      impostoPct: 0,
      modo: "desconto",
      parametro: 0,
    });
    expect(r.custoKit).toBe(7.5);
    expect(r.precoAvulso).toBe(15);
    expect(r.lucroAvulso).toBe(7.5);
  });

  it("quantidade fracionada em kg e volume em ml", () => {
    const e = { extra: 0, loja: null, impostoPct: 0, modo: "preco" as const, parametro: 100 };
    expect(calcularKit({ ...e, itens: [{ id: "a", produtoId: null, nome: "A", quantidade: 1.5, unidade: "kg", custo: 10, preco: 20 }] }).custoKit).toBe(15);
    expect(calcularKit({ ...e, itens: [{ id: "b", produtoId: null, nome: "B", quantidade: 500, unidade: "ml", custo: 8, preco: 16 }] }).custoKit).toBe(4);
  });

  it("texto da quantidade e nome do kit com unidade", () => {
    expect(textoQuantidade({ quantidade: 250, unidade: "g" })).toBe("250 g");
    expect(textoQuantidade({ quantidade: 2 })).toBe("2");
    expect(nomeDoKit([{ nome: "Farinha", quantidade: 250, unidade: "g" }, { nome: "Pote", quantidade: 1 }])).toBe("Kit 250 g Farinha + 1 Pote");
  });

  it("faixa de venda: lucro no menor e no maior preço", () => {
    const r = calcularKit({ ...base, precoMinimo: 50, precoMaximo: 80 });
    // custo 28, sem taxas nem imposto
    expect(r.faixaVenda.minimo?.lucroLiquido).toBe(22);
    expect(r.faixaVenda.maximo?.lucroLiquido).toBe(52);
    expect(r.faixaVenda.maximo?.margemEfetivaPct).toBeCloseTo(52 / 80);
  });

  it("faixa de venda vazia ou zerada não calcula", () => {
    expect(calcularKit(base).faixaVenda).toEqual({ minimo: null, maximo: null });
    expect(calcularKit({ ...base, precoMinimo: 0, precoMaximo: null }).faixaVenda).toEqual({ minimo: null, maximo: null });
  });
});

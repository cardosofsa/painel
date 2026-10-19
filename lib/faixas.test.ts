import { describe, expect, it } from "vitest";
import { comNovaFaixa, faixaDaLinha, rotuloTaxaFaixa, semFaixa, validarFaixas, type FaixaEditavel } from "./faixas";
import { FAIXAS_SHOPEE_PADRAO } from "./marketplace/plataformas";
import { encontrarFaixa, resultadoParaPrecoComFaixas } from "./pricing";

const shopee = FAIXAS_SHOPEE_PADRAO.map(faixaDaLinha);
const semImposto = { impostoPct: 0, taxaAdicionalPct: 0 };
/** Quanto a Shopee fica num preço (comissão + tarifa), pela tabela padrão. */
const taxaShopee = (preco: number) => {
  // Sem imposto e com custo 1: o que não é custo nem lucro é a Shopee.
  const r = resultadoParaPrecoComFaixas(preco, 1, semImposto, shopee);
  return Math.round((preco - 1 - r.lucroLiquido) * 100) / 100;
};

describe("tabela padrão da Shopee (CNPJ, desde 01/10/2026)", () => {
  it("é um conjunto válido", () => {
    expect(validarFaixas(FAIXAS_SHOPEE_PADRAO)).toBeNull();
  });
  it("abaixo de R$ 9: 20% + metade do preço", () => {
    expect(taxaShopee(7.99)).toBe(5.59); // 1,60 + 4,00 (arredondado)
    expect(taxaShopee(8)).toBe(5.6);
    expect(taxaShopee(8.99)).toBe(6.29);
  });
  it("de R$ 9 a R$ 79,99: 20% + R$ 4,50", () => {
    expect(taxaShopee(9)).toBe(6.3);
    expect(taxaShopee(20)).toBe(8.5);
    expect(taxaShopee(79.99)).toBe(20.5);
  });
  it("a partir de R$ 80: 14% + R$ 16", () => {
    expect(taxaShopee(80)).toBe(27.2);
  });
  it("rótulos", () => {
    expect(rotuloTaxaFaixa(encontrarFaixa(shopee, 5))).toBe("20% + 50% do preço");
    expect(rotuloTaxaFaixa(encontrarFaixa(shopee, 20))).toMatch(/^20% \+ R\$\s4,50$/);
  });
});

describe("faixaDaLinha", () => {
  it("antes da 0107 (sem tarifa_fixa_pct) fica igual ao que era", () => {
    expect(faixaDaLinha({ preco_min: "8", preco_max: "79.99", comissao_pct: "20", tarifa_fixa: "4" })).toEqual({ min: 8, max: 79.99, comissaoPct: 20, tarifaFixa: 4 });
  });
  it("soma a tarifa em % do preço na taxa variável", () => {
    expect(faixaDaLinha({ preco_min: 0, preco_max: 8.99, comissao_pct: 20, tarifa_fixa: 0, tarifa_fixa_pct: 50 })).toMatchObject({ comissaoPct: 70, comissaoBasePct: 20, tarifaPctPreco: 50 });
  });
});

describe("validarFaixas", () => {
  const f = (preco_min: number, preco_max: number | null, comissao_pct = 10, tarifa_fixa = 0): FaixaEditavel => ({ preco_min, preco_max, comissao_pct, tarifa_fixa });
  it("recusa tabela vazia", () => expect(validarFaixas([])).toMatch(/pelo menos uma faixa/));
  it("precisa começar em zero", () => expect(validarFaixas([f(1, null)])).toMatch(/começar em R\$ 0,00/));
  it("só a última aberta", () => {
    expect(validarFaixas([f(0, 10)])).toMatch(/última faixa precisa ficar aberta/);
    expect(validarFaixas([f(0, null), f(10, null)])).toMatch(/Só a última/);
  });
  it("sem buraco nem sobreposição", () => {
    expect(validarFaixas([f(0, 9.99), f(12, null)])).toMatch(/começar em R\$\s10,00/);
    expect(validarFaixas([f(0, 9.99), f(5, null)])).toMatch(/começar em R\$\s10,00/);
    expect(validarFaixas([f(0, 9.99), f(10, null)])).toBeNull();
  });
  it("máximo depois do mínimo e percentuais possíveis", () => {
    expect(validarFaixas([f(0, 0), f(0.01, null)])).toMatch(/termina antes de começar/);
    expect(validarFaixas([f(0, null, 101)])).toMatch(/entre 0% e 100%/);
    expect(validarFaixas([{ ...f(0, null, 60), tarifa_fixa_pct: 40 }])).toMatch(/chegam a 100%/);
    expect(validarFaixas([f(0, null, 10, -1)])).toMatch(/negativa/);
  });
});

describe("editar a tabela", () => {
  it("adicionar fecha a última e abre a seguinte, mantendo o conjunto válido", () => {
    const nova = comNovaFaixa(FAIXAS_SHOPEE_PADRAO);
    expect(nova).toHaveLength(6);
    expect(nova[4].preco_max).toBe(399.99);
    expect(nova[5]).toMatchObject({ preco_min: 400, preco_max: null, comissao_pct: 14, tarifa_fixa: 26 });
    expect(validarFaixas(nova)).toBeNull();
    expect(validarFaixas(comNovaFaixa([]))).toBeNull();
  });
  it("remover não abre buraco", () => {
    expect(validarFaixas(semFaixa(FAIXAS_SHOPEE_PADRAO, 2))).toBeNull();
    expect(validarFaixas(semFaixa(FAIXAS_SHOPEE_PADRAO, 4))).toBeNull();
    const semPrimeira = semFaixa(FAIXAS_SHOPEE_PADRAO, 0);
    expect(semPrimeira[0].preco_min).toBe(0);
    expect(validarFaixas(semPrimeira)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  calcularResultadosEmMassa,
  linhaCalculavel,
  linhaVazia,
  taxasDaLinha,
  type LinhaEmMassa,
  type LojaMassa,
} from "./precificacao-massa";

function linha(p: Partial<LinhaEmMassa> = {}): LinhaEmMassa {
  return { ...linhaVazia(), sku: "A1", nome: "Produto", custo: 10, ...p };
}

const lojaFixa: LojaMassa = {
  id: "l1",
  nome: "Loja Fixa",
  canalNome: "Site",
  tipoTaxa: "fixo",
  comissaoPct: 10,
  taxaFixa: 2,
  taxaExtraValor: null,
  taxaExtraTipo: null,
  faixas: [],
};

const lojaFaixas: LojaMassa = {
  ...lojaFixa,
  id: "l2",
  nome: "Loja Faixas",
  tipoTaxa: "faixas",
  faixas: [
    { min: 0, max: 79.99, comissaoPct: 20, tarifaFixa: 4 },
    { min: 80, max: null, comissaoPct: 14, tarifaFixa: 16 },
  ],
};

describe("linhaCalculavel", () => {
  it("exige identificação e custo positivo", () => {
    expect(linhaCalculavel(linha())).toBe(true);
    expect(linhaCalculavel(linha({ sku: "", nome: "" }))).toBe(false);
    expect(linhaCalculavel(linha({ custo: 0 }))).toBe(false);
    expect(linhaCalculavel(linha({ sku: "  ", nome: "Só nome" }))).toBe(true);
  });
});

describe("calcularResultadosEmMassa", () => {
  it("ignora linhas incompletas", () => {
    expect(calcularResultadosEmMassa([linha({ custo: 0 }), linha({ sku: "", nome: "" })], [])).toEqual([]);
  });

  it("sem loja usa os percentuais digitados e bate a margem alvo", () => {
    // (custo + tarifa) / (1 - comissão - imposto - margem) = 14 / 0,49
    const [r] = calcularResultadosEmMassa([linha({ margemPct: 25, comissaoPct: 20, taxaFixa: 4, impostoPct: 6 })], []);
    expect(r.resultado.precoVenda).toBeCloseTo(14 / 0.49, 2);
    expect(r.resultado.margemEfetivaPct).toBeCloseTo(0.25, 4);
    expect(r.loja).toBeNull();
    expect(r.faixa).toBeNull();
  });

  it("loja de taxa fixa sobrepõe a comissão e a tarifa digitadas", () => {
    const [r] = calcularResultadosEmMassa([linha({ lojaId: "l1", comissaoPct: 99, taxaFixa: 99 })], [lojaFixa]);
    expect(r.resultado.precoVenda).toBeCloseTo(12 / 0.59, 2);
  });

  it("loja com faixas devolve a faixa que valeu", () => {
    const [r] = calcularResultadosEmMassa([linha({ lojaId: "l2" })], [lojaFaixas]);
    expect(r.faixa).toEqual({ min: 0, max: 79.99, comissaoPct: 20, tarifaFixa: 4 });
    expect(r.resultado.precoVenda).toBeCloseTo(14 / 0.49, 2);
  });

  it("marca 'precisa subir' só quando o preço atual existe e está abaixo do recomendado", () => {
    const rodar = (precoAtual: number) => calcularResultadosEmMassa([linha({ precoAtual })], [])[0];
    expect(rodar(0).precisaSubir).toBe(false);
    expect(rodar(20).precisaSubir).toBe(true);
    expect(rodar(20).diferenca).toBeCloseTo(14 / 0.49 - 20, 2);
    expect(rodar(40).precisaSubir).toBe(false);
    expect(rodar(40).diferenca).toBeLessThan(0);
  });
});

describe("taxasDaLinha", () => {
  it("faixa > loja > digitado", () => {
    const l = linha({ comissaoPct: 30, taxaFixa: 7 });
    const faixa = { min: 0, max: null, comissaoPct: 12, tarifaFixa: 3 };
    expect(taxasDaLinha({ linha: l, loja: lojaFixa, faixa })).toEqual({ taxaVariavelPct: 0.12, taxaFixa: 3 });
    expect(taxasDaLinha({ linha: l, loja: lojaFixa, faixa: null })).toEqual({ taxaVariavelPct: 0.1, taxaFixa: 2 });
    expect(taxasDaLinha({ linha: l, loja: null, faixa: null })).toEqual({ taxaVariavelPct: 0.3, taxaFixa: 7 });
  });
});

describe("canal de faixas sem faixa cadastrada", () => {
  it("usa a comissão da loja, não 0% (igual ao kit)", () => {
    const vazia: LojaMassa = { ...lojaFaixas, id: "l3", faixas: [] };
    const [r] = calcularResultadosEmMassa([linha({ lojaId: "l3", margemPct: 25, impostoPct: 6 })], [vazia]);
    // (10 + 2) / (1 - 0,10 - 0,06 - 0,25)
    expect(r.resultado.precoVenda).toBeCloseTo(12 / 0.59, 4);
    expect(r.faixa).toBeNull();
    expect(taxasDaLinha(r)).toEqual({ taxaVariavelPct: 0.1, taxaFixa: 2 });
  });
});

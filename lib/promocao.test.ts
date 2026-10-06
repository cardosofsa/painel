import { describe, expect, it } from "vitest";
import { descontoMaximo, simularPromocao } from "./promocao";
import type { FaixaComissao } from "./pricing";

// Preço 100, custo 50, comissão 20% + R$ 4, imposto 6%: lucro hoje = 100 − 50 − 4 − 20 − 6 = 20.
const base = {
  preco: 100,
  custo: 50,
  taxas: { impostoPct: 0.06, taxaFixa: 4, taxaVariavelPct: 0.2, taxaAdicionalPct: 0 },
  descontoPct: 0,
  cupom: 0,
  comissaoExtraPct: 0,
  vendasMes: 30,
  aumentoPct: 0,
};

describe("simulador de promoção", () => {
  it("sem promoção empata com hoje", () => {
    const r = simularPromocao(base);
    expect(r.atual.lucroLiquido).toBeCloseTo(20);
    expect(r.lucroMesAtual).toBe(600);
    expect(r.situacao).toBe("empata");
  });

  it("10% de desconto: lucro por venda cai e diz quanto precisa vender a mais", () => {
    // Preço 90: 90 − 50 − 4 − 18 − 5,40 = 12,60 por venda.
    const r = simularPromocao({ ...base, descontoPct: 10 });
    expect(r.precoPromo).toBe(90);
    expect(r.lucroPromo).toBeCloseTo(12.6);
    expect(r.vendasParaEmpatar).toBe(48); // 600 / 12,60 = 47,6
    expect(r.aumentoParaEmpatarPct).toBe(60);
    expect(r.situacao).toBe("perde");
    expect(simularPromocao({ ...base, descontoPct: 10, aumentoPct: 80 }).situacao).toBe("ganha");
  });

  it("cupom e comissão extra da campanha saem do lucro; desconto grande vira prejuízo", () => {
    const r = simularPromocao({ ...base, cupom: 5, comissaoExtraPct: 2 });
    expect(r.lucroPromo).toBeCloseTo(20 - 5 - 2);
    expect(r.precoCliente).toBe(95);
    const ruim = simularPromocao({ ...base, descontoPct: 30 });
    expect(ruim.situacao).toBe("prejuizo");
    expect(ruim.vendasParaEmpatar).toBeNull();
  });

  it("com faixas, a comissão segue o preço promocional e avisa a troca de faixa", () => {
    const faixas: FaixaComissao[] = [
      { min: 0, max: 79.99, comissaoPct: 20, tarifaFixa: 4 },
      { min: 80, max: null, comissaoPct: 14, tarifaFixa: 20 },
    ];
    const sem = simularPromocao({ ...base, faixas, preco: 85 });
    const com = simularPromocao({ ...base, faixas, preco: 85, descontoPct: 10 });
    expect(com.precoPromo).toBe(76.5);
    expect(com.mudouFaixa).toBe(true);
    expect(sem.mudouFaixa).toBe(false);
    // Na faixa nova (20% + R$ 4) a comissão é 19,30; na antiga seria 30,71.
    expect(com.promo.taxaVariavelValor + 4).toBeCloseTo(76.5 * 0.2 + 4);
  });

  it("desconto máximo que ainda deixa lucro", () => {
    // Lucro = 0,74·P − 54: zera em P = 72,97 (27% de desconto); 10% de margem pede P ≥ 84,38 (15%).
    expect(descontoMaximo({ ...base })).toBe(27);
    expect(descontoMaximo({ ...base }, 0.1)).toBe(15);
  });
});

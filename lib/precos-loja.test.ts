import { describe, expect, it } from "vitest";
import { precosPorLoja, resultadoNaLoja, type LojaParaPreco } from "./precos-loja";

const shopee: LojaParaPreco = {
  id: "s",
  nome: "Loja A",
  canalNome: "Shopee",
  tipoTaxa: "faixas",
  comissaoPct: 0,
  taxaFixa: 0,
  taxaExtraValor: null,
  taxaExtraTipo: null,
  faixas: [
    { min: 8, max: 79.99, comissaoPct: 20, tarifaFixa: 4 },
    { min: 80, max: 99.99, comissaoPct: 14, tarifaFixa: 16 },
  ],
};
const ml: LojaParaPreco = { ...shopee, id: "m", nome: "ML", canalNome: "Mercado Livre", tipoTaxa: "fixo", comissaoPct: 12, taxaFixa: 6, faixas: [] };

describe("precosPorLoja", () => {
  it("uma linha por loja; sem preço gravado aparece como 'sem preço'", () => {
    const linhas = precosPorLoja([shopee, ml], [{ loja_id: "s", preco: 73.92 }], 30, 0.06);
    expect(linhas.map((l) => l.situacao)).toEqual(["ok", "sem_preco"]);
    expect(linhas[0].rotulo).toBe("Shopee · Loja A");
    expect(linhas[1].preco).toBeNull();
  });

  it("calcula com as taxas DAQUELA loja", () => {
    // Shopee a 73,92: 20% + R$ 4 + 6% → 73,92 × 0,74 − 34
    expect(resultadoNaLoja(shopee, 30, 0.06, 73.92).lucroLiquido).toBeCloseTo(73.92 * 0.74 - 34, 6);
    // ML a 73,92: 12% + R$ 6 + 6%
    expect(resultadoNaLoja(ml, 30, 0.06, 73.92).lucroLiquido).toBeCloseTo(73.92 * 0.82 - 36, 6);
  });

  it("marca prejuízo e zona morta", () => {
    const [p] = precosPorLoja([shopee], [{ loja_id: "s", preco: 35 }], 30, 0.06);
    expect(p.situacao).toBe("prejuizo");
    const [z] = precosPorLoja([shopee], [{ loja_id: "s", preco: 82 }], 30, 0.06);
    expect(z.situacao).toBe("zona_morta");
    expect(z.zonaMorta?.precoMelhor).toBe(79.99);
  });
});

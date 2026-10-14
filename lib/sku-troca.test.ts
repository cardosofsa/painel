import { describe, expect, it } from "vitest";
import { skuMudou, textoConfirmacaoSku } from "./sku-troca";
import { vinculosParaPreservar, type AnuncioLigado } from "./marketplace/anuncios-mapeamento";

describe("troca de SKU", () => {
  it("só conta como troca se o valor mudou (espaço nas pontas não)", () => {
    expect(skuMudou("FITA-BIKE", "FITA-BIKE")).toBe(false);
    expect(skuMudou("FITA-BIKE", "  FITA-BIKE ")).toBe(false);
    expect(skuMudou("FITA-BIKE", "FITA-BIKE-2")).toBe(true);
    expect(skuMudou("fita", "FITA")).toBe(true);
  });
  it("a confirmação mostra o antes e o depois", () => {
    const t = textoConfirmacaoSku(" A ", "B ");
    expect(t.titulo).toBe("Alterar o SKU?");
    expect(t.mensagem).toContain('"A"');
    expect(t.mensagem).toContain('"B"');
  });
});

const base = { sku_modelo: null, sku_principal: null, nome: null, nome_item: null, variacao: null };
const an = (loja_id: string, sku: string, extra: Partial<AnuncioLigado> = {}): AnuncioLigado => ({ ...base, loja_id, sku, sku_modelo: sku, ...extra });

describe("vinculosParaPreservar", () => {
  it("cria um vínculo por anúncio ligado (loja + chave)", () => {
    expect(vinculosParaPreservar([an("L1", "FITA"), an("L2", "FITA")], [])).toEqual([
      { loja_id: "L1", sku_externo: "FITA" },
      { loja_id: "L2", sku_externo: "FITA" },
    ]);
  });
  it("não repete a mesma chave na mesma loja", () => {
    expect(vinculosParaPreservar([an("L1", "FITA"), an("L1", "fita")], [])).toHaveLength(1);
  });
  it("não mexe onde já existe vínculo (sem diferenciar maiúscula)", () => {
    expect(vinculosParaPreservar([an("L1", "FITA")], [{ loja_id: "L1", sku_externo: "fita" }])).toEqual([]);
  });
  it("usa a chave da variação quando o anúncio não tem SKU próprio", () => {
    const a: AnuncioLigado = { ...base, loja_id: "L1", sku: "BCO", sku_principal: "BCO", nome_item: "Bainha", variacao: "Kit 2" };
    expect(vinculosParaPreservar([a], [])).toEqual([{ loja_id: "L1", sku_externo: "BCO · Kit 2" }]);
  });
  it("ignora anúncio sem chave", () => {
    expect(vinculosParaPreservar([{ ...base, loja_id: "L1", sku: null }], [])).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { listaDePlataformas, plataformaDoCanal, regrasDaPlataforma } from "./plataformas";

describe("regrasDaPlataforma", () => {
  it("Shopee traz limites do Painel e orientação de imagem", () => {
    expect(regrasDaPlataforma("shopee")).toMatchObject({ nome: "Shopee", limiteTitulo: 100, maxImagens: 9, proporcao: "1:1", capaFundoBranco: false });
  });
  it("Mercado Livre pede fundo branco na capa", () => {
    expect(regrasDaPlataforma("mercadolivre").capaFundoBranco).toBe(true);
  });
  it("plataforma sem regra conhecida cai em orientação genérica, sem inventar número", () => {
    const r = regrasDaPlataforma("outra");
    expect(r).toMatchObject({ nome: "Outra plataforma", maxImagens: null, ladoRecomendadoPx: null, capaFundoBranco: false });
    expect(r.notas.length).toBeGreaterThan(0);
  });
});

describe("listaDePlataformas", () => {
  it("começa pelas integradas e termina em 'Outra'", () => {
    const l = listaDePlataformas();
    expect(l[0].id).toBe("shopee");
    expect(l[l.length - 1].id).toBe("outra");
  });
});

describe("plataformaDoCanal", () => {
  it("reconhece pelo nome do canal", () => {
    expect(plataformaDoCanal("Shopee")).toBe("shopee");
    expect(plataformaDoCanal("Mercado Livre Full")).toBe("mercadolivre");
    expect(plataformaDoCanal("TikTok Shop")).toBe("tiktok");
  });
  it("não reconhece nome desconhecido ou vazio", () => {
    expect(plataformaDoCanal("Minha lojinha")).toBeNull();
    expect(plataformaDoCanal(null)).toBeNull();
  });
});

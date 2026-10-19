import { TERMOS_VAZIOS } from "./conformidade/termos";
import { describe, expect, it } from "vitest";
import { analisarAnuncio, type EntradaAnalise } from "./analise-anuncio";

const base: EntradaAnalise = {
  titulo: "Caneca de Cerâmica Personalizada 325 ml para Presente Dia dos Pais Café",
  limiteTitulo: 100,
  palavrasChave: ["caneca", "cerâmica", "presente", "xícara"],
  termoPrincipal: "Caneca",
  termos: TERMOS_VAZIOS,
  capa: "https://x/capa.jpg",
  totalImagens: 5,
  maxImagens: 9,
  vendas: { d30: { unidades: 20, pedidos: 18, receita: 1200 }, d90: { unidades: 60, pedidos: 50 } },
  tendencia: "estavel",
  estoque: 100,
  vendaPorDia: 0.7,
  preco: { atual: 60, ideal: 60, minimo: 40, lucro: 12, margem: 0.2, zonaMorta: false },
};

describe("analisarAnuncio", () => {
  it("palavras-chave presentes e ausentes, sem acento", () => {
    const a = analisarAnuncio(base);
    expect(a.titulo.presentes).toEqual(["caneca", "cerâmica", "presente"]);
    expect(a.titulo.ausentes).toEqual(["xícara"]);
  });

  it("imagens: quantas faltam para o recomendado", () => {
    expect(analisarAnuncio(base).imagens.faltam).toBe(3);
    expect(analisarAnuncio({ ...base, totalImagens: null }).imagens.faltam).toBeNull();
  });

  it("veredito pelos limiares do consultor", () => {
    expect(analisarAnuncio(base).vendas.veredito).toBe("replicar");
    expect(analisarAnuncio({ ...base, tendencia: "caindo" }).vendas.veredito).toBe("atencao");
    expect(analisarAnuncio({ ...base, preco: { ...base.preco!, margem: 0.02 } }).vendas.veredito).toBe("nao_vale");
    expect(analisarAnuncio({ ...base, vendas: { d30: { unidades: 0, pedidos: 0, receita: 0 }, d90: { unidades: 0, pedidos: 0 } } }).vendas.veredito).toBe("parado");
    expect(analisarAnuncio({ ...base, vendas: { d30: { unidades: 2, pedidos: 2, receita: 100 }, d90: { unidades: 5, pedidos: 5 } } }).vendas.veredito).toBe("ainda_cedo");
  });

  it("ruptura e pontos fracos de preço", () => {
    const a = analisarAnuncio({ ...base, estoque: 5, preco: { ...base.preco!, lucro: -3 } });
    expect(a.estoque.ruptura).toBe(true);
    expect(a.pontos.some((p) => p.aba === "preco" && p.texto.includes("prejuízo"))).toBe(true);
    expect(a.nota).toBeLessThan(analisarAnuncio(base).nota);
  });

  it("termo bloqueado ou a revisar no título vira ponto fraco", () => {
    expect(analisarAnuncio({ ...base, titulo: "Caneca chame no whatsapp" }).pontos.some((p) => p.texto.includes("barrar"))).toBe(true);
    expect(analisarAnuncio({ ...base, titulo: "Caneca que cura ansiedade", termos: { ...TERMOS_VAZIOS, revisar: ["cura"] } }).pontos.some((p) => p.texto.startsWith("Revise"))).toBe(true);
  });
});

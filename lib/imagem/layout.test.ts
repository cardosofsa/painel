import { describe, expect, it } from "vitest";
import { calcularLayout, corLegivel, estiloDaFicha, luminancia, medirEstimado, type EntradaLayout, type Retangulo } from "./layout";

const base: EntradaLayout = {
  lado: 1024,
  titulo: "Bolsa de Couro Tiracolo",
  maxPalavras: 5,
  selos: ["Prático", "Para o dia a dia", "Selecionado com cuidado"],
  temFaixa: true,
  logo: { posicao: "inferior_direito", larguraPct: 9, proporcao: 1 },
  medir: medirEstimado,
};

const dentro = (r: Retangulo, L = 1024) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= L + 0.5 && r.y + r.h <= L + 0.5;
const sobrepoe = (a: Retangulo, b: Retangulo) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("calcularLayout", () => {
  const l = calcularLayout(base);
  it("tudo fica dentro da imagem", () => {
    for (const r of [l.titulo, l.areaProduto, ...(l.faixa ? [l.faixa] : []), ...(l.logo ? [l.logo] : []), ...l.selos.map((s) => s.caixa)]) expect(dentro(r)).toBe(true);
  });
  it("a logo tem a largura pedida pela ficha e fica acima da faixa, no canto", () => {
    expect(l.logo!.w).toBeCloseTo(1024 * 0.09);
    expect(l.logo!.x + l.logo!.w).toBeLessThan(1024);
    expect(l.logo!.y + l.logo!.h).toBeLessThanOrEqual(l.faixa!.y);
    expect(l.logo!.x).toBeGreaterThan(512);
  });
  it("logo, faixa, título e selos não se sobrepõem", () => {
    const caixas = [l.titulo, ...l.selos.map((s) => s.caixa), l.faixa!, l.logo!];
    for (let i = 0; i < caixas.length; i++) for (let j = i + 1; j < caixas.length; j++) expect(sobrepoe(caixas[i], caixas[j])).toBe(false);
  });
  it("o produto fica na zona livre, abaixo do texto e acima da faixa", () => {
    expect(l.areaProduto.y).toBeGreaterThan(l.selos[0].caixa.y + l.selos[0].caixa.h);
    expect(l.areaProduto.y + l.areaProduto.h).toBeLessThanOrEqual(l.faixa!.y);
    expect(l.areaProduto.h).toBeGreaterThan(1024 * 0.4);
  });
  it("corta o título no máximo de palavras e avisa", () => {
    const r = calcularLayout({ ...base, titulo: "um dois três quatro cinco seis sete", maxPalavras: 5 });
    expect(r.palavrasCortadas).toBe(true);
    expect(r.linhasTitulo.join(" ").split(" ")).toHaveLength(5);
  });
  it("título longo reduz a fonte e quebra em linhas, sem passar da altura reservada", () => {
    const curto = calcularLayout({ ...base, titulo: "Bolsa Couro" });
    const longo = calcularLayout({ ...base, titulo: "Bolsa Feminina Tiracolo Couro Legítimo", maxPalavras: null });
    expect(longo.tamanhoTitulo).toBeLessThan(curto.tamanhoTitulo);
    expect(longo.titulo.h).toBeLessThanOrEqual(1024 * 0.2 + 0.5);
  });
  it("selos que não cabem na linha saem do fim e são contados", () => {
    const r = calcularLayout({ ...base, selos: ["A".repeat(30), "B".repeat(30), "C".repeat(30), "D".repeat(30)] });
    expect(r.selos.length + r.selosOmitidos).toBe(4);
    expect(r.selosOmitidos).toBeGreaterThan(0);
  });
  it("sem faixa e sem selos o espaço livre é maior", () => {
    const r = calcularLayout({ ...base, temFaixa: false, selos: [] });
    expect(r.faixa).toBeNull();
    expect(r.areaProduto.h).toBeGreaterThan(l.areaProduto.h);
  });
  it("logo no topo estreita o título para não passar por baixo dela", () => {
    const r = calcularLayout({ ...base, logo: { posicao: "superior_direito", larguraPct: 14, proporcao: 1 } });
    expect(r.titulo.x + r.titulo.w).toBeLessThanOrEqual(r.logo!.x);
    expect(sobrepoe(r.titulo, r.logo!)).toBe(false);
  });
  it("sem logo ou com 'nenhuma', não desenha logo", () => {
    expect(calcularLayout({ ...base, logo: null }).logo).toBeNull();
    expect(calcularLayout({ ...base, logo: { posicao: "nenhuma", larguraPct: 9, proporcao: 1 } }).logo).toBeNull();
  });
  it("sem faixa a logo desce até a margem de baixo", () => {
    const r = calcularLayout({ ...base, temFaixa: false });
    expect(r.logo!.y + r.logo!.h).toBeCloseTo(1024 - 1024 * 0.04);
  });
});

describe("cores", () => {
  it("escolhe texto legível sobre qualquer fundo", () => {
    expect(corLegivel("#FFFFFF")).toBe("#111111");
    expect(corLegivel("#000000")).toBe("#FFFFFF");
    expect(corLegivel("#1F3D2B")).toBe("#FFFFFF");
    expect(luminancia("#FFFFFF")).toBeCloseTo(1);
  });
  it("título usa a cor da paleta só se contrastar com o fundo", () => {
    expect(estiloDaFicha(["#1F3D2B", "#F5EFE0"], true).corTitulo).toBe("#1F3D2B");
    expect(estiloDaFicha(["#FFF8DC"], true).corTitulo).toBe("#111111"); // claro demais sobre branco
    expect(estiloDaFicha(undefined, true).corTitulo).toBe("#111111");
  });
  it("a faixa usa a última cor da paleta e o texto dela contrasta", () => {
    const e = estiloDaFicha(["#F5EFE0", "#1F3D2B"], true);
    expect(e.corFaixa).toBe("#1F3D2B");
    expect(e.corTextoFaixa).toBe("#FFFFFF");
  });
});

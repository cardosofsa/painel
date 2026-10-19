import { describe, expect, it } from "vitest";
import { destinoBloqueavel, estaSujo } from "./saida";

const aqui = { origin: "https://painel.app", pathname: "/precificacao", search: "?visao=individual" };
const clique = (href: string | null, extra: Partial<Parameters<typeof destinoBloqueavel>[0]> = {}) =>
  destinoBloqueavel({ href, target: null, download: false, botao: 0, modificador: false, ...extra }, aqui);

describe("destinoBloqueavel", () => {
  it("segura link do sistema para outra tela", () => {
    expect(clique("/produtos")).toBe("/produtos");
    expect(clique("https://painel.app/anuncio?rascunho=1")).toBe("/anuncio?rascunho=1");
    expect(clique("/precificacao?visao=kits")).toBe("/precificacao?visao=kits");
  });

  it("deixa passar o que não tira a pessoa da tela", () => {
    expect(clique("https://outro.site/x")).toBeNull();
    expect(clique("/produtos", { target: "_blank" })).toBeNull();
    expect(clique("/relatorio.csv", { download: true })).toBeNull();
    expect(clique("/produtos", { modificador: true })).toBeNull();
    expect(clique("/produtos", { botao: 1 })).toBeNull();
    expect(clique("#topo")).toBeNull();
    expect(clique("/precificacao?visao=individual")).toBeNull();
    expect(clique("mailto:a@b.com")).toBeNull();
    expect(clique(null)).toBeNull();
  });
});

describe("estaSujo", () => {
  it("compara com o último salvo e ignora tela vazia", () => {
    expect(estaSujo({ a: 1 }, JSON.stringify({ a: 1 }), true)).toBe(false);
    expect(estaSujo({ a: 2 }, JSON.stringify({ a: 1 }), true)).toBe(true);
    expect(estaSujo({ a: 2 }, null, true)).toBe(true);
    expect(estaSujo({ a: 2 }, null, false)).toBe(false);
  });
});

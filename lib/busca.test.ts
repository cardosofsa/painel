import { describe, expect, it } from "vitest";
import { ATALHOS_EXTRAS, filtrarAtalhos, termoBusca } from "./busca";

describe("busca global", () => {
  it("tira o que quebraria o filtro do PostgREST", () => {
    expect(termoBusca("  caneca, térmica  ")).toBe("caneca térmica");
    expect(termoBusca("a),id.eq.(1")).toBe("a id.eq. 1");
    expect(termoBusca("50% off*")).toBe("50 off");
    expect(termoBusca("V-0007")).toBe("V-0007");
    expect(termoBusca("ana@email.com")).toBe("ana@email.com");
  });

  it("acha atalho por rótulo ou sinônimo, sem acento", () => {
    expect(filtrarAtalhos(ATALHOS_EXTRAS, "dre").map((a) => a.href)).toEqual(["/financeiro?aba=resultado"]);
    expect(filtrarAtalhos(ATALHOS_EXTRAS, "credito pix").length).toBe(0);
    expect(filtrarAtalhos(ATALHOS_EXTRAS, "crediário pix").map((a) => a.href)).toEqual(["/configuracoes?aba=conta"]);
  });
});

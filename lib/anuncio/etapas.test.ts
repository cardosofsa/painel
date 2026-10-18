import { describe, expect, it } from "vitest";
import { calcularEtapas, type EntradaEtapas } from "./etapas";

const vazio: EntradaEtapas = { lojaDecidida: false, produtoId: null, rascunhoAberto: false, titulo: null, descricao: null, capaAprovada: false, itemCriadoNaShopee: false };
const por = (e: Partial<EntradaEtapas>) => calcularEtapas({ ...vazio, ...e });
const etapa = (r: ReturnType<typeof calcularEtapas>, id: string) => r.etapas.find((t) => t.id === id)!;

describe("calcularEtapas", () => {
  it("começa na loja e trava o resto", () => {
    const r = por({});
    expect(r.atual).toBe("loja");
    expect(etapa(r, "produto")).toMatchObject({ liberada: false, motivo: "Escolha a loja primeiro." });
    expect(etapa(r, "titulo").liberada).toBe(false);
  });

  it("decidida a loja, libera só o produto", () => {
    const r = por({ lojaDecidida: true });
    expect(r.atual).toBe("produto");
    expect(etapa(r, "produto").liberada).toBe(true);
    expect(etapa(r, "titulo").liberada).toBe(false);
  });

  it("com o rascunho aberto, libera título, capa e descrição", () => {
    const r = por({ lojaDecidida: true, produtoId: "p", rascunhoAberto: true });
    expect(r.atual).toBe("titulo");
    for (const id of ["titulo", "capa", "descricao"]) expect(etapa(r, id).liberada).toBe(true);
    expect(etapa(r, "revisar")).toMatchObject({ liberada: false, motivo: "Falta escolher o título e salvar a descrição." });
  });

  it("revisar só abre com título e descrição; a próxima pendente avança", () => {
    const base = { lojaDecidida: true, produtoId: "p", rascunhoAberto: true, titulo: "T" };
    expect(por({ ...base }).atual).toBe("capa");
    const r = por({ ...base, capaAprovada: true, descricao: "D" });
    expect(r.atual).toBe("revisar");
    expect(etapa(r, "revisar").liberada).toBe(true);
  });

  it("título só com espaços não conta como feito", () => {
    expect(etapa(por({ lojaDecidida: true, produtoId: "p", rascunhoAberto: true, titulo: "   " }), "titulo").feita).toBe(false);
  });

  it("tudo feito fica na última etapa", () => {
    const r = por({ lojaDecidida: true, produtoId: "p", rascunhoAberto: true, titulo: "T", descricao: "D", capaAprovada: true, itemCriadoNaShopee: true });
    expect(r.feitas).toBe(6);
    expect(r.atual).toBe("revisar");
  });
});

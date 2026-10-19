import { describe, expect, it } from "vitest";
import { calcularEtapas, numeroDaEtapa, statusDoRascunho, type EntradaEtapas } from "./etapas";

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

  it("com o rascunho aberto, libera o título; capa e descrição esperam o título", () => {
    const r = por({ lojaDecidida: true, produtoId: "p", rascunhoAberto: true });
    expect(r.atual).toBe("titulo");
    expect(etapa(r, "titulo").liberada).toBe(true);
    for (const id of ["capa", "descricao"]) expect(etapa(r, id)).toMatchObject({ liberada: false, motivo: "Escolha o título primeiro." });
    const comTitulo = por({ lojaDecidida: true, produtoId: "p", rascunhoAberto: true, titulo: "T" });
    for (const id of ["capa", "descricao"]) expect(etapa(comTitulo, id).liberada).toBe(true);
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

  it("publicado à mão conta a última etapa como feita", () => {
    const r = por({ lojaDecidida: true, produtoId: "p", rascunhoAberto: true, titulo: "T", descricao: "D", capaAprovada: true, publicado: true });
    expect(etapa(r, "revisar").feita).toBe(true);
  });
});

describe("numeração e status", () => {
  it("o número do painel é o do trilho", () => {
    expect([numeroDaEtapa("titulo"), numeroDaEtapa("capa"), numeroDaEtapa("descricao"), numeroDaEtapa("revisar")]).toEqual([3, 4, 5, 6]);
  });

  it("rascunho → pronto → publicado, sem voltar de publicado", () => {
    const base = { atual: "rascunho", titulo: "T", descricao: "D", capaAprovada: false, publicado: false };
    expect(statusDoRascunho(base)).toBe("rascunho");
    expect(statusDoRascunho({ ...base, capaAprovada: true })).toBe("pronto");
    expect(statusDoRascunho({ ...base, capaAprovada: true, publicado: true })).toBe("publicado");
    expect(statusDoRascunho({ ...base, atual: "publicado", titulo: null })).toBe("publicado");
  });
});

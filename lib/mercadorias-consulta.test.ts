import { describe, expect, it } from "vitest";
import { filtrarMercadorias, soMercadorias, type FiltrosMercadoria } from "./mercadorias-consulta";

const SEM_COLUNA = { code: "42703" };

describe("soMercadorias (recuo por migração)", () => {
  it("banco completo: uma tentativa, com os dois filtros", async () => {
    const chamadas: FiltrosMercadoria[] = [];
    const r = await soMercadorias(async (f) => (chamadas.push(f), { error: null, data: [1] }));
    expect(chamadas).toEqual([{ semFilhas: true, soMercadorias: true }]);
    expect(r.data).toEqual([1]);
  });
  it("sem a 0096: tira só o filtro de tipo", async () => {
    const chamadas: FiltrosMercadoria[] = [];
    await soMercadorias(async (f) => {
      chamadas.push(f);
      return { error: f.soMercadorias ? SEM_COLUNA : null };
    });
    expect(chamadas).toEqual([
      { semFilhas: true, soMercadorias: true },
      { semFilhas: true, soMercadorias: false },
    ]);
  });
  it("sem a 0084 também: tira os dois", async () => {
    const chamadas: FiltrosMercadoria[] = [];
    await soMercadorias(async (f) => {
      chamadas.push(f);
      return { error: f.semFilhas || f.soMercadorias ? SEM_COLUNA : null };
    });
    expect(chamadas.at(-1)).toEqual({ semFilhas: false, soMercadorias: false });
    expect(chamadas).toHaveLength(3);
  });
  it("incluirFilhas: nunca filtra a variação, só o tipo", async () => {
    const chamadas: FiltrosMercadoria[] = [];
    await soMercadorias(async (f) => (chamadas.push(f), { error: f.soMercadorias ? SEM_COLUNA : null }), { incluirFilhas: true });
    expect(chamadas).toEqual([
      { semFilhas: false, soMercadorias: true },
      { semFilhas: false, soMercadorias: false },
    ]);
  });
  it("erro que não é de coluna não é mascarado", async () => {
    const chamadas: FiltrosMercadoria[] = [];
    const r = await soMercadorias(async (f) => (chamadas.push(f), { error: { code: "42501" } }));
    expect(chamadas).toHaveLength(1);
    expect(r.error?.code).toBe("42501");
  });
});

describe("filtrarMercadorias", () => {
  const falso = () => {
    const usados: string[] = [];
    const q: { is: (c: string, v: null) => typeof q; eq: (c: string, v: string) => typeof q } = {
      is: (c) => (usados.push(`is:${c}`), q),
      eq: (c, v) => (usados.push(`eq:${c}=${v}`), q),
    };
    return { q, usados };
  };
  it("aplica só o que foi pedido", () => {
    const a = falso();
    filtrarMercadorias(a.q, { semFilhas: true, soMercadorias: true });
    expect(a.usados).toEqual(["is:produto_pai_id", "eq:tipo=produto"]);
    const b = falso();
    filtrarMercadorias(b.q, { semFilhas: false, soMercadorias: false });
    expect(b.usados).toEqual([]);
  });
});

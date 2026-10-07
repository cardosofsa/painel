import { describe, expect, it } from "vitest";
import { semColuna, semVariacoesFilhas } from "./variacoes-consulta";

describe("semVariacoesFilhas", () => {
  it("usa o filtro quando o banco tem a coluna", async () => {
    const chamadas: boolean[] = [];
    const r = await semVariacoesFilhas(async (f) => (chamadas.push(f), { data: [1], error: null }));
    expect(chamadas).toEqual([true]);
    expect(r.data).toEqual([1]);
  });
  it("sem a migração (42703), roda de novo sem o filtro", async () => {
    const chamadas: boolean[] = [];
    const r = await semVariacoesFilhas(async (f) => (chamadas.push(f), f ? { data: null, error: { code: "42703" } } : { data: [2], error: null }));
    expect(chamadas).toEqual([true, false]);
    expect(r.data).toEqual([2]);
  });
  it("outro erro não é engolido", async () => {
    const r = await semVariacoesFilhas(async () => ({ data: null, error: { code: "42501" } }));
    expect(r.error?.code).toBe("42501");
    expect(semColuna(null)).toBe(false);
  });
});

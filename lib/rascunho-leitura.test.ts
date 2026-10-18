import { describe, expect, it } from "vitest";
import { lerId, lerLista, lerNumero, lerTexto } from "./rascunho-leitura";

describe("leitura de rascunho", () => {
  it("número: só finito, senão o padrão", () => {
    expect(lerNumero(12.5, 0)).toBe(12.5);
    expect(lerNumero("12", 3)).toBe(3);
    expect(lerNumero(Number.NaN, 3)).toBe(3);
    expect(lerNumero(null, 3)).toBe(3);
  });

  it("texto e id", () => {
    expect(lerTexto("Kit")).toBe("Kit");
    expect(lerTexto(5, "x")).toBe("x");
    expect(lerId("")).toBeNull();
    expect(lerId(undefined)).toBeNull();
    expect(lerId("abc")).toBe("abc");
  });

  it("lista: ignora o que não é objeto e o que o validador recusa", () => {
    const lidos = lerLista([{ id: "a" }, 3, null, { id: 7 }, { id: "b" }], (x) => (typeof x.id === "string" ? x.id : null));
    expect(lidos).toEqual(["a", "b"]);
    expect(lerLista("nada", () => 1)).toEqual([]);
  });
});

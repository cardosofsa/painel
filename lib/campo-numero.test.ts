import { describe, expect, it } from "vitest";
import { ajustarNumero, formatarParaCampo, interpretarDigitado, valorAoSair } from "./campo-numero";

describe("campo-numero", () => {
  it("vazio enquanto digita não vira número", () => {
    expect(interpretarDigitado("", {})).toBeNull();
    expect(interpretarDigitado("abc", {})).toBeNull();
  });
  it("aceita vírgula", () => {
    expect(interpretarDigitado("19,90", {})).toBe(19.9);
  });
  it("blur vazio volta ao padrão", () => {
    expect(valorAoSair("", {})).toBe(0);
    expect(valorAoSair("", {}, 30)).toBe(30);
    expect(valorAoSair("x", { min: 1 }, 1)).toBe(1);
  });
  it("aplica limites e casas", () => {
    expect(ajustarNumero(5.7, { casas: 0 })).toBe(5);
    expect(ajustarNumero(1.236, { casas: 2 })).toBe(1.24);
    expect(ajustarNumero(-3, { min: 0 })).toBe(0);
    expect(ajustarNumero(200, { max: 90 })).toBe(90);
  });
  it("formata com vírgula e relê igual", () => {
    expect(formatarParaCampo(1.234)).toBe("1,234");
    expect(interpretarDigitado(formatarParaCampo(1.234), {})).toBe(1.234);
    expect(formatarParaCampo(null)).toBe("");
  });
});

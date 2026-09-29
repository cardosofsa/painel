import { describe, expect, it } from "vitest";
import { cepCompleto, formatarCep, interpretarViaCep, normalizarCep } from "./cep";

describe("normalizarCep / formatarCep", () => {
  it("tira máscara e limita a 8 dígitos", () => {
    expect(normalizarCep("44050-123")).toBe("44050123");
    expect(normalizarCep("440501239999")).toBe("44050123");
    expect(normalizarCep("abc")).toBe("");
  });

  it("formata com hífen só depois do quinto dígito", () => {
    expect(formatarCep("44050")).toBe("44050");
    expect(formatarCep("440501")).toBe("44050-1");
    expect(formatarCep("44050123")).toBe("44050-123");
  });

  it("cepCompleto exige 8 dígitos", () => {
    expect(cepCompleto("44050-123")).toBe(true);
    expect(cepCompleto("4405")).toBe(false);
  });
});

describe("interpretarViaCep", () => {
  it("lê uma resposta válida", () => {
    expect(
      interpretarViaCep({ logradouro: "Rua A", bairro: "Centro", localidade: "Feira de Santana", uf: "ba" }),
    ).toEqual({ logradouro: "Rua A", bairro: "Centro", cidade: "Feira de Santana", uf: "BA" });
  });

  it("CEP inexistente (erro: true) vira null", () => {
    expect(interpretarViaCep({ erro: true })).toBeNull();
    expect(interpretarViaCep({ erro: "true" })).toBeNull();
  });

  it("CEP genérico de cidade pequena (sem logradouro) ainda serve", () => {
    expect(interpretarViaCep({ logradouro: "", bairro: "", localidade: "Cidade", uf: "SP" })).toEqual({
      logradouro: "",
      bairro: "",
      cidade: "Cidade",
      uf: "SP",
    });
  });

  it("rejeita lixo e tipos errados", () => {
    expect(interpretarViaCep(null)).toBeNull();
    expect(interpretarViaCep("texto")).toBeNull();
    expect(interpretarViaCep({ localidade: 123, uf: "SP" })).toBeNull();
    expect(interpretarViaCep({ localidade: "X", uf: "SPP" })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { cidadePix, cnpjValido, cpfValido, detectarTipoChave, mascararChave, validarChavePix } from "./pix-chave";
import { gerarPixCopiaECola } from "./pix";

describe("chave Pix por tipo", () => {
  it("CPF e CNPJ conferem os dígitos", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("529.982.247-26")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-80")).toBe(false);
  });
  it("máscara enquanto digita", () => {
    expect(mascararChave("cnpj", "11222333000181")).toBe("11.222.333/0001-81");
    expect(mascararChave("cpf", "52998224725")).toBe("529.982.247-25");
    expect(mascararChave("celular", "75999998888")).toBe("(75) 99999-8888");
    expect(mascararChave("celular", "+55 75 99999-8888")).toBe("(75) 99999-8888");
    expect(mascararChave("cnpj", "1122")).toBe("11.22");
  });
  it("grava no formato do Pix", () => {
    expect(validarChavePix("cnpj", "11.222.333/0001-81")).toEqual({ ok: true, chave: "11222333000181" });
    expect(validarChavePix("celular", "(75) 99999-8888")).toEqual({ ok: true, chave: "+5575999998888" });
    expect(validarChavePix("email", "Loja@Email.com")).toEqual({ ok: true, chave: "loja@email.com" });
    expect(validarChavePix("cpf", "123")).toMatchObject({ ok: false });
    expect(validarChavePix("celular", "7533334444")).toMatchObject({ ok: false });
    expect(validarChavePix("aleatoria", "abc")).toMatchObject({ ok: false });
  });
  it("reconhece o tipo de uma chave salva", () => {
    expect(detectarTipoChave("11222333000181")).toBe("cnpj");
    expect(detectarTipoChave("52998224725")).toBe("cpf");
    expect(detectarTipoChave("+5575999998888")).toBe("celular");
    expect(detectarTipoChave("a@b.co")).toBe("email");
    expect(detectarTipoChave("123e4567-e89b-12d3-a456-426614174000")).toBe("aleatoria");
  });
});

describe("cidade do Pix", () => {
  it("cabe nos 15 tirando de/da/do antes de cortar", () => {
    expect(cidadePix("Feira de Santana")).toBe("Feira Santana");
    expect(cidadePix("São Paulo")).toBe("Sao Paulo");
    expect(cidadePix("Santa Maria da Boa Vista")).toBe("Santa Maria Boa");
    expect(cidadePix("Vitória da Conquista")).toBe("Vitoria Conquis");
  });
  it("vai encurtada no copia-e-cola", () => {
    expect(gerarPixCopiaECola({ chave: "loja@x.com", nome: "Loja", cidade: "Feira de Santana" })).toContain("6013FEIRA SANTANA");
  });
});

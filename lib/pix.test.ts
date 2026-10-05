import { describe, expect, it } from "vitest";
import { crc16, gerarPixCopiaECola, normalizarChavePix } from "./pix";

describe("Pix copia-e-cola", () => {
  it("reproduz o exemplo do manual do BR Code (CRC 1D3D)", () => {
    // Exemplo publicado pelo Banco Central; o nome sai em maiúsculas aqui, então o CRC do
    // exemplo original é conferido direto sobre o texto do manual.
    expect(crc16("00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304")).toBe("1D3D");
  });

  it("monta os campos com valor, nome sem acento e txid limpo", () => {
    const p = gerarPixCopiaECola({ chave: "loja@exemplo.com", nome: "Sertão Variedades", cidade: "São Paulo", valor: 33.3, txid: "V-0007 P2/3" });
    expect(p.startsWith("000201")).toBe(true);
    expect(p).toContain("0014br.gov.bcb.pix0116loja@exemplo.com");
    expect(p).toContain("540533.30");
    expect(p).toContain("5917SERTAO VARIEDADES");
    expect(p).toContain("6009SAO PAULO");
    expect(p).toContain("62120508V0007P23");
    // O CRC no fim confere com o resto.
    expect(p.slice(-4)).toBe(crc16(p.slice(0, -4)));
  });

  it("sem valor, o campo 54 não vai (o cliente digita)", () => {
    expect(gerarPixCopiaECola({ chave: "12345678901", nome: "Loja", cidade: "Recife" })).not.toContain("5404");
  });

  it("normaliza a chave", () => {
    expect(normalizarChavePix("123.456.789-01")).toBe("12345678901");
    expect(normalizarChavePix("(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizarChavePix("+55 11 98765-4321")).toBe("+5511987654321");
    expect(normalizarChavePix("Loja@Exemplo.com")).toBe("loja@exemplo.com");
  });

  it("recusa chave ou nome vazios", () => {
    expect(() => gerarPixCopiaECola({ chave: " ", nome: "Loja", cidade: "X" })).toThrow("chave Pix");
    expect(() => gerarPixCopiaECola({ chave: "a@b.c", nome: "", cidade: "X" })).toThrow("nome");
  });
});

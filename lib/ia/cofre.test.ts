import { afterEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { cifrar, cofreDisponivel, decifrar, ErroCofre, finalDaChave } from "./cofre";

const mestra = randomBytes(32);
const conta = "11111111-1111-4111-8111-111111111111";

describe("cofre", () => {
  it("cifra e decifra ida e volta", () => {
    const chave = "AIzaSyDUMMY-chave-de-teste_1234";
    const c = cifrar(chave, conta, mestra);
    expect(c.startsWith("v1.")).toBe(true);
    expect(c).not.toContain(chave);
    expect(decifrar(c, conta, mestra)).toBe(chave);
  });

  it("a mesma chave cifrada duas vezes dá textos diferentes (IV aleatório)", () => {
    expect(cifrar("abc", conta, mestra)).not.toBe(cifrar("abc", conta, mestra));
  });

  it("texto cifrado copiado para outra conta não decifra (AAD)", () => {
    const c = cifrar("segredo", conta, mestra);
    expect(() => decifrar(c, "22222222-2222-4222-8222-222222222222", mestra)).toThrow(ErroCofre);
  });

  it("adulterar qualquer parte do payload é detectado", () => {
    const partes = cifrar("segredo", conta, mestra).split(".");
    const trocar = (i: number) => {
      const p = [...partes];
      p[i] = p[i].slice(0, -2) + (p[i].endsWith("AA") ? "BB" : "AA");
      return p.join(".");
    };
    for (const i of [1, 2, 3]) expect(() => decifrar(trocar(i), conta, mestra)).toThrow(ErroCofre);
  });

  it("chave-mestra errada não decifra", () => {
    const c = cifrar("segredo", conta, mestra);
    expect(() => decifrar(c, conta, randomBytes(32))).toThrow(ErroCofre);
  });

  it("formato inválido vira ErroCofre, não exceção crua", () => {
    for (const ruim of ["", "lixo", "v2.a.b.c", "v1.a.b"]) {
      expect(() => decifrar(ruim, conta, mestra)).toThrow(ErroCofre);
    }
  });

  it("finalDaChave mostra só os 4 últimos caracteres", () => {
    expect(finalDaChave("sk-abc123456789wxyz ")).toBe("wxyz");
  });
});

describe("chave-mestra do ambiente", () => {
  const original = process.env.IA_CHAVE_COFRE;
  afterEach(() => {
    if (original === undefined) delete process.env.IA_CHAVE_COFRE;
    else process.env.IA_CHAVE_COFRE = original;
  });

  it("sem variável, o cofre fica indisponível e cifrar recusa", () => {
    delete process.env.IA_CHAVE_COFRE;
    expect(cofreDisponivel()).toBe(false);
    expect(() => cifrar("x", conta)).toThrow(/IA_CHAVE_COFRE/);
  });

  it("variável com tamanho errado é recusada", () => {
    process.env.IA_CHAVE_COFRE = Buffer.from("curta").toString("base64");
    expect(cofreDisponivel()).toBe(false);
  });

  it("variável válida (32 bytes) habilita o cofre", () => {
    process.env.IA_CHAVE_COFRE = randomBytes(32).toString("base64");
    expect(cofreDisponivel()).toBe(true);
    expect(decifrar(cifrar("ok", conta), conta)).toBe("ok");
  });
});

import { describe, it, expect, vi } from "vitest";
import { codigoMfaSchema, confirmarMfaSchema, validar } from "./validacao";
import {
  codigoCompleto,
  fatorTotpVerificado,
  fatoresTotpPendentes,
  limparCodigo,
  qrComoDataUri,
  segredoEmGrupos,
  statusDosFatores,
  verificarSegundoFator,
  type FatorMfa,
} from "./mfa";

describe("limparCodigo / codigoCompleto", () => {
  it("aceita o código colado com espaço ou traço", () => {
    expect(limparCodigo("123 456")).toBe("123456");
    expect(limparCodigo("123-456")).toBe("123456");
    expect(limparCodigo(" 12a34b56 ")).toBe("123456");
  });

  it("corta no sexto dígito", () => {
    expect(limparCodigo("12345678")).toBe("123456");
  });

  it("só 6 dígitos contam como completo", () => {
    expect(codigoCompleto("123456")).toBe(true);
    expect(codigoCompleto("12345")).toBe(false);
    expect(codigoCompleto("1234567")).toBe(false);
    expect(codigoCompleto("12345a")).toBe(false);
    expect(codigoCompleto("")).toBe(false);
  });
});

describe("qrComoDataUri", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect fill="#000" width="1" height="1"/></svg>';

  it("recodifica o formato que o auth-js devolve (SVG cru depois da vírgula)", () => {
    const uri = qrComoDataUri(`data:image/svg+xml;utf-8,${svg}`)!;
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    // `#` cru viraria fragmento e cortaria a imagem.
    expect(uri).not.toContain("#");
    expect(decodeURIComponent(uri.slice(uri.indexOf(",") + 1))).toBe(svg);
  });

  it("aceita o SVG puro", () => {
    expect(qrComoDataUri(svg)).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  });

  it("não mexe no que já está codificado ou em base64", () => {
    const codificado = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    expect(qrComoDataUri(codificado)).toBe(codificado);
    const base64 = "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=";
    expect(qrComoDataUri(base64)).toBe(base64);
    const png = "data:image/png;base64,iVBORw0KGgo=";
    expect(qrComoDataUri(png)).toBe(png);
  });

  it("recusa o que não é imagem (não vira src de nada)", () => {
    expect(qrComoDataUri(null)).toBeNull();
    expect(qrComoDataUri("")).toBeNull();
    expect(qrComoDataUri("javascript:alert(1)")).toBeNull();
    expect(qrComoDataUri("https://golpe.com/qr.svg")).toBeNull();
    expect(qrComoDataUri("data:text/html,<script>alert(1)</script>")).toBeNull();
  });
});

describe("segredoEmGrupos", () => {
  it("separa em blocos de 4, em maiúsculas", () => {
    expect(segredoEmGrupos("jbswy3dpehpk3pxp")).toBe("JBSW Y3DP EHPK 3PXP");
    expect(segredoEmGrupos("ABCDEF")).toBe("ABCD EF");
    expect(segredoEmGrupos("AB CD")).toBe("ABCD");
  });
});

describe("fatores", () => {
  const fatores: FatorMfa[] = [
    { id: "a", factor_type: "totp", status: "unverified", created_at: "2026-10-01T10:00:00Z" },
    { id: "b", factor_type: "phone", status: "verified" },
    { id: "c", factor_type: "totp", status: "verified", created_at: "2026-10-02T10:00:00Z", updated_at: "2026-10-02T10:05:00Z" },
  ];

  it("acha o TOTP verificado e ignora telefone e pendente", () => {
    expect(fatorTotpVerificado(fatores)?.id).toBe("c");
    expect(fatorTotpVerificado([fatores[0], fatores[1]])).toBeNull();
    expect(fatorTotpVerificado(null)).toBeNull();
  });

  it("lista só os TOTP pela metade", () => {
    expect(fatoresTotpPendentes(fatores).map((f) => f.id)).toEqual(["a"]);
    expect(fatoresTotpPendentes(undefined)).toEqual([]);
  });

  it("status usa a data de confirmação do fator", () => {
    expect(statusDosFatores(fatores)).toEqual({ ativo: true, desde: "2026-10-02T10:05:00Z" });
    expect(statusDosFatores([])).toEqual({ ativo: false, desde: null });
  });
});

describe("schemas do código (lib/validacao.ts)", () => {
  it("aceita o código com espaço e devolve só os dígitos", () => {
    expect(validar(codigoMfaSchema, { codigo: "123 456" })).toEqual({ codigo: "123456" });
  });

  it("recusa código curto, longo ou com letra, com mensagem em pt-BR", () => {
    for (const codigo of ["12345", "1234567", "abcdef", ""]) {
      expect(() => validar(codigoMfaSchema, { codigo }), codigo).toThrow(/6 números/);
    }
  });

  it("o fator precisa ser um uuid", () => {
    expect(() => validar(confirmarMfaSchema, { fatorId: "x", codigo: "123456" })).toThrow();
    const ok = validar(confirmarMfaSchema, { fatorId: "6f1c2a8e-3b4d-4c5e-9f00-112233445566", codigo: "123456" });
    expect(ok.codigo).toBe("123456");
  });
});

describe("verificarSegundoFator", () => {
  function clienteFalso(fatores: FatorMfa[], erroVerify: { message: string; code?: string } | null = null, erroLista: { message: string } | null = null) {
    const challengeAndVerify = vi.fn(async () => ({ data: null, error: erroVerify }));
    const cliente = {
      auth: {
        mfa: {
          listFactors: vi.fn(async () => (erroLista ? { data: null, error: erroLista } : { data: { all: fatores }, error: null })),
          challengeAndVerify,
        },
      },
    };
    return { cliente: cliente as unknown as Parameters<typeof verificarSegundoFator>[0], challengeAndVerify };
  }

  it("confere o código no TOTP verificado (nunca no pendente)", async () => {
    const { cliente, challengeAndVerify } = clienteFalso([
      { id: "pendente", factor_type: "totp", status: "unverified" },
      { id: "certo", factor_type: "totp", status: "verified" },
    ]);
    expect(await verificarSegundoFator(cliente, "123456")).toEqual({ erro: null, semFator: false });
    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "certo", code: "123456" });
  });

  it("devolve o erro da GoTrue para a tela traduzir", async () => {
    const erro = { message: "Invalid TOTP code entered", code: "mfa_verification_failed" };
    const { cliente } = clienteFalso([{ id: "f", factor_type: "totp", status: "verified" }], erro);
    expect((await verificarSegundoFator(cliente, "000000")).erro).toBe(erro);
  });

  it("sem fator verificado não chama o verify e avisa que não há o que conferir", async () => {
    const { cliente, challengeAndVerify } = clienteFalso([{ id: "p", factor_type: "totp", status: "unverified" }]);
    expect(await verificarSegundoFator(cliente, "123456")).toEqual({ erro: null, semFator: true });
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });

  it("falha ao listar os fatores volta como erro", async () => {
    const { cliente, challengeAndVerify } = clienteFalso([], null, { message: "fetch failed" });
    expect((await verificarSegundoFator(cliente, "123456")).erro?.message).toBe("fetch failed");
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });
});

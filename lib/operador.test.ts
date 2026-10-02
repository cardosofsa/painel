import { describe, expect, it } from "vitest";
import { assinarOperador, lerOperador, operadorPodeRota, telaInicialOperador } from "./operador-cookie";

const segredo = "segredo-de-teste-com-mais-de-16";

describe("operador", () => {
  it("cookie assinado: lê o próprio, recusa outra conta, adulterado e vencido", async () => {
    const c = await assinarOperador({ u: "loja", o: "op1", n: "Ana", a: ["pdv"] }, segredo, 1000);
    expect((await lerOperador(c, segredo, "loja", 2000))?.n).toBe("Ana");
    expect(await lerOperador(c, segredo, "outra", 2000)).toBeNull();
    expect(await lerOperador(c.replace(/^./, "x"), segredo, "loja", 2000)).toBeNull();
    expect(await lerOperador(c, segredo, "loja", 1000 + 13 * 3600_000)).toBeNull();
    expect(await lerOperador(c, "outro-segredo-qualquer-123", "loja", 2000)).toBeNull();
  });

  it("telas do operador", () => {
    expect(operadorPodeRota(["pdv"], "/pdv")).toBe(true);
    expect(operadorPodeRota(["pdv"], "/configuracoes")).toBe(false);
    expect(operadorPodeRota(["pdv"], "/dashboard")).toBe(false);
    expect(operadorPodeRota(["pdv"], "/operador")).toBe(true);
    expect(operadorPodeRota(["vendas"], "/vendas/imprimir")).toBe(true);
    expect(telaInicialOperador(["estoque", "produtos"])).toBe("/produtos");
    expect(telaInicialOperador(["vendas", "pdv"])).toBe("/pdv");
    expect(telaInicialOperador([])).toBe("/operador");
  });
});

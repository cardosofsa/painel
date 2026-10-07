import { describe, expect, it } from "vitest";
import { hashIp, hashIpDaRequisicao, ipDoCabecalho, segredoIp } from "./ip";

const cabecalhos = (h: Record<string, string>) => ({ get: (n: string) => h[n] ?? null });

describe("origem da requisição (0077)", () => {
  it("usa o primeiro endereço do x-forwarded-for, senão o x-real-ip", () => {
    expect(ipDoCabecalho("203.0.113.7, 10.0.0.1")).toBe("203.0.113.7");
    expect(ipDoCabecalho("  2001:db8::1  ")).toBe("2001:db8::1");
    expect(ipDoCabecalho(null, "198.51.100.2")).toBe("198.51.100.2");
    expect(ipDoCabecalho("", "")).toBe("");
    expect(ipDoCabecalho("x".repeat(200))).toHaveLength(64);
  });

  it("segredo: ACESSO_SEGREDO, senão o cofre, senão a service key", () => {
    expect(segredoIp({ ACESSO_SEGREDO: "a", IA_CHAVE_COFRE: "b" })).toBe("a");
    expect(segredoIp({ IA_CHAVE_COFRE: " b ", SUPABASE_SERVICE_ROLE_KEY: "c" })).toBe("b");
    expect(segredoIp({ SUPABASE_SERVICE_ROLE_KEY: "c" })).toBe("c");
    expect(segredoIp({})).toBeNull();
  });

  it("hash estável, em hex, que muda com o IP e com o segredo e não contém o IP", async () => {
    const h = await hashIp("203.0.113.7", "segredo");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIp("203.0.113.7", "segredo")).toBe(h);
    expect(await hashIp("203.0.113.8", "segredo")).not.toBe(h);
    expect(await hashIp("203.0.113.7", "outro")).not.toBe(h);
    expect(h).not.toContain("203");
  });

  it("sem IP ou sem segredo não inventa origem", async () => {
    expect(await hashIpDaRequisicao(cabecalhos({}), "s")).toBeNull();
    expect(await hashIpDaRequisicao(cabecalhos({ "x-forwarded-for": "1.2.3.4" }), null)).toBeNull();
    expect(await hashIpDaRequisicao(cabecalhos({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }), "s")).toBe(await hashIp("1.2.3.4", "s"));
  });
});

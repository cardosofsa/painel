import { describe, expect, it } from "vitest";
import { estourosNoPlano, percentualUso, rotuloLimite, situacaoAssinatura, type Plano, type ResumoAssinatura } from "./planos";

const planos = [
  { id: "gratis", nome: "Grátis" },
  { id: "pro", nome: "Pro" },
];
const base: ResumoAssinatura = { plano_id: "pro", plano_efetivo: "pro", status: "ativa", teste_ate: null, periodo_fim: null, plano_solicitado: null, solicitado_em: null, uso: { produtos: 10, lojas: 1, ia_mes: 5 } };
const agora = new Date("2026-10-02T12:00:00.000Z");

describe("situação da assinatura", () => {
  it("teste em andamento e vencido", () => {
    expect(situacaoAssinatura({ ...base, status: "teste", teste_ate: "2026-10-12T12:00:00.000Z" }, planos, agora)).toMatchObject({ texto: expect.stringContaining("10 dias restantes"), tom: "positive" });
    expect(situacaoAssinatura({ ...base, status: "teste", teste_ate: "2026-10-01T00:00:00.000Z", plano_efetivo: "gratis" }, planos, agora)).toMatchObject({ texto: expect.stringContaining("Valendo o plano Grátis"), tom: "negative" });
  });
  it("ativa, atrasada e período vencido", () => {
    expect(situacaoAssinatura(base, planos, agora).texto).toBe("Plano Pro ativo.");
    expect(situacaoAssinatura({ ...base, status: "atrasada" }, planos, agora).tom).toBe("negative");
    expect(situacaoAssinatura({ ...base, plano_efetivo: "gratis", periodo_fim: "2026-09-01T00:00:00.000Z" }, planos, agora).texto).toContain("período pago terminou");
  });
});

describe("limites", () => {
  it("rótulos e percentuais", () => {
    expect(rotuloLimite(null, "produtos")).toBe("produtos ilimitados");
    expect(rotuloLimite(1000, "produtos")).toBe("1.000 produtos");
    expect(percentualUso(25, 50)).toBe(50);
    expect(percentualUso(80, 50)).toBe(100);
    expect(percentualUso(5, null)).toBeNull();
    expect(percentualUso(1, 0)).toBe(100);
  });
  it("avisa o que estoura ao trocar para um plano menor", () => {
    const gratis: Plano = { id: "gratis", nome: "Grátis", descricao: null, preco_mensal: 0, limite_produtos: 5, limite_lojas: 0, limite_usuarios: 1, limite_ia_mes: 20, ativo: true, ordem: 1 };
    expect(estourosNoPlano(base.uso, gratis)).toEqual(["10 produtos (o plano permite 5)", "1 lojas conectadas (o plano permite 0)"]);
  });
});

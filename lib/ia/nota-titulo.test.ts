import { describe, expect, it } from "vitest";
import { avaliarTitulo } from "./nota-titulo";

describe("avaliarTitulo", () => {
  it("título bom leva 100", () => {
    const r = avaliarTitulo("Camiseta Dry Fit Masculina Academia Treino Corrida Proteção UV Tamanhos P ao GG", {
      limite: 100,
      termoPrincipal: "camiseta dry fit",
    });
    expect(r.nota).toBe(100);
    expect(r.criterios.every((c) => c.ok)).toBe(true);
  });

  it("acima do limite perde o critério de tamanho", () => {
    const r = avaliarTitulo("A".repeat(70), { limite: 60 });
    expect(r.criterios[0].ok).toBe(false);
    expect(r.criterios[0].texto).toContain("70/60");
  });

  it("curto demais perde o critério de espaço", () => {
    const r = avaliarTitulo("Camiseta", { limite: 100, termoPrincipal: "camiseta" });
    expect(r.criterios[1].ok).toBe(false);
    expect(r.criterios[1].texto).toContain("60");
  });

  it("termo principal fora das três primeiras palavras é apontado, ignorando acento e maiúscula", () => {
    const longe = avaliarTitulo("Kit Masculino Academia Camiseta", { limite: 40, termoPrincipal: "Camiseta" });
    expect(longe.criterios[2].ok).toBe(false);
    const perto = avaliarTitulo("Óleo para Barba Lenhador", { limite: 30, termoPrincipal: "oleo barba" });
    expect(perto.criterios[2].ok).toBe(true);
  });

  it("repetição ignora conectivos e acento", () => {
    const r = avaliarTitulo("Camiseta de Algodão para Camisetá de Treino", { limite: 50 });
    expect(r.criterios[3].ok).toBe(false);
    expect(r.criterios[3].texto).toContain("camiseta");
    expect(avaliarTitulo("Kit de Pincel de Maquiagem", { limite: 30 }).criterios[3].ok).toBe(true);
  });
});

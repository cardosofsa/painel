import { describe, expect, it } from "vitest";
import { MAXIMO_FALHAS_POR_EXECUCAO, mensagensDeFalhaCron } from "./cron-falhas";

describe("mensagensDeFalhaCron", () => {
  it("uma mensagem por falha, com o prefixo, sem quebra de linha", () => {
    expect(mensagensDeFalhaCron("Backup semanal", ["Storage: timeout\n  de novo", "  "])).toEqual(["Backup semanal: Storage: timeout de novo"]);
  });

  it("sem falha, nada a registrar", () => {
    expect(mensagensDeFalhaCron("Cron", [])).toEqual([]);
  });

  it("corta cada falha para a mensagem ficar curta", () => {
    const [m] = mensagensDeFalhaCron("Cron", ["x".repeat(1000)]);
    expect(m).toBe(`Cron: ${"x".repeat(240)}`);
  });

  it("acima do máximo, o excedente vira uma linha de resumo (singular e plural)", () => {
    const falhas = Array.from({ length: MAXIMO_FALHAS_POR_EXECUCAO + 3 }, (_, i) => `erro ${i}`);
    const m = mensagensDeFalhaCron("Cron", falhas);
    expect(m).toHaveLength(MAXIMO_FALHAS_POR_EXECUCAO + 1);
    expect(m[0]).toBe("Cron: erro 0");
    expect(m.at(-1)).toBe("Cron: mais 3 falhas nesta execução.");
    expect(mensagensDeFalhaCron("Cron", ["a", "b"], 1)).toEqual(["Cron: a", "Cron: mais 1 falha nesta execução."]);
  });
});

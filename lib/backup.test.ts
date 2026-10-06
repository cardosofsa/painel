import { describe, expect, it } from "vitest";
import { backupsParaApagar, caminhoBackup, TABELAS_BACKUP } from "./backup";

describe("backup", () => {
  it("guarda os 4 mais recentes e ignora arquivo estranho", () => {
    expect(
      backupsParaApagar(["2026-09-01.json", "2026-09-08.json", "2026-09-15.json", "2026-09-22.json", "2026-09-29.json", "2026-10-06.json", "lixo.txt"]),
    ).toEqual(["2026-09-08.json", "2026-09-01.json"]);
    expect(backupsParaApagar(["2026-10-06.json"])).toEqual([]);
  });

  it("caminho por conta e lista com as tabelas principais", () => {
    expect(caminhoBackup("u1", "2026-10-06")).toBe("u1/2026-10-06.json");
    expect(TABELAS_BACKUP).toContain("vendas");
    expect(TABELAS_BACKUP).toContain("venda_itens");
  });
});

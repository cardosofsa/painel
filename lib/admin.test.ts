import { describe, it, expect } from "vitest";
import { formatarDiffHistorico } from "./admin";

describe("formatarDiffHistorico", () => {
  it("detalhes vazio ou ausente devolve lista vazia", () => {
    expect(formatarDiffHistorico({})).toEqual([]);
    expect(formatarDiffHistorico(null)).toEqual([]);
    expect(formatarDiffHistorico(undefined)).toEqual([]);
  });

  it("mudança de status vira uma linha com rótulo em pt-BR", () => {
    const linhas = formatarDiffHistorico({ status: { de: "pendente", para: "ativo" } });
    expect(linhas).toEqual(["Status: Pendente → Ativo"]);
  });

  it("abas liberadas e removidas aparecem separadas, com rótulo e não o id cru", () => {
    const linhas = formatarDiffHistorico({
      abas: { de: ["dashboard", "configuracoes", "estoque"], para: ["dashboard", "configuracoes", "vendas", "pdv"] },
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toContain("liberou Vendas, PDV");
    expect(linhas[0]).toContain("removeu Estoque");
    expect(linhas[0]).not.toContain("estoque"); // não deve vazar o id cru em minúsculo
  });

  it("mesmo conjunto de abas em ordem diferente NÃO gera linha — não é mudança de verdade", () => {
    const linhas = formatarDiffHistorico({
      abas: { de: ["dashboard", "pdv", "vendas"], para: ["vendas", "dashboard", "pdv"] },
    });
    expect(linhas).toEqual([]);
  });

  it("abas com valor não-array não quebra (dado corrompido/nulo)", () => {
    expect(() => formatarDiffHistorico({ abas: { de: null, para: ["pdv"] } })).not.toThrow();
    expect(formatarDiffHistorico({ abas: { de: null, para: ["pdv"] } })[0]).toContain("liberou PDV");
  });

  it("vencimento nulo vira 'sem data', não 'null' ou string vazia", () => {
    const linhas = formatarDiffHistorico({ expira_em: { de: null, para: "2026-12-31" } });
    expect(linhas[0]).toBe("Vencimento: sem data → 31/12/2026");
  });

  it("observação vazia é rotulada, não deixada em branco", () => {
    const linhas = formatarDiffHistorico({ observacao: { de: null, para: "cliente antigo" } });
    expect(linhas[0]).toBe('Observação: "(vazia)" → "cliente antigo"');
  });

  it("vários campos alterados juntos viram várias linhas, uma por campo", () => {
    const linhas = formatarDiffHistorico({
      status: { de: "pendente", para: "ativo" },
      abas: { de: ["dashboard"], para: ["dashboard", "vendas"] },
    });
    expect(linhas).toHaveLength(2);
  });
});

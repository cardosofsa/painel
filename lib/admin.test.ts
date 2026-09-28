import { describe, it, expect } from "vitest";
import { formatarDiffHistorico, ordenarContas, type ContaOrdenavel } from "./admin";

function conta(over: Partial<ContaOrdenavel>): ContaOrdenavel {
  return { criado_em: "2026-01-01", ultimo_acesso: null, total_produtos: 0, total_vendas: 0, faturamento_total: 0, ...over };
}

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

describe("ordenarContas", () => {
  it("ordena crescente e decrescente por número", () => {
    const contas = [conta({ faturamento_total: 50 }), conta({ faturamento_total: 200 }), conta({ faturamento_total: 10 })];
    expect(ordenarContas(contas, "faturamento_total", "desc").map((c) => c.faturamento_total)).toEqual([200, 50, 10]);
    expect(ordenarContas(contas, "faturamento_total", "asc").map((c) => c.faturamento_total)).toEqual([10, 50, 200]);
  });

  it("não muta o array original", () => {
    const contas = [conta({ faturamento_total: 50 }), conta({ faturamento_total: 10 })];
    const original = [...contas];
    ordenarContas(contas, "faturamento_total", "asc");
    expect(contas).toEqual(original);
  });

  it("'nunca acessou' (null) sempre vai pro fim, em qualquer direção", () => {
    const contas = [
      conta({ ultimo_acesso: "2026-03-01" }),
      conta({ ultimo_acesso: null }),
      conta({ ultimo_acesso: "2026-01-01" }),
    ];
    expect(ordenarContas(contas, "ultimo_acesso", "desc").at(-1)?.ultimo_acesso).toBeNull();
    expect(ordenarContas(contas, "ultimo_acesso", "asc").at(-1)?.ultimo_acesso).toBeNull();
  });

  it("ordena por data (string ISO compara lexicograficamente igual)", () => {
    const contas = [conta({ criado_em: "2026-03-01" }), conta({ criado_em: "2026-01-15" })];
    expect(ordenarContas(contas, "criado_em", "asc").map((c) => c.criado_em)).toEqual(["2026-01-15", "2026-03-01"]);
  });
});

describe("formatarDiffHistorico — cota de IA", () => {
  it("mostra a mudança de cota de forma legível", () => {
    const linhas = formatarDiffHistorico({ ia_limite_diario: { de: 20, para: 50 } });
    expect(linhas).toEqual(["Cota de IA: 20/dia → 50/dia"]);
  });

  it("zero aparece como 'desligada', não como '0/dia'", () => {
    expect(formatarDiffHistorico({ ia_limite_diario: { de: 20, para: 0 } })).toEqual([
      "Cota de IA: 20/dia → desligada",
    ]);
    expect(formatarDiffHistorico({ ia_limite_diario: { de: 0, para: 10 } })).toEqual([
      "Cota de IA: desligada → 10/dia",
    ]);
  });

  it("convive com as outras mudanças na mesma linha de histórico", () => {
    const linhas = formatarDiffHistorico({
      status: { de: "pendente", para: "ativo" },
      ia_limite_diario: { de: 20, para: 5 },
    });
    expect(linhas).toHaveLength(2);
    expect(linhas[1]).toContain("Cota de IA");
  });
});

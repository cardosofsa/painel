import { describe, it, expect } from "vitest";
import {
  abaDaRota,
  rotaEhLivre,
  normalizarAbas,
  podeAcessarRota,
  acessoExpirado,
  contaLiberada,
  ABAS_OBRIGATORIAS,
  TODAS_AS_ABAS,
} from "./acesso";

/**
 * Este módulo é o que o middleware usa para decidir quem entra onde. Um erro aqui libera
 * aba de uma conta para outra, ou tranca alguém fora do próprio sistema — por isso ele é
 * testado antes de qualquer outra coisa do app.
 */

describe("normalizarAbas", () => {
  it("sempre inclui as abas obrigatórias, mesmo partindo de uma lista vazia", () => {
    const abas = normalizarAbas([]);
    for (const obrigatoria of ABAS_OBRIGATORIAS) {
      expect(abas).toContain(obrigatoria);
    }
  });

  it("descarta id que não existe no catálogo", () => {
    expect(normalizarAbas(["pdv", "hackear", "nao-existe"])).not.toContain("hackear");
    expect(normalizarAbas(["pdv", "hackear"])).toContain("pdv");
  });

  it("devolve na ordem do catálogo, não na ordem da entrada", () => {
    const abas = normalizarAbas(["configuracoes", "pdv", "dashboard"]);
    const esperado = TODAS_AS_ABAS.filter((a) => abas.includes(a));
    expect(abas).toEqual(esperado);
  });

  it("colapsa duplicatas", () => {
    const abas = normalizarAbas(["pdv", "pdv", "pdv"]);
    expect(abas.filter((a) => a === "pdv")).toHaveLength(1);
  });

  it("acrescenta as obrigatórias à liberação parcial", () => {
    expect(normalizarAbas(["pdv"])).toEqual(["dashboard", "pdv", "configuracoes"]);
  });
});

describe("abaDaRota", () => {
  it("resolve a rota exata", () => {
    expect(abaDaRota("/precificacao")).toBe("precificacao");
    expect(abaDaRota("/pdv")).toBe("pdv");
  });

  it("resolve subrota", () => {
    expect(abaDaRota("/vendas/123")).toBe("vendas");
  });

  it("NÃO casa por prefixo parcial — /precificacaoX não é /precificacao", () => {
    expect(abaDaRota("/precificacaoX")).toBeNull();
    expect(abaDaRota("/produtosfalso")).toBeNull();
  });

  it("devolve null para rota que não pertence a aba nenhuma", () => {
    expect(abaDaRota("/")).toBeNull();
    expect(abaDaRota("/qualquer-coisa")).toBeNull();
  });
});

describe("rotaEhLivre", () => {
  it("reconhece /admin e suas subrotas", () => {
    expect(rotaEhLivre("/admin")).toBe(true);
    expect(rotaEhLivre("/admin/contas")).toBe(true);
  });

  it("não confunde /admin com um prefixo parecido", () => {
    expect(rotaEhLivre("/administrativo")).toBe(false);
  });

  it("rota comum não é livre", () => {
    expect(rotaEhLivre("/vendas")).toBe(false);
  });
});

describe("podeAcessarRota", () => {
  it("bloqueia aba não liberada", () => {
    expect(podeAcessarRota(["dashboard"], "/vendas")).toBe(false);
    expect(podeAcessarRota(["dashboard"], "/financeiro")).toBe(false);
  });

  it("libera aba concedida, inclusive em subrota", () => {
    expect(podeAcessarRota(["dashboard", "vendas"], "/vendas")).toBe(true);
    expect(podeAcessarRota(["dashboard", "vendas"], "/vendas/abc-123")).toBe(true);
  });

  it("libera as obrigatórias mesmo sem constar na lista", () => {
    expect(podeAcessarRota([], "/dashboard")).toBe(true);
    expect(podeAcessarRota([], "/configuracoes")).toBe(true);
  });

  it("deixa passar rota que não é de aba nenhuma (o /admin tem trava própria no middleware)", () => {
    expect(podeAcessarRota([], "/admin")).toBe(true);
    expect(podeAcessarRota([], "/rota-desconhecida")).toBe(true);
  });

  it("não libera por prefixo acidental", () => {
    // "produtosX" não é uma aba válida, então não pode destravar /produtos.
    expect(podeAcessarRota(["produtosX"], "/produtos")).toBe(false);
  });
});

describe("acessoExpirado", () => {
  const meioDia = new Date("2026-06-15T12:00:00").getTime();

  it("sem data de expiração nunca expira", () => {
    expect(acessoExpirado(null, meioDia)).toBe(false);
  });

  it("ontem já expirou", () => {
    expect(acessoExpirado("2026-06-14", meioDia)).toBe(true);
  });

  it("HOJE ainda vale — a conta tem o dia inteiro", () => {
    expect(acessoExpirado("2026-06-15", meioDia)).toBe(false);
  });

  it("amanhã ainda vale", () => {
    expect(acessoExpirado("2026-06-16", meioDia)).toBe(false);
  });

  it("continua válido às 23:59 do dia de expiração e expira no dia seguinte", () => {
    expect(acessoExpirado("2026-06-15", new Date("2026-06-15T23:59:00").getTime())).toBe(false);
    expect(acessoExpirado("2026-06-15", new Date("2026-06-16T00:01:00").getTime())).toBe(true);
  });
});

describe("contaLiberada", () => {
  const agora = new Date("2026-06-15T12:00:00").getTime();

  it("pendente não entra, mesmo sem data de expiração", () => {
    expect(contaLiberada({ status: "pendente", expira_em: null }, agora)).toBe(false);
  });

  it("suspenso não entra", () => {
    expect(contaLiberada({ status: "suspenso", expira_em: null }, agora)).toBe(false);
  });

  it("ativo com prazo vencido não entra", () => {
    expect(contaLiberada({ status: "ativo", expira_em: "2026-06-01" }, agora)).toBe(false);
  });

  it("ativo sem prazo entra", () => {
    expect(contaLiberada({ status: "ativo", expira_em: null }, agora)).toBe(true);
  });

  it("ativo com prazo futuro entra", () => {
    expect(contaLiberada({ status: "ativo", expira_em: "2026-12-31" }, agora)).toBe(true);
  });
});

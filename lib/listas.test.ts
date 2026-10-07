import { describe, expect, it } from "vitest";
import {
  conciliarTermo,
  contemPalavra,
  escaparLike,
  faixaDaPagina,
  filtrosDeBusca,
  hrefLista,
  lerFiltroClientes,
  lerFiltroEstoque,
  lerFiltroProdutos,
  lerId,
  lerOpcao,
  lerPagina,
  lerTermo,
  palavrasDaBusca,
  precisaRepor,
  resumoDeEstoque,
  SITUACAO_POR_SLUG,
  situacaoEstoque,
  SLUGS_SITUACAO,
  totalDePaginas,
  valorPostgrest,
} from "./listas";

describe("parâmetros da URL", () => {
  it("lê a página como inteiro ≥ 1", () => {
    expect(lerPagina(undefined)).toBe(1);
    expect(lerPagina("3")).toBe(3);
    expect(lerPagina(["4", "9"])).toBe(4);
    expect(lerPagina("0")).toBe(1);
    expect(lerPagina("-2")).toBe(1);
    expect(lerPagina("2.5")).toBe(1);
    expect(lerPagina("abc")).toBe(1);
    expect(lerPagina("999999999")).toBe(100_000);
  });

  it("limpa o termo: sem controle, sem *, espaços normalizados, até 80", () => {
    expect(lerTermo("  caneca   térmica ")).toBe("caneca térmica");
    expect(lerTermo("a*b")).toBe("a b");
    expect(lerTermo("x\u0000y\ny")).toBe("x y y");
    expect(lerTermo("50% off_2")).toBe("50% off_2");
    expect(lerTermo("a".repeat(200))).toHaveLength(80);
    expect(lerTermo(undefined)).toBe("");
    // Idempotente: o termo que volta na URL é igual ao que a caixa mandou.
    const corte = `${"a".repeat(79)} b`;
    expect(lerTermo(lerTermo(corte))).toBe(lerTermo(corte));
  });

  it("só aceita opção conhecida e id em formato uuid", () => {
    expect(lerOpcao("ativos", ["ativos", "inativos"] as const)).toBe("ativos");
    expect(lerOpcao("todos", ["ativos", "inativos"] as const)).toBe("");
    expect(lerId("8BD03D19-5553-474A-A14C-FD2A453E0A80")).toBe("8bd03d19-5553-474a-a14c-fd2a453e0a80");
    expect(lerId("1),id.eq.(2")).toBe("");
  });
});

describe("paginação", () => {
  it("converte página em faixa do .range() (inclusiva)", () => {
    expect(faixaDaPagina(1)).toEqual({ de: 0, ate: 49 });
    expect(faixaDaPagina(3)).toEqual({ de: 100, ate: 149 });
    expect(faixaDaPagina(2, 10)).toEqual({ de: 10, ate: 19 });
  });

  it("conta páginas com no mínimo uma", () => {
    expect(totalDePaginas(0)).toBe(1);
    expect(totalDePaginas(50)).toBe(1);
    expect(totalDePaginas(51)).toBe(2);
  });

  it("monta a URL sem vazios e sem pagina=1", () => {
    expect(hrefLista("/produtos", { q: "", pagina: 1 })).toBe("/produtos");
    expect(hrefLista("/produtos", { q: "caneca", pagina: 3 }, { pagina: null })).toBe("/produtos?q=caneca");
    expect(hrefLista("/clientes", { q: "ana maria" }, { pagina: 2 })).toBe("/clientes?q=ana+maria&pagina=2");
    expect(hrefLista("/x", { a: "1" }, { a: "" })).toBe("/x");
  });
});

describe("busca no banco (ilike)", () => {
  it("escapa os curingas do LIKE", () => {
    expect(escaparLike("50%")).toBe("50\\%");
    expect(escaparLike("CAM_P")).toBe("CAM\\_P");
    expect(escaparLike("a\\b")).toBe("a\\\\b");
    expect(escaparLike("V-0007")).toBe("V-0007");
  });

  it("põe o valor entre aspas do PostgREST, escapando aspas e barra", () => {
    expect(valorPostgrest("a,b")).toBe('"a,b"');
    expect(valorPostgrest('diz "oi"')).toBe('"diz \\"oi\\""');
    expect(valorPostgrest("a\\_b")).toBe('"a\\\\_b"');
  });

  it("separa palavras sem repetir e com limite", () => {
    expect(palavrasDaBusca("Camiseta  azul camiseta")).toEqual(["camiseta", "azul"]);
    expect(palavrasDaBusca("a b c d e f g")).toHaveLength(5);
    expect(palavrasDaBusca("   ")).toEqual([]);
  });

  it("monta um or por palavra, com o padrão escapado e entre aspas", () => {
    expect(filtrosDeBusca("caneca", ["nome", "sku"])).toEqual(['nome.ilike."*caneca*",sku.ilike."*caneca*"']);
    // `_` e `%` viram literais; vírgula e parêntese não quebram o filtro.
    expect(filtrosDeBusca("CAM_P", ["sku"])).toEqual(['sku.ilike."*cam\\\\_p*"']);
    expect(filtrosDeBusca("50%", ["nome"])).toEqual(['nome.ilike."*50\\\\%*"']);
    expect(filtrosDeBusca("a),id.eq.(1", ["nome"])).toEqual(['nome.ilike."*a),id.eq.(1*"']);
    expect(filtrosDeBusca("", ["nome"])).toEqual([]);
  });

  it("acrescenta condições extras por palavra", () => {
    expect(filtrosDeBusca("azul preto", ["nome"], (p) => (p === "azul" ? ["grupo_id.in.(g1,g2)"] : []))).toEqual([
      'nome.ilike."*azul*",grupo_id.in.(g1,g2)',
      'nome.ilike."*preto*"',
    ]);
  });

  it("filtra em memória com a mesma regra, sem caixa", () => {
    expect(contemPalavra("Camiseta Básica", "BÁSICA")).toBe(true);
    expect(contemPalavra(null, "x")).toBe(false);
  });
});

describe("situação de estoque", () => {
  it("classifica cada produto numa situação só", () => {
    expect(situacaoEstoque({ estoque: 0, estoque_minimo: 5 })).toBe("Sem estoque");
    expect(situacaoEstoque({ estoque: 0, estoque_minimo: 0 })).toBe("Sem estoque");
    expect(situacaoEstoque({ estoque: 5, estoque_minimo: 5 })).toBe("Estoque baixo");
    expect(situacaoEstoque({ estoque: -2, estoque_minimo: 5 })).toBe("Estoque baixo");
    expect(situacaoEstoque({ estoque: 6, estoque_minimo: 5 })).toBe("Em estoque");
  });

  it("repor = no mínimo ou abaixo", () => {
    expect(precisaRepor({ estoque: 5, estoque_minimo: 5 })).toBe(true);
    expect(precisaRepor({ estoque: 0, estoque_minimo: 0 })).toBe(true);
    expect(precisaRepor({ estoque: 6, estoque_minimo: 5 })).toBe(false);
  });

  it("resume a lista inteira", () => {
    const r = resumoDeEstoque([
      { estoque: 10, estoque_minimo: 2, custo: 1.1 },
      { estoque: 3, estoque_minimo: 5, custo: 0.1 },
      { estoque: 0, estoque_minimo: 0, custo: 9 },
    ]);
    expect(r).toEqual({
      total: 3,
      unidades: 13,
      valorEmEstoque: 11.3,
      reposicao: 2,
      porSituacao: { "Em estoque": 1, "Estoque baixo": 1, "Sem estoque": 1 },
    });
    expect(resumoDeEstoque([]).total).toBe(0);
  });
});

describe("filtros de cada tela", () => {
  const id = "8bd03d19-5553-474a-a14c-fd2a453e0a80";

  it("Produtos: lê da URL e descarta o que não conhece", () => {
    expect(lerFiltroProdutos({})).toEqual({ q: "", pagina: 1, categoria: "", armazem: "", ativo: "", estoque: "" });
    expect(lerFiltroProdutos({ q: " caneca ", pagina: "2", categoria: id, armazem: "x", ativo: "inativos", estoque: "baixo" })).toEqual({
      q: "caneca",
      pagina: 2,
      categoria: id,
      armazem: "",
      ativo: "inativos",
      estoque: "baixo",
    });
    expect(lerFiltroProdutos({ estoque: "Estoque baixo", ativo: "todos" })).toMatchObject({ estoque: "", ativo: "" });
  });

  it("Produtos e Clientes aceitam o ?busca= da busca global; ?q= tem prioridade", () => {
    expect(lerFiltroProdutos({ busca: "SKU-1" }).q).toBe("SKU-1");
    expect(lerFiltroProdutos({ busca: "SKU-1", q: "outro" }).q).toBe("outro");
    expect(lerFiltroClientes({ busca: "Ana" }).q).toBe("Ana");
  });

  it("Clientes e Estoque", () => {
    expect(lerFiltroClientes({ dup: "1", pagina: "3" })).toEqual({ q: "", pagina: 3, dup: "1" });
    expect(lerFiltroClientes({ dup: "sim" }).dup).toBe("");
    expect(lerFiltroEstoque({ situacao: "repor", armazem: id })).toEqual({ q: "", pagina: 1, armazem: id, situacao: "repor" });
    expect(lerFiltroEstoque({ situacao: "Repor" }).situacao).toBe("");
  });

  it("cada slug de estoque é uma situação", () => {
    for (const s of SLUGS_SITUACAO) expect(SITUACAO_POR_SLUG[s]).toBeTruthy();
    expect(SLUGS_SITUACAO).toEqual(["com", "baixo", "sem"]);
  });
});

describe("conciliarTermo", () => {
  it("reconhece a volta da própria navegação e descarta as anteriores", () => {
    expect(conciliarTermo("abc", ["ab", "abc", "abcd"])).toEqual({ externo: false, enviados: ["abcd"] });
    expect(conciliarTermo("abcd", ["ab", "abc", "abcd"])).toEqual({ externo: false, enviados: [] });
  });

  it("trata o que não foi pedido pela caixa como navegação de fora", () => {
    expect(conciliarTermo("", ["abc"])).toEqual({ externo: true, enviados: [] });
    expect(conciliarTermo("SKU-1", [])).toEqual({ externo: true, enviados: [] });
  });
});

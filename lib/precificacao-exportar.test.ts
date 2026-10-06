import { describe, it, expect } from "vitest";
import { tabelaPrecificacoes, tabelaVariacoes, tabelaEmMassa } from "./precificacao-exportar";
import { celulaPlanilha, tabelaParaCsv } from "./exportar";
import type { AnuncioSalvo, PrecificacaoHist } from "./precificacao-tipos";
import type { ResultadoLinhaMassa } from "./precificacao-massa";

const base: PrecificacaoHist = {
  id: "h1",
  produto_id: null,
  produto_nome: "Caneca",
  canal: "Shopee",
  titulo_anuncio: "Caneca 300ml",
  loja_id: null,
  componentes: null,
  taxa_extra_valor: null,
  taxa_extra_tipo: null,
  custo: 30,
  taxa_variavel_pct: 0.2,
  taxa_fixa: 4,
  taxa_adicional_pct: 0,
  imposto_pct: 0.06,
  margem_pct: 0.28,
  preco_calculado: 73.91,
  lucro: 20.7,
  // 1h30 UTC do dia 6 = 22h30 do dia 5 no Brasil.
  criado_em: "2026-10-06T01:30:00Z",
  origem: "individual",
};

describe("tabelaPrecificacoes", () => {
  const t = tabelaPrecificacoes([base, { ...base, id: "h2", produto_nome: "Kit", preco_calculado: 0, lucro: 0 }], "2 precificações");
  const valor = (rotulo: string, linha = 0) => t.colunas.find((c) => c.rotulo === rotulo)!.valor(t.linhas[linha]);

  it("uma linha por precificação, com as colunas que interessam na planilha", () => {
    expect(t.linhas).toHaveLength(2);
    expect(t.colunas.map((c) => c.rotulo)).toEqual([
      "Data",
      "Produto / kit",
      "Canal",
      "Título do anúncio",
      "Custo",
      "Comissão",
      "Taxa fixa",
      "Imposto",
      "Preço de venda",
      "Lucro",
      "Margem",
      "Markup sobre o custo",
    ]);
  });

  it("dinheiro e percentual saem como NÚMERO, para somar e formatar no Excel", () => {
    expect(celulaPlanilha(valor("Preço de venda"), "moeda")).toBe(73.91);
    expect(valor("Comissão")).toBe(0.2);
    expect(valor("Margem")).toBe(0.2801);
    expect(valor("Markup sobre o custo")).toBe(0.69);
  });

  it("a data é o dia no Brasil, não o dia em UTC", () => {
    expect(valor("Data")).toBe("2026-10-05");
  });

  it("arredonda: dinheiro no centavo e percentual em 4 casas", () => {
    const t2 = tabelaPrecificacoes([{ ...base, preco_calculado: 73.91304347826087, lucro: 20.695652173913047 }]);
    const v = (r: string) => t2.colunas.find((c) => c.rotulo === r)!.valor(t2.linhas[0]);
    expect(v("Preço de venda")).toBe(73.91);
    expect(v("Lucro")).toBe(20.7);
    expect(v("Margem")).toBe(0.28);
  });

  it("preço zero não vira divisão por zero na margem", () => {
    expect(valor("Margem", 1)).toBe(0);
  });

  it("o CSV também sai no formato do Excel em português", () => {
    const csv = tabelaParaCsv(t);
    expect(csv.split("\n")[1]).toContain("Caneca;Shopee;Caneca 300ml;30;0,2;4;0,06;73,91;20,7");
  });
});

describe("tabelaVariacoes", () => {
  const anuncio: AnuncioSalvo = {
    id: "a1",
    nome_anuncio: "Óleo",
    titulo_anuncio: null,
    criado_em: "2026-10-01T12:00:00Z",
    variacoes: [
      { id: "v1", nome_variacao: "Unidade", multiplicador: 1, custo: 10, taxa_variavel_pct: 0.2, taxa_fixa: 4, taxa_adicional_pct: 0, imposto_pct: 0.06, taxa_extra_valor: null, taxa_extra_tipo: null, margem_pct: null, preco_calculado: 25.68, lucro: 5 },
      { id: "v2", nome_variacao: "Kit 2", multiplicador: 2, custo: 20, taxa_variavel_pct: 0.2, taxa_fixa: 4, taxa_adicional_pct: 0, imposto_pct: 0.06, taxa_extra_valor: null, taxa_extra_tipo: null, margem_pct: null, preco_calculado: 45.95, lucro: 10 },
    ],
  };

  it("uma linha por variação, com o anúncio repetido", () => {
    const t = tabelaVariacoes([anuncio]);
    expect(t.linhas).toHaveLength(2);
    expect(t.colunas[1].valor(t.linhas[1])).toBe("Óleo");
    expect(t.colunas.find((c) => c.rotulo === "Variação")!.valor(t.linhas[1])).toBe("Kit 2");
    expect(t.colunas.find((c) => c.rotulo === "Markup sobre o custo")!.valor(t.linhas[0])).toBeCloseTo(0.5, 6);
  });
});

describe("tabelaEmMassa", () => {
  it("cabeçalhos em português, não as chaves internas (precoSugerido, novoLucro)", () => {
    const r = {
      linha: { id: "l", produtoId: null, sku: "A1", nome: "Caneca", custo: 30, lojaId: null, comissaoPct: 20, taxaFixa: 4, impostoPct: 6, margemPct: 25, precoAtual: 60 },
      loja: null,
      faixa: null,
      resultado: { custoTotal: 30, precoVenda: 69.39, taxaVariavelValor: 0, taxaAdicionalValor: 0, impostoValor: 0, taxaExtraCalculada: 0, lucroLiquido: 17.35, margemEfetivaPct: 0.25, markupSobreCustoPct: 0.58, viavel: true },
      diferenca: 9.39,
      precisaSubir: true,
    } as ResultadoLinhaMassa;
    const t = tabelaEmMassa([r]);
    expect(t.colunas.map((c) => c.rotulo)).toContain("Preço sugerido");
    expect(t.colunas.find((c) => c.rotulo === "Loja")!.valor(t.linhas[0])).toBe("Manual");
    expect(t.colunas.find((c) => c.rotulo === "Diferença")!.valor(t.linhas[0])).toBe(9.39);
  });
});

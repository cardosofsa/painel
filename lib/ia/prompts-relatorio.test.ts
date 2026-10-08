import { describe, expect, it } from "vitest";
import { hashContextoRelatorio, interpretarRelatorio, montarPromptRelatorio, relatorioVazio, type ContextoRelatorioIA } from "./prompts-relatorio";

const ctx: ContextoRelatorioIA = {
  mes: "outubro de 2026",
  emAndamento: false,
  saldo: { inicial: 1000, projetadoInicial: 1500, projetadoAtual: 1400, real: 1200, desvioPct: -20 },
  caixa: { entradas: 5000, saidas: 4800, resultado: 200 },
  dre: { receitaBruta: 6000, taxasMarketplace: 900, impostos: 300, cmv: 2000, anuncios: 400, despesas: 1200, lucroLiquido: 1200, pedidos: 80 },
  mesesAnteriores: [{ mes: "setembro de 2026", lucroLiquido: 1000, receitaBruta: 5000, desvioPct: 5 }],
  despesasEmAlta: [{ categoria: "Internet", valor: 200, media: 100, variacaoPct: 100 }],
  despesasFixas: [{ nome: "Aluguel", valor: 800 }],
  maioresSaidas: [{ descricao: "Material de embalagem", categoria: "Embalagem", valor: 300 }],
};

describe("montarPromptRelatorio", () => {
  it("leva os números e as regras, sem inventar campo vazio", () => {
    const p = montarPromptRelatorio(ctx);
    expect(p).toContain("R$ 1500,00");
    expect(p).toContain("-20,0%");
    expect(p).toContain("Internet: R$ 200,00 (média anterior R$ 100,00, variação 100,0%)");
    expect(p).toContain("O mês já fechou");
    expect(p).toContain("SOMENTE os números");
  });
  it("mês em andamento pede análise parcial; sem DRE a linha some", () => {
    const p = montarPromptRelatorio({ ...ctx, emAndamento: true, dre: null, mesesAnteriores: [], despesasEmAlta: [] });
    expect(p).toContain("análise como parcial");
    expect(p).not.toContain("Lucro líquido do mês");
    expect(p).not.toContain("Meses anteriores:");
  });
});

describe("interpretarRelatorio", () => {
  it("lê a resposta, corta nos limites e aceita cerca de markdown", () => {
    const bruto = "```json\n" + JSON.stringify({
      resumo: "Mês bom.",
      acertos: ["Margem subiu", "", "Menos anúncios", "c", "d"],
      previsao: "Errou por causa do fiado.",
      gastos_revisar: [{ titulo: "Internet", detalhe: "Dobrou", valor: "200,50" }, { titulo: "", detalhe: "x" }],
      oportunidades: ["Renegociar frete"],
      plano: [{ acao: "Cortar assinatura", motivo: "Não usa" }, { acao: "", motivo: "x" }],
      meta_saldo: 1800,
    }) + "\n```";
    const r = interpretarRelatorio(bruto);
    expect(r.resumo).toBe("Mês bom.");
    expect(r.acertos).toEqual(["Margem subiu", "Menos anúncios", "c"]);
    expect(r.gastosRevisar).toEqual([{ titulo: "Internet", detalhe: "Dobrou", valor: 200.5 }]);
    expect(r.plano).toEqual([{ acao: "Cortar assinatura", motivo: "Não usa" }]);
    expect(r.metaSaldo).toBe(1800);
  });

  it("lixo vira relatório vazio, sem lançar; valor negativo ou texto não numérico vira null", () => {
    expect(relatorioVazio(interpretarRelatorio("não é json"))).toBe(true);
    const r = interpretarRelatorio(JSON.stringify({ resumo: "ok", gastos_revisar: [{ titulo: "A", detalhe: "b", valor: -5 }], meta_saldo: "abc" }));
    expect(r.gastosRevisar[0].valor).toBeNull();
    expect(r.metaSaldo).toBeNull();
    expect(relatorioVazio(r)).toBe(false);
  });

  it("a resposta no tamanho máximo cabe no cache de 6.000 caracteres", () => {
    const bruto = JSON.stringify({
      resumo: "x".repeat(400),
      acertos: Array(3).fill("x".repeat(150)),
      previsao: "x".repeat(300),
      gastos_revisar: Array(4).fill({ titulo: "x".repeat(50), detalhe: "x".repeat(160), valor: 123456.78 }),
      oportunidades: Array(3).fill("x".repeat(150)),
      plano: Array(4).fill({ acao: "x".repeat(100), motivo: "x".repeat(150) }),
      meta_saldo: 100000,
    });
    expect(bruto.length).toBeLessThan(6000);
  });
});

describe("hashContextoRelatorio", () => {
  it("é estável, ignora centavos e muda quando um número relevante muda", () => {
    const h = hashContextoRelatorio(ctx);
    expect(hashContextoRelatorio({ ...ctx, caixa: { ...ctx.caixa, entradas: 5000.3 } })).toBe(h);
    expect(hashContextoRelatorio({ ...ctx, caixa: { ...ctx.caixa, entradas: 5100 } })).not.toBe(h);
    expect(hashContextoRelatorio({ ...ctx, emAndamento: true })).not.toBe(h);
  });
});

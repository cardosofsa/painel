import { describe, expect, it } from "vitest";
import { interpretarRelatorioAnuncios, interpretarRelatorioRepasses, lerDataRelatorio, situacaoRepasse } from "./relatorios-financeiros";

describe("datas dos relatórios", () => {
  it("lê os formatos comuns", () => {
    expect(lerDataRelatorio("01/09/2026")).toBe("2026-09-01");
    expect(lerDataRelatorio("1/9/2026 10:00")).toBe("2026-09-01");
    expect(lerDataRelatorio("2026-09-01T03:00:00.000Z")).toBe("2026-09-01");
    expect(lerDataRelatorio("lixo")).toBeNull();
  });
});

describe("relatório de anúncios", () => {
  const matriz = [
    ["Relatório de Anúncios - Loja Sertão"],
    ["Período", "01/09/2026 - 30/09/2026"],
    [],
    ["#", "Nome do Anúncio", "ID do produto", "Impressões", "Cliques", "Conversões", "GMV", "Despesas", "ROAS"],
    ["1", "Caneca térmica", "123", "10000", "300", "12", "R$ 600,00", "R$ 80,50", "7,45"],
    ["2", "Caneca térmica", "123", "500", "20", "1", "50", "9,50", "5,2"],
    ["3", "Kit café", "456", "100", "2", "0", "0", "0", "0"],
    ["", "Total", "", "", "", "", "", "90,00", ""],
  ].filter((l) => l.length);

  it("acha o cabeçalho depois do preâmbulo, lê o período e soma o mesmo anúncio", () => {
    const r = interpretarRelatorioAnuncios(matriz);
    expect(r.periodo).toEqual({ inicio: "2026-09-01", fim: "2026-09-30" });
    expect(r.linhas).toEqual([{ campanha: "Caneca térmica", sku: "123", valor: 90, pedidos: 13, vendas: 650 }]);
    expect(r.total).toBe(90);
    expect(r.erros).toEqual([]);
  });

  it("sem a coluna de gasto, diz quais cabeçalhos achou", () => {
    const r = interpretarRelatorioAnuncios([["Nome do Anúncio", "Cliques"], ["A", "3"]]);
    expect(r.faltando).toEqual(["valor"]);
    expect(r.erros[0].mensagem).toContain("Nome do Anúncio, Cliques");
  });
});

describe("relatório de repasses", () => {
  it("soma ajustes do mesmo pedido e fica com a data mais recente", () => {
    const r = interpretarRelatorioRepasses([
      ["Minha Renda"],
      ["ID do pedido", "Data de liberação", "Valor liberado"],
      ["2610ABC", "05/10/2026", "R$ 150,00"],
      ["2610ABC", "07/10/2026", "-5,00"],
      ["#2610XYZ", "06/10/2026", "80"],
      ["2610BAD", "06/10/2026", "abc"],
    ]);
    expect(r.repasses).toEqual([
      { numero: "2610ABC", valor: 145, data: "2026-10-07" },
      { numero: "2610XYZ", valor: 80, data: "2026-10-06" },
    ]);
    expect(r.total).toBe(225);
    expect(r.erros).toHaveLength(1);
  });

  it("situação: conciliado, divergente, aguardando — nunca atrasado", () => {
    expect(situacaoRepasse({ repasse: 100, repasse_recebido: 100.03 })).toBe("conciliado");
    expect(situacaoRepasse({ repasse: 100, repasse_recebido: 90 })).toBe("divergente");
    expect(situacaoRepasse({ repasse: 100, repasse_recebido: null })).toBe("aguardando");
  });

});

import { describe, expect, it } from "vitest";
import { celulaPlanilha, celulaTexto, matrizTexto, nomeArquivo, tabelaParaCsv, textoSeguro, type TabelaExport } from "./exportar";

interface P { sku: string; nome: string; custo: number; estoque: number; margem: number; criado: string }
const tabela: TabelaExport<P> = {
  titulo: "Produtos",
  colunas: [
    { rotulo: "SKU", valor: (p) => p.sku },
    { rotulo: "Nome", valor: (p) => p.nome },
    { rotulo: "Custo", tipo: "moeda", valor: (p) => p.custo },
    { rotulo: "Estoque", tipo: "inteiro", valor: (p) => p.estoque },
    { rotulo: "Margem", tipo: "percentual", valor: (p) => p.margem },
    { rotulo: "Criado", tipo: "data", valor: (p) => p.criado },
  ],
  linhas: [{ sku: "A1", nome: "=HYPERLINK(\"x\")", custo: 12.5, estoque: 3, margem: 0.254, criado: "2026-09-30" }],
  total: ["Total", null, 12.5, 3, null, null],
};

describe("exportar", () => {
  it("texto que parece fórmula ganha apóstrofo; número negativo não", () => {
    expect(textoSeguro("=SOMA(A1)")).toBe("'=SOMA(A1)");
    expect(textoSeguro("-12,50")).toBe("-12,50");
    expect(textoSeguro("Camiseta")).toBe("Camiseta");
  });

  it("planilha: número continua número, data vira Date, texto seguro", () => {
    expect(celulaPlanilha(12.5, "moeda")).toBe(12.5);
    expect(celulaPlanilha("12,5", "numero")).toBe(12.5);
    expect(celulaPlanilha("2026-09-30", "data")).toBeInstanceOf(Date);
    expect(celulaPlanilha("@cmd", "texto")).toBe("'@cmd");
    expect(celulaPlanilha(null)).toBeNull();
  });

  it("texto formatado para PDF e imagem", () => {
    expect(celulaTexto(1234.5, "moeda")).toMatch(/1\.234,50/);
    expect(celulaTexto(0.254, "percentual")).toBe("25,4%");
    expect(celulaTexto("2026-09-30T10:00:00Z", "data")).toBe("30/09/2026");
    expect(celulaTexto(3.7, "inteiro")).toBe("4");
  });

  it("matriz tem cabeçalho, linhas e total formatados", () => {
    const m = matrizTexto(tabela);
    expect(m.cabecalho[0]).toBe("SKU");
    expect(m.linhas[0][2]).toMatch(/12,50/);
    expect(m.total?.[0]).toBe("Total");
    expect(m.total?.[2]).toMatch(/12,50/);
  });

  it("CSV neutraliza fórmula e mantém número cru", () => {
    const csv = tabelaParaCsv(tabela);
    expect(csv.split("\n")[0]).toBe("SKU,Nome,Custo,Estoque,Margem,Criado");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain(",12.5,3,0.254,30/09/2026");
  });

  it("nome de arquivo sem acento e com data", () => {
    expect(nomeArquivo("Pedidos de Compra — Setembro", "xlsx", new Date("2026-09-30T12:00:00"))).toBe("pedidos-de-compra-setembro-2026-09-30.xlsx");
  });
});

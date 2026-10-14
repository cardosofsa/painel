import { describe, expect, it } from "vitest";
import { dadosDaCopia, type CampoCopiavel } from "./produto-copia";

const base = (extra: Partial<CampoCopiavel & { custo_base: number; insumos: unknown[] }> = {}) => ({
  nome: "Fita Anti-Furo",
  sku: "FITA-BIKE",
  codigo_barras: "7891234567890",
  estoque: 36,
  saida_media_semanal: 4,
  grupo_id: null as string | null,
  variante_nome: null as string | null,
  custo_base: 10.5,
  insumos: [{ id: "i1", nome: "Caixa", quantidade: 1, custoUnitario: 2 }],
  ...extra,
});

describe("duplicar produto", () => {
  it("sugere nome e SKU novos e zera código de barras, estoque e saída média", () => {
    const c = dadosDaCopia(base());
    expect(c).toMatchObject({ nome: "Fita Anti-Furo (cópia)", sku: "FITA-BIKE-COPIA", codigo_barras: null, estoque: 0, saida_media_semanal: 0 });
  });
  it("mantém o que descreve o produto (custo e composição)", () => {
    const c = dadosDaCopia(base());
    expect(c.custo_base).toBe(10.5);
    expect(c.insumos).toHaveLength(1);
  });
  it("não mexe no original", () => {
    const o = base();
    dadosDaCopia(o);
    expect(o).toMatchObject({ nome: "Fita Anti-Furo", sku: "FITA-BIKE", estoque: 36, codigo_barras: "7891234567890" });
  });
  it("variante de grupo ganha rótulo próprio e mantém o grupo", () => {
    const c = dadosDaCopia(base({ grupo_id: "g1", variante_nome: "Azul" }));
    expect(c.grupo_id).toBe("g1");
    expect(c.variante_nome).toBe("Azul (cópia)");
  });
  it("sem grupo ou sem variante, a variante fica como estava", () => {
    expect(dadosDaCopia(base({ variante_nome: "Azul" })).variante_nome).toBe("Azul");
    expect(dadosDaCopia(base({ grupo_id: "g1", variante_nome: " " })).variante_nome).toBe(" ");
    expect(dadosDaCopia(base()).variante_nome).toBeNull();
  });
  it("tira espaços das pontas antes de sufixar", () => {
    expect(dadosDaCopia(base({ nome: "  X  ", sku: " S1 " }))).toMatchObject({ nome: "X (cópia)", sku: "S1-COPIA" });
  });
});

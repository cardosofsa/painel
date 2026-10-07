import { describe, expect, it } from "vitest";
import { paginaDoEstoque, saldosDerivados } from "./estoque-lista";

const A = "armazem-a";
const B = "armazem-b";

const produtos = [
  { id: "p1", custo: 2, estoque: 10, estoque_minimo: 2 },
  { id: "p2", custo: 1.1, estoque: 3, estoque_minimo: 5 },
  { id: "p3", custo: 5, estoque: 0, estoque_minimo: 1 },
  { id: "p4", custo: 0.1, estoque: 7, estoque_minimo: 1 },
];

const saldos = [
  { produto_id: "p1", armazem_id: A, quantidade: 6 },
  { produto_id: "p1", armazem_id: B, quantidade: 4 },
  { produto_id: "p2", armazem_id: A, quantidade: 3 },
  { produto_id: "p3", armazem_id: A, quantidade: 0 },
  { produto_id: "p4", armazem_id: B, quantidade: 7 },
];

const semFiltro = { pagina: 1, armazem: "", situacao: "" as const };

describe("paginaDoEstoque", () => {
  it("lista só quem tem saldo, com totais por armazém", () => {
    const r = paginaDoEstoque(produtos, saldos, semFiltro, null);
    expect(r.total).toBe(3);
    expect(r.produtos.map((p) => p.id)).toEqual(["p1", "p2", "p4"]);
    expect(r.porArmazem[A]).toEqual({ unidades: 9, produtos: 2, valor: 15.3 });
    expect(r.porArmazem[B]).toEqual({ unidades: 11, produtos: 2, valor: 8.7 });
    expect(r.saldos).toHaveLength(4);
  });

  it("filtra por armazém, situação e busca", () => {
    expect(paginaDoEstoque(produtos, saldos, { ...semFiltro, armazem: B }, null).produtos.map((p) => p.id)).toEqual(["p1", "p4"]);
    expect(paginaDoEstoque(produtos, saldos, { ...semFiltro, situacao: "repor" }, null).produtos.map((p) => p.id)).toEqual(["p2"]);
    expect(paginaDoEstoque(produtos, saldos, { ...semFiltro, situacao: "ok" }, null).produtos.map((p) => p.id)).toEqual(["p1", "p4"]);
    expect(paginaDoEstoque(produtos, saldos, semFiltro, new Set(["p4", "p3"])).produtos.map((p) => p.id)).toEqual(["p4"]);
  });

  it("o total do armazém é de todas as páginas; a página traz só os saldos dela", () => {
    const r = paginaDoEstoque(produtos, saldos, { ...semFiltro, pagina: 2 }, null, 2);
    expect(r.pagina).toBe(2);
    expect(r.produtos.map((p) => p.id)).toEqual(["p4"]);
    expect(r.saldos).toEqual([{ produto_id: "p4", armazem_id: B, quantidade: 7 }]);
    expect(r.porArmazem[B].produtos).toBe(2);
  });

  it("página além do fim cai na última", () => {
    const r = paginaDoEstoque(produtos, saldos, { ...semFiltro, pagina: 9 }, null, 2);
    expect(r.pagina).toBe(2);
    expect(paginaDoEstoque([], [], semFiltro, null).pagina).toBe(1);
  });
});

describe("saldosDerivados", () => {
  it("sem a 0041, cada produto conta inteiro no armazém dele", () => {
    expect(
      saldosDerivados([
        { id: "p1", custo: 1, estoque: 5, estoque_minimo: 0, armazem_id: A },
        { id: "p2", custo: 1, estoque: 0, estoque_minimo: 0, armazem_id: A },
        { id: "p3", custo: 1, estoque: 2, estoque_minimo: 0, armazem_id: null },
      ]),
    ).toEqual([{ produto_id: "p1", armazem_id: A, quantidade: 5 }]);
  });
});

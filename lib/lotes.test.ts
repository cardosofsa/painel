import { describe, expect, it } from "vitest";
import { buscarEmLotes, emPedacos } from "./lotes";

/** Tabela falsa com `n` linhas e um `max-rows` que corta cada resposta. */
function tabela(n: number, maxRows = Infinity, comCount = true) {
  const linhas = Array.from({ length: n }, (_, i) => i);
  const pedidos: [number, number][] = [];
  const montar = async (de: number, ate: number) => {
    pedidos.push([de, ate]);
    const fim = Math.min(ate + 1, de + maxRows);
    return { data: linhas.slice(de, fim), error: null, count: comCount ? n : null };
  };
  return { montar, pedidos };
}

describe("buscarEmLotes", () => {
  it("lê tudo, em lotes, até o total", async () => {
    const t = tabela(2500);
    const r = await buscarEmLotes(t.montar);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(2500);
    expect(r.data[2499]).toBe(2499);
    expect(t.pedidos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("não perde linhas quando o max-rows é menor que o lote", async () => {
    const t = tabela(1200, 500);
    const r = await buscarEmLotes(t.montar);
    expect(r.data).toHaveLength(1200);
    expect(new Set(r.data).size).toBe(1200);
  });

  it("sem count, para no primeiro lote incompleto", async () => {
    const t = tabela(1500, Infinity, false);
    const r = await buscarEmLotes(t.montar);
    expect(r.data).toHaveLength(1500);
    expect(t.pedidos).toHaveLength(2);
  });

  it("tabela vazia faz uma consulta só", async () => {
    const t = tabela(0);
    const r = await buscarEmLotes(t.montar);
    expect(r.data).toEqual([]);
    expect(t.pedidos).toHaveLength(1);
  });

  it("devolve o erro do lote que falhou", async () => {
    let chamadas = 0;
    const r = await buscarEmLotes(async () => {
      chamadas++;
      return chamadas === 1 ? { data: Array(1000).fill(0), error: null, count: 3000 } : { data: null, error: { message: "falhou", code: "500" } };
    });
    expect(r.error?.message).toBe("falhou");
    expect(r.data).toHaveLength(1000);
  });

  it("respeita o máximo", async () => {
    const t = tabela(5000);
    const r = await buscarEmLotes(t.montar, { maximo: 1500 });
    expect(r.data).toHaveLength(1500);
  });
});

describe("emPedacos", () => {
  it("divide a lista no tamanho pedido", () => {
    expect(emPedacos([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(emPedacos([], 2)).toEqual([]);
  });
});

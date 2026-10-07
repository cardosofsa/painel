import { describe, expect, it } from "vitest";
import { mapComLimite } from "./concorrencia";

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("mapComLimite", () => {
  it("devolve na ordem dos itens, mesmo quando terminam fora de ordem", async () => {
    const r = await mapComLimite([30, 5, 20, 1, 10], 3, async (ms, i) => {
      await espera(ms);
      return `${i}:${ms}`;
    });
    expect(r).toEqual([
      { status: "fulfilled", value: "0:30" },
      { status: "fulfilled", value: "1:5" },
      { status: "fulfilled", value: "2:20" },
      { status: "fulfilled", value: "3:1" },
      { status: "fulfilled", value: "4:10" },
    ]);
  });

  it("nunca passa do limite de chamadas ao mesmo tempo", async () => {
    let ativos = 0;
    let pico = 0;
    const r = await mapComLimite(Array.from({ length: 17 }, (_, i) => i), 5, async (n) => {
      ativos++;
      pico = Math.max(pico, ativos);
      await espera(2 + (n % 4));
      ativos--;
      return n * 2;
    });
    expect(pico).toBe(5);
    expect(r.map((x) => (x.status === "fulfilled" ? x.value : null))).toEqual(Array.from({ length: 17 }, (_, i) => i * 2));
  });

  it("isola a falha de um item, como allSettled (inclusive exceção síncrona)", async () => {
    const r = await mapComLimite(["a", "b", "c", "d"], 2, (x) => {
      if (x === "b") throw new Error("síncrono");
      if (x === "c") return Promise.reject(new Error("assíncrono"));
      return Promise.resolve(x.toUpperCase());
    });
    expect(r[0]).toEqual({ status: "fulfilled", value: "A" });
    expect(r[1].status).toBe("rejected");
    expect((r[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(((r[1] as PromiseRejectedResult).reason as Error).message).toBe("síncrono");
    expect(((r[2] as PromiseRejectedResult).reason as Error).message).toBe("assíncrono");
    expect(r[3]).toEqual({ status: "fulfilled", value: "D" });
  });

  it("lista vazia não chama nada", async () => {
    let chamadas = 0;
    const r = await mapComLimite([], 5, async () => chamadas++);
    expect(r).toEqual([]);
    expect(chamadas).toBe(0);
  });

  it("limite inválido vira 1 (zero, negativo, fração) e infinito vira todos de uma vez", async () => {
    for (const limite of [0, -3, 0.4]) {
      let ativos = 0;
      let pico = 0;
      await mapComLimite([1, 2, 3], limite, async () => {
        ativos++;
        pico = Math.max(pico, ativos);
        await espera(1);
        ativos--;
      });
      expect(pico).toBe(1);
    }
    let ativos = 0;
    let pico = 0;
    await mapComLimite([1, 2, 3, 4], Number.POSITIVE_INFINITY, async () => {
      ativos++;
      pico = Math.max(pico, ativos);
      await espera(1);
      ativos--;
    });
    expect(pico).toBe(4);
  });

  it("chama cada item uma única vez", async () => {
    const vistos: number[] = [];
    await mapComLimite([10, 20, 30, 40, 50, 60], 4, async (n) => {
      vistos.push(n);
      await espera(1);
    });
    expect(vistos.sort((a, b) => a - b)).toEqual([10, 20, 30, 40, 50, 60]);
  });
});

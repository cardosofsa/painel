import { describe, expect, it } from "vitest";
import { lerCorpoLimitado } from "./corpo-limitado";

/** Requisição com corpo em pedaços (sem content-length), como um envio em stream. */
function emPedacos(pedacos: string[], aoLer?: (n: number) => void): Request {
  let i = 0;
  const corpo = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i >= pedacos.length) return c.close();
      aoLer?.(i);
      c.enqueue(new TextEncoder().encode(pedacos[i++]));
    },
  });
  return new Request("http://x/api", { method: "POST", body: corpo, duplex: "half" } as RequestInit);
}

describe("lerCorpoLimitado", () => {
  it("lê o corpo dentro do teto, com acento", async () => {
    expect(await lerCorpoLimitado(new Request("http://x", { method: "POST", body: '{"nome":"Ação"}' }), 100)).toEqual({ ok: true, texto: '{"nome":"Ação"}' });
  });

  it("recusa pelo content-length sem ler nada", async () => {
    const r = new Request("http://x", { method: "POST", body: "x".repeat(10), headers: { "content-length": "999999" } });
    expect(await lerCorpoLimitado(r, 100)).toEqual({ ok: false, motivo: "grande" });
  });

  it("sem content-length, para de ler assim que passa do teto", async () => {
    const lidos: number[] = [];
    const r = await lerCorpoLimitado(emPedacos(["a".repeat(60), "b".repeat(60), "c".repeat(60), "d".repeat(60)], (n) => lidos.push(n)), 100);
    expect(r).toEqual({ ok: false, motivo: "grande" });
    // Leu o 1º e o 2º pedaço (passou do teto) e cancelou: o 3º e o 4º nunca foram puxados.
    expect(Math.max(...lidos)).toBeLessThan(3);
  });

  it("conta bytes, não caracteres: acentos ocupam 2 bytes", async () => {
    const r = new Request("http://x", { method: "POST", body: "é".repeat(60) });
    expect(await lerCorpoLimitado(r, 100)).toEqual({ ok: false, motivo: "grande" });
    expect(await lerCorpoLimitado(new Request("http://x", { method: "POST", body: "é".repeat(50) }), 100)).toEqual({ ok: true, texto: "é".repeat(50) });
  });

  it("sem corpo vira texto vazio", async () => {
    expect(await lerCorpoLimitado(new Request("http://x", { method: "POST" }), 100)).toEqual({ ok: true, texto: "" });
  });
});

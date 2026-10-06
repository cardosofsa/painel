import { describe, expect, it } from "vitest";
import { listaRecompra, situacaoRecompra, type HistoricoCliente } from "./recompra";

const h = (o: Partial<HistoricoCliente>): HistoricoCliente => ({ cliente_id: "c", nome: "Ana", whatsapp: "75999990000", compras: 3, primeira: "2026-07-01", ultima: "2026-08-30", ...o });

describe("recompra", () => {
  it("compra a cada 30 dias: com 35 sem comprar está na hora", () => {
    // 3 compras de 01/07 a 30/08 → ritmo de 30 dias.
    expect(situacaoRecompra(h({}), "2026-10-04")).toMatchObject({ situacao: "na_hora", diasSemComprar: 35, ritmo: 30 });
  });

  it("antes do ritmo não aparece", () => {
    expect(situacaoRecompra(h({}), "2026-09-20")).toBeNull();
  });

  it("passou do dobro do ritmo (e de 45 dias): sumido", () => {
    expect(situacaoRecompra(h({}), "2026-11-05")?.situacao).toBe("sumido");
  });

  it("comprador frequente (a cada 5 dias) não vira sumido antes de 45 dias", () => {
    const f = h({ compras: 5, primeira: "2026-09-01", ultima: "2026-09-21" });
    expect(situacaoRecompra(f, "2026-10-20")?.situacao).toBe("na_hora");
    expect(situacaoRecompra(f, "2026-11-10")?.situacao).toBe("sumido");
  });

  it("uma compra só: sumido depois de 60 dias", () => {
    expect(situacaoRecompra(h({ compras: 1, primeira: "2026-08-01", ultima: "2026-08-01" }), "2026-09-20")).toBeNull();
    expect(situacaoRecompra(h({ compras: 1, primeira: "2026-08-01", ultima: "2026-08-01" }), "2026-10-01")?.situacao).toBe("sumido");
  });

  it("lista: só com WhatsApp, 'na hora' primeiro", () => {
    const l = listaRecompra(
      [
        h({ cliente_id: "sumido", compras: 1, primeira: "2026-01-01", ultima: "2026-01-01" }),
        h({ cliente_id: "na-hora" }),
        h({ cliente_id: "sem-zap", whatsapp: null }),
      ],
      "2026-10-04",
    );
    expect(l.map((c) => c.cliente_id)).toEqual(["na-hora", "sumido"]);
  });
});

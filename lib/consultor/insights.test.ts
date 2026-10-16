import { describe, expect, it } from "vitest";
import type { PedidoRanking } from "@/lib/marketplace/ranking-anuncios";
import { analisarDesempenho, faixasDePreco, gastoNaJanela, type GastoAds } from "./insights";

const INI = new Date("2026-10-01T00:00:00Z");
const FIM = new Date("2026-10-30T23:59:59Z");
const I_ISO = "2026-10-01";
const F_ISO = "2026-10-30";

function ped(sku: string, qtd: number, preco: number, lucro: number, extra: Partial<PedidoRanking> = {}, data = "2026-10-10T12:00:00Z", produto = `prod-${sku}`, variacao: string | null = null): PedidoRanking {
  return {
    loja_id: "L1",
    status: "concluido",
    criado_em_plataforma: data,
    lucro,
    custo_incompleto: false,
    itens: [{ produto_id: produto, sku_principal: sku, nome: sku, variacao, quantidade: qtd, preco_unitario: preco }],
    ...extra,
  };
}
const muitos = (n: number, f: () => PedidoRanking) => Array.from({ length: n }, f);
const analisar = (p: PedidoRanking[], ads: GastoAds[] = []) => analisarDesempenho(p, [], ads, 30, INI, FIM, I_ISO, F_ISO);
const achar = (r: ReturnType<typeof analisar>, nome: string) => r.linhas.find((l) => l.nome === nome)!;

describe("gastoNaJanela", () => {
  it("reparte o gasto pelos dias que caem na janela", () => {
    const g: GastoAds = { loja_id: null, periodo_inicio: "2026-09-21", periodo_fim: "2026-10-10", produto_id: null, valor: 200 };
    expect(gastoNaJanela(g, I_ISO, F_ISO)).toBeCloseTo(100); // 10 dos 20 dias
  });
  it("zero quando não há sobreposição", () => {
    expect(gastoNaJanela({ loja_id: null, periodo_inicio: "2026-08-01", periodo_fim: "2026-08-31", produto_id: null, valor: 50 }, I_ISO, F_ISO)).toBe(0);
  });
});

describe("analisarDesempenho — vereditos", () => {
  it("poucos pedidos viram 'ainda cedo', nunca conclusão", () => {
    const r = analisar([ped("A", 1, 50, -5), ped("A", 1, 50, -5)]);
    expect(achar(r, "A").veredito).toBe("ainda_cedo");
  });

  it("campeão com boa margem, amostra sólida e sem problema é 'replicar'", () => {
    const r = analisar(muitos(6, () => ped("A", 2, 50, 20)));
    const a = achar(r, "A");
    expect(a.veredito).toBe("replicar");
    expect(a.motivos.join(" ")).toContain("classe A");
  });

  it("margem baixa com amostra sólida é 'não vale a pena'", () => {
    const r = analisar(muitos(6, () => ped("B", 1, 100, 2)));
    expect(achar(r, "B").veredito).toBe("nao_vale");
  });

  it("lucro positivo que vira prejuízo depois do Ads é 'não vale a pena'", () => {
    const ads: GastoAds[] = [{ loja_id: "L1", periodo_inicio: I_ISO, periodo_fim: F_ISO, produto_id: "prod-C", valor: 200 }];
    const r = analisar(muitos(4, () => ped("C", 1, 100, 20)), ads);
    const c = achar(r, "C");
    expect(c.gastoAds).toBe(200);
    expect(c.lucroAposAds).toBe(-120);
    expect(c.veredito).toBe("nao_vale");
  });

  it("muita devolução com amostra sólida é 'não vale a pena'", () => {
    const p = [...muitos(6, () => ped("D", 1, 100, 30)), ...muitos(3, () => ped("D", 1, 100, 0, { status: "devolvido" }))];
    expect(achar(analisar(p), "D").veredito).toBe("nao_vale");
  });

  it("queda forte vs. período anterior pede atenção", () => {
    const anterior = muitos(8, () => ped("E", 1, 100, 30, {}, "2026-09-10T12:00:00Z"));
    const atual = muitos(4, () => ped("E", 1, 100, 30));
    const e = achar(analisar([...anterior, ...atual]), "E");
    expect(e.veredito).toBe("atencao");
    expect(e.tendencia).toBeCloseTo(-0.5);
  });

  it("anúncio sem venda é 'parado'", () => {
    const r = analisarDesempenho([], [{ loja_id: "L1", sku_principal: "Z", nome_item: "Zeta", nome: "Zeta", imagem_url: null, link: null }], [], 30, INI, FIM, I_ISO, F_ISO);
    expect(r.linhas[0].veredito).toBe("parado");
  });
});

describe("analisarDesempenho — Ads, variações e amostra", () => {
  it("Ads sem produto ligado fica de fora dos anúncios e aparece à parte", () => {
    const ads: GastoAds[] = [{ loja_id: "L1", periodo_inicio: I_ISO, periodo_fim: F_ISO, produto_id: null, valor: 80 }];
    const r = analisar(muitos(6, () => ped("A", 1, 100, 30)), ads);
    expect(r.adsSemAnuncio).toBe(80);
    expect(r.adsTotal).toBe(80);
    expect(achar(r, "A").gastoAds).toBe(0);
  });

  it("aponta a variação campeã do anúncio", () => {
    const p = [...muitos(4, () => ped("F", 1, 50, 15, {}, undefined, "p1", "Azul")), ped("F", 1, 50, 15, {}, undefined, "p2", "Verde")];
    const f = achar(analisar(p), "F");
    expect(f.campea).toMatchObject({ nome: "Azul", unidades: 4 });
    expect(f.campea!.participacao).toBeCloseTo(0.8);
  });

  it("período com poucos pedidos marca amostra fraca", () => {
    expect(analisar([ped("A", 1, 50, 10)]).amostraFraca).toBe(true);
    expect(analisar(muitos(12, () => ped("A", 1, 50, 10))).amostraFraca).toBe(false);
  });
});

describe("faixasDePreco", () => {
  it("sem unidades suficientes devolve null", () => {
    expect(faixasDePreco(muitos(5, () => ped("A", 1, 50, 10)), INI, FIM)).toBeNull();
  });
  it("divide as unidades em quartis e soma o lucro", () => {
    const p = [10, 20, 30, 40].flatMap((preco) => muitos(6, () => ped(`S${preco}`, 1, preco, preco * 0.2)));
    const faixas = faixasDePreco(p, INI, FIM)!;
    expect(faixas).toHaveLength(4);
    expect(faixas.map((f) => f.unidades)).toEqual([6, 6, 6, 6]);
    expect(faixas[0]).toMatchObject({ de: 10, ate: 10 });
    expect(faixas[3].lucro).toBeCloseTo(6 * 40 * 0.2);
    expect(faixas[0].margem).toBeCloseTo(0.2);
  });
});

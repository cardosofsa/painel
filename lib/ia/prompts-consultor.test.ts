import { describe, expect, it } from "vitest";
import { analisarDesempenho } from "@/lib/consultor/insights";
import type { PedidoRanking } from "@/lib/marketplace/ranking-anuncios";
import {
  hashContextoConsultor,
  interpretarConsultor,
  montarContextoConsultor,
  montarPromptConsultor,
  narracaoVazia,
  nomesDoContexto,
  type ContextoConsultorIA,
} from "./prompts-consultor";

const INI = new Date("2026-10-01T00:00:00Z");
const FIM = new Date("2026-10-30T23:59:59Z");
const ped = (sku: string, qtd: number, preco: number, lucro: number, extra: Partial<PedidoRanking> = {}): PedidoRanking => ({
  loja_id: "L1",
  status: "concluido",
  criado_em_plataforma: "2026-10-10T12:00:00Z",
  lucro,
  custo_incompleto: false,
  itens: [{ produto_id: `p-${sku}`, sku_principal: sku, nome: sku, variacao: null, quantidade: qtd, preco_unitario: preco }],
  ...extra,
});
const muitos = (n: number, f: () => PedidoRanking) => Array.from({ length: n }, f);

function contexto(): ContextoConsultorIA {
  const r = analisarDesempenho([...muitos(6, () => ped("Kit Bom", 2, 50, 20)), ...muitos(6, () => ped("Kit Ruim", 1, 100, 2))], [], [], 30, INI, FIM, "2026-10-01", "2026-10-30");
  return montarContextoConsultor(r);
}

describe("montarContextoConsultor", () => {
  it("separa os anúncios por veredito e arredonda os números", () => {
    const ctx = contexto();
    expect(ctx.anuncios.find((a) => a.nome === "Kit Bom")).toMatchObject({ veredito: "replicar", pedidos: 6, margemPct: 20 });
    expect(ctx.anuncios.find((a) => a.nome === "Kit Ruim")?.veredito).toBe("nao_vale");
    expect(nomesDoContexto(ctx).sort()).toEqual(["Kit Bom", "Kit Ruim"]);
  });
  it("não leva anúncios 'ainda cedo' para o prompt", () => {
    const r = analisarDesempenho([ped("Pouco", 1, 50, 10)], [], [], 30, INI, FIM, "2026-10-01", "2026-10-30");
    expect(montarContextoConsultor(r).anuncios).toEqual([]);
  });
});

describe("montarPromptConsultor", () => {
  it("traz os números e proíbe inventar", () => {
    const p = montarPromptConsultor(contexto());
    expect(p).toContain('"Kit Bom"');
    expect(p).toContain("VALE REPLICAR");
    expect(p).toContain("NÃO VALE A PENA");
    expect(p).toContain("Não invente");
  });
  it("sinaliza amostra fraca", () => {
    const ctx = { ...contexto(), amostraFraca: true };
    expect(montarPromptConsultor(ctx)).toContain("FRACA");
  });
  it("não vaza dado de cliente: só título e números agregados", () => {
    const p = montarPromptConsultor(contexto());
    expect(p).not.toMatch(/comprador|cpf|whatsapp|@/i);
  });
});

describe("interpretarConsultor", () => {
  const nomes = ["Kit Bom", "Kit Ruim"];
  const resp = {
    resumo: "Bom mês.",
    replicar: [{ anuncio: "kit bom", acao: "Criar kit com 3 unidades", motivo: "Margem de 20%." }],
    atencao: [],
    evitar: [{ anuncio: "Kit Ruim", acao: "Rever o custo", motivo: "Margem de 2%." }],
    oportunidades: [{ baseado_em: "Kit Bom", ideia: "Variação maior", motivo: "Campeã." }],
    precos: "Faixa do meio rende mais.",
  };

  it("normaliza o nome para o fornecido e mantém o conteúdo", () => {
    const n = interpretarConsultor(JSON.stringify(resp), nomes);
    expect(n.replicar[0].anuncio).toBe("Kit Bom");
    expect(n.evitar[0]).toMatchObject({ anuncio: "Kit Ruim", acao: "Rever o custo" });
    expect(n.oportunidades[0].baseadoEm).toBe("Kit Bom");
  });

  it("descarta anúncio inventado pela IA", () => {
    const n = interpretarConsultor(JSON.stringify({ ...resp, replicar: [{ anuncio: "Anúncio Fantasma", acao: "Fazer", motivo: "x" }], oportunidades: [{ baseado_em: "Outro", ideia: "i", motivo: "m" }] }), nomes);
    expect(n.replicar).toEqual([]);
    expect(n.oportunidades).toEqual([]);
  });

  it("respeita limites de quantidade e tamanho", () => {
    const muitas = Array.from({ length: 9 }, () => ({ anuncio: "Kit Bom", acao: "a".repeat(400), motivo: "m" }));
    const n = interpretarConsultor(JSON.stringify({ ...resp, replicar: muitas }), nomes);
    expect(n.replicar).toHaveLength(4);
    expect(n.replicar[0].acao.length).toBeLessThanOrEqual(110);
  });

  it("lixo ou JSON quebrado vira narração vazia, sem lançar", () => {
    expect(narracaoVazia(interpretarConsultor("isto não é json", nomes))).toBe(true);
    expect(narracaoVazia(interpretarConsultor("[]", nomes))).toBe(true);
    expect(narracaoVazia(interpretarConsultor(JSON.stringify(resp), nomes))).toBe(false);
  });

  it("aceita resposta dentro de cerca markdown", () => {
    expect(interpretarConsultor("```json\n" + JSON.stringify(resp) + "\n```", nomes).resumo).toBe("Bom mês.");
  });
});

describe("hashContextoConsultor", () => {
  it("é estável para o mesmo contexto e muda quando o número muda", () => {
    const a = contexto();
    expect(hashContextoConsultor(a)).toBe(hashContextoConsultor(contexto()));
    const b = { ...a, anuncios: a.anuncios.map((x, i) => (i === 0 ? { ...x, receita: x.receita + 500 } : x)) };
    expect(hashContextoConsultor(b)).not.toBe(hashContextoConsultor(a));
  });
  it("ignora variação de poeira (centavos)", () => {
    const a = contexto();
    const b = { ...a, anuncios: a.anuncios.map((x) => ({ ...x, receita: x.receita + 0.2 })) };
    expect(hashContextoConsultor(b)).toBe(hashContextoConsultor(a));
  });
});

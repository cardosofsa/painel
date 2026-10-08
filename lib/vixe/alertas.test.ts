import { describe, expect, it } from "vitest";
import { situacaoRepasse } from "@/lib/marketplace/relatorios-financeiros";
import {
  alertasContasVencidas,
  alertasEstoqueMinimo,
  alertasMargem,
  alertasRuptura,
  alertaReposicaoEmLote,
  alertasPrecoDefasado,
  alertasRepasses,
  alertasZonaMorta,
  diasEntre,
  resumirRepasses,
  mensagemCobranca,
  ordenarAlertas,
  type AlertaVixe,
} from "./alertas";

describe("ordenarAlertas", () => {
  it("mais grave primeiro, estável dentro da mesma gravidade", () => {
    const a = (id: string, gravidade: AlertaVixe["gravidade"]): AlertaVixe => ({ id, gravidade, categoria: "estoque", titulo: id, detalhe: "", acoes: [] });
    const r = ordenarAlertas([a("b1", "baixa"), a("m1", "media"), a("a1", "alta"), a("m2", "media"), a("a2", "alta")]);
    expect(r.map((x) => x.id)).toEqual(["a1", "a2", "m1", "m2", "b1"]);
  });
});

describe("estoque", () => {
  it("estoque mínimo oferece pedido de compra e ignorar", () => {
    const [al] = alertasEstoqueMinimo([{ id: "x", mensagem: "Camiseta: 2 (mínimo 10)", produto_id: "p1" }]);
    expect(al.gravidade).toBe("alta");
    expect(al.acoes).toEqual([
      { tipo: "link", rotulo: "Criar pedido de compra", href: "/compras?novo=p1" },
      { tipo: "marcar_lido", rotulo: "Ignorar", alertaId: "x" },
    ]);
  });

  it("ruptura não duplica produto que já está no estoque mínimo e gradua pelos dias", () => {
    const base = { produtoNome: "A", estoqueAtual: 3, mediaSaidaDiaria: 1 };
    const r = alertasRuptura(
      [
        { ...base, produtoId: "p1", diasRestantes: 3 },
        { ...base, produtoId: "p2", diasRestantes: 2.4 },
        { ...base, produtoId: "p3", diasRestantes: 10 },
      ],
      new Set(["p1"]),
    );
    expect(r.map((x) => x.id)).toEqual(["ruptura-p2", "ruptura-p3"]);
    expect(r[0].gravidade).toBe("alta");
    expect(r[0].titulo).toContain("~2 dias");
    expect(r[1].gravidade).toBe("media");
  });
});

describe("margem", () => {
  it("aumento forte de custo é alta", () => {
    const [m] = alertasMargem([{ produtoId: "p", produtoNome: "Óleo", custoPrecificado: 10, custoRecente: 12, aumentoPct: 20 }]);
    expect(m.gravidade).toBe("alta");
    expect(m.titulo).toContain("20%");
    expect(m.acoes[0]).toMatchObject({ tipo: "link", href: "/precificacao" });
  });
});

describe("contas e fiado", () => {
  it("diasEntre conta dias de calendário, sem fuso", () => {
    expect(diasEntre("2026-09-28", "2026-09-30")).toBe(2);
    expect(diasEntre("2026-02-28", "2026-03-01")).toBe(1);
    expect(diasEntre("2026-09-30", "2026-09-30")).toBe(0);
  });

  it("só entra o que já venceu (pagar que vence hoje vira aviso); mais atrasado primeiro", () => {
    const r = alertasContasVencidas(
      [
        { id: "1", tipo: "receber", descricao: "A", valor: 10, vencimento: "2026-09-29" },
        { id: "2", tipo: "pagar", descricao: "B", valor: 20, vencimento: "2026-09-30" },
        { id: "3", tipo: "receber", descricao: "C", valor: 30, vencimento: "2026-09-01" },
      ],
      "2026-09-30",
      null,
    );
    expect(r.map((x) => x.id)).toEqual(["conta-3", "conta-1", "avencer-2"]);
    expect(r[0].gravidade).toBe("alta");
    expect(r[1].gravidade).toBe("media");
  });

  it("conta a pagar atrasada é sempre alta (juros)", () => {
    const [c] = alertasContasVencidas([{ id: "p", tipo: "pagar", descricao: "Aluguel", valor: 900, vencimento: "2026-09-29" }], "2026-09-30", null);
    expect(c.gravidade).toBe("alta");
  });

  it("fiado gera cobrança no WhatsApp do cliente com a mensagem pronta", () => {
    const [f] = alertasContasVencidas(
      [{ id: "f", tipo: "fiado", descricao: "Venda #12, parcela 1/3", valor: 50, vencimento: "2026-09-20", clienteNome: "Maria Souza", whatsapp: "(11) 98888-7777" }],
      "2026-09-30",
      "Loja Sertão",
    );
    const zap = f.acoes[0];
    expect(zap.tipo).toBe("externo");
    if (zap.tipo !== "externo") return;
    expect(zap.href).toMatch(/^https:\/\/wa\.me\/5511988887777\?text=/);
    expect(decodeURIComponent(zap.href)).toContain("Olá, Maria!");
    expect(f.titulo).toContain("Maria Souza");
  });

  it("mensagem de cobrança sem nome nem negócio continua educada", () => {
    const t = mensagemCobranca({ clienteNome: null, valor: 25, vencimento: "2026-09-10" }, null);
    expect(t).toMatch(/^Olá! Tudo bem\?/);
    expect(t).toContain("10/09/2026");
  });
});

describe("preço", () => {
  it("zona morta oferece ajustar para o preço melhor", () => {
    const [z] = alertasZonaMorta([
      { produtoId: "p", produtoNome: "Kit", preco: 82, canalNome: "Shopee", zona: { inicio: 80, fim: 88.36, precoMelhor: 79.99, ganhoLiquido: 6.4 } },
    ]);
    expect(z.gravidade).toBe("media");
    expect(z.acoes[0]).toMatchObject({ tipo: "ajustar_preco", produtoId: "p", preco: 79.99 });
  });
});

describe("conta a pagar a vencer", () => {
  it("avisa até 7 dias antes; receber a vencer não vira alerta", () => {
    const itens = [
      { id: "a", tipo: "pagar" as const, descricao: "Pedido MV-1", valor: 50, vencimento: "2026-10-07" },
      { id: "b", tipo: "pagar" as const, descricao: "Pedido MV-2", valor: 50, vencimento: "2026-10-20" },
      { id: "c", tipo: "receber" as const, descricao: "Avulsa", valor: 50, vencimento: "2026-10-07" },
    ];
    const r = alertasContasVencidas(itens, "2026-10-05", null);
    expect(r.map((x) => x.id)).toEqual(["avencer-a"]);
    expect(r[0].titulo).toContain("vence em 2 dias");
  });
});

describe("repasses e preço defasado", () => {
  it("resume só divergentes: repasse nunca vira atrasado", () => {
    const r = resumirRepasses(
      [
        { repasse: 100, repasse_recebido: 100.02 },
        { repasse: 100, repasse_recebido: 40 },
        { repasse: 80, repasse_recebido: null },
        { repasse: 80, repasse_recebido: null },
      ],
      situacaoRepasse,
    );
    expect(r).toEqual({ divergentes: 1, diferenca: 60 });
    const a = alertasRepasses(r);
    expect(a.map((x) => x.id)).toEqual(["repasse-divergente"]);
    expect(a[0].gravidade).toBe("alta");
    expect(a[0].acoes[0]).toMatchObject({ href: "/financeiro?aba=repasses" });
    expect(alertasRepasses({ divergentes: 0, diferenca: 0 })).toEqual([]);
  });

  it("preço defasado leva ao Raio-X; precificação velha é aviso leve", () => {
    const [custo, antiga] = alertasPrecoDefasado([
      { produtoId: "a", produtoNome: "Caneca", custoPrecificado: 10, custoAtual: 12, aumentoPct: 20, dias: 30, motivo: "custo" },
      { produtoId: "b", produtoNome: "Copo", custoPrecificado: 5, custoAtual: 5, aumentoPct: 0, dias: 200, motivo: "antiga" },
    ]);
    expect(custo.gravidade).toBe("alta");
    expect(custo.titulo).toContain("preço defasado");
    expect(custo.acoes[0]).toMatchObject({ href: "/precificacao?visao=raio-x" });
    expect(antiga.gravidade).toBe("baixa");
    expect(antiga.titulo).toContain("200 dias");
  });
});

describe("reposição em lote", () => {
  it("só com 2+ produtos, sem repetir, e com o botão de criar pedidos", () => {
    expect(alertaReposicaoEmLote([{ produtoId: "a", quantidade: 3 }])).toEqual([]);
    const [a] = alertaReposicaoEmLote([
      { produtoId: "a", quantidade: 3 },
      { produtoId: "a", quantidade: 3 },
      { produtoId: "b", quantidade: 5 },
      { produtoId: "c", quantidade: 0 },
    ]);
    expect(a.titulo).toBe("2 produtos para repor");
    expect(a.acoes[0]).toEqual({ tipo: "criar_pedidos", rotulo: "Criar pedidos de compra (2)", itens: [{ produtoId: "a", quantidade: 3 }, { produtoId: "b", quantidade: 5 }] });
  });
});

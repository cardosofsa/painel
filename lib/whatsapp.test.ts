import { describe, expect, it } from "vitest";
import { linkWhatsapp, mensagensPendentes, textoResumoDia, type EntradaMensagens } from "./whatsapp";
import { datasDoAno, pascoa, proximasDatas } from "./calendario-comercial";

describe("WhatsApp semi-automático", () => {
  it("link com DDI do Brasil", () => {
    expect(linkWhatsapp("(75) 99999-8888", "oi")).toBe("https://wa.me/5575999998888?text=oi");
    expect(linkWhatsapp("5575999998888", "a b")).toBe("https://wa.me/5575999998888?text=a%20b");
    expect(linkWhatsapp(null, "x")).toBe("https://wa.me/?text=x");
  });

  const base: EntradaMensagens = {
    loja: "Loja Sertão",
    hoje: "2026-10-02",
    pedidosCatalogo: [{ id: "p1", numero: "P-0005", cliente_nome: "Ana Lima", cliente_whatsapp: "75999998888", total: 50, status: "pendente", criado_em: "2026-10-02T10:00:00Z", venda_id: null }],
    vendas: [
      { id: "v1", numero: "V-0006", cliente: "Bia", whatsapp: "75988887777", total: 40, etapa: "enviado", status: "paga", rastreio: "BR123", logistica: "Correios", data: "2026-10-01T10:00:00Z", doCatalogo: true },
      { id: "v2", numero: "V-0007", cliente: "Caio", whatsapp: "75977776666", total: 30, etapa: "enviar", status: "paga", rastreio: null, logistica: null, data: "2026-10-02T09:00:00Z", doCatalogo: true },
      { id: "v3", numero: "V-0008", cliente: "Sem zap", whatsapp: null, total: 30, etapa: "enviado", status: "paga", rastreio: null, logistica: null, data: "2026-10-02T09:00:00Z", doCatalogo: false },
    ],
    parcelas: [
      { id: "f1", venda_numero: "V-0001", cliente: "Dani", whatsapp: "75966665555", valor: 25, vencimento: "2026-09-28", numero: 1, total_parcelas: 2 },
      { id: "f2", venda_numero: "V-0001", cliente: "Dani", whatsapp: "75966665555", valor: 25, vencimento: "2026-10-28", numero: 2, total_parcelas: 2 },
      { id: "f3", venda_numero: "V-0002", cliente: "Eva", whatsapp: "75955554444", valor: 10, vencimento: "2026-10-03", numero: 1, total_parcelas: 1 },
    ],
  };

  it("monta só o que precisa ir agora e pula o que já foi enviado", () => {
    const r = mensagensPendentes(base, new Set(["pago:v2"]));
    expect(r.map((m) => m.chave).sort()).toEqual(["enviado:v1", "fiado:f1:vencido", "fiado:f3:vence", "pedido:p1"]);
    const enviado = r.find((m) => m.chave === "enviado:v1")!;
    expect(enviado.texto).toContain("Oi, Bia!");
    expect(enviado.texto).toContain("BR123");
    expect(r.find((m) => m.chave === "fiado:f1:vencido")!.texto).toContain("parcela 1/2");
  });

  it("resumo do dia", () => {
    const t = textoResumoDia({ data: "2026-10-02", vendas: 3, faturamento: 150, lucro: 45, parados: [{ etapa: "Para Enviar", n: 2 }, { etapa: "Para Imprimir", n: 0 }], acabando: ["Caneca"], aReceberHoje: 25 }, "Loja");
    expect(t).toContain("Vendas: 3");
    expect(t).toContain("(30%)");
    expect(t).toContain("• Para Enviar: 2");
    expect(t).not.toContain("Para Imprimir");
    expect(t).toContain("• Caneca");
  });
});

describe("calendário comercial", () => {
  it("datas móveis de 2026", () => {
    const d = Object.fromEntries(datasDoAno(2026).map((x) => [x.nome, x.data]));
    expect(pascoa(2026).getDate()).toBe(5);
    expect(d["Páscoa"]).toBe("2026-04-05");
    expect(d["Carnaval"]).toBe("2026-02-17");
    expect(d["Dia das Mães"]).toBe("2026-05-10");
    expect(d["Dia dos Pais"]).toBe("2026-08-09");
    expect(d["Black Friday"]).toBe("2026-11-27");
  });

  it("próximas datas a partir de hoje, com quanto falta e se já é hora de preparar", () => {
    const r = proximasDatas(new Date(2026, 9, 2), 60);
    expect(r.map((x) => x.nome)).toEqual(["10.10 (Shopee/ML)", "Dia das Crianças", "11.11 (Shopee/ML)", "Black Friday", "Cyber Monday"]);
    expect(r[1]).toMatchObject({ faltam: 10, preparar: true });
    expect(r.find((x) => x.nome === "Black Friday")).toMatchObject({ faltam: 56, preparar: false });
  });
});

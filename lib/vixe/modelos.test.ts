import { describe, expect, it } from "vitest";
import { aplicarModelo, ASSUNTOS_MODELO, MODELOS, modeloDe, previaModelo, variaveisDesconhecidas } from "./modelos";
import { mensagensPendentes, textoEnviado, textoFiado, textoPagamentoConfirmado, textoPedidoRecebido, type EntradaMensagens } from "../whatsapp";

describe("aplicarModelo", () => {
  it("troca as variáveis e some com as vazias sem deixar espaço sobrando", () => {
    expect(aplicarModelo("Oi {cliente}, seu pedido {pedido}{rastreio}.", { cliente: "Ana", pedido: "V-1", rastreio: "" })).toBe("Oi Ana, seu pedido V-1.");
    expect(aplicarModelo("A  {x}  b !", { x: "" })).toBe("A b!");
  });

  it("variável desconhecida fica como foi escrita (aparece na prévia)", () => {
    expect(aplicarModelo("Oi {nome}", { cliente: "Ana" })).toBe("Oi {nome}");
    expect(variaveisDesconhecidas("pedido", "Oi {nome} {cliente}")).toEqual(["nome"]);
  });

  it("mantém as quebras de linha do Pix", () => {
    expect(aplicarModelo("Vence hoje.{pix}", { pix: "\n\nPix:\n0002" })).toBe("Vence hoje.\n\nPix:\n0002");
  });

  it("todo padrão só usa variáveis do próprio modelo e a prévia não deixa chave sobrando", () => {
    for (const a of ASSUNTOS_MODELO) {
      expect(variaveisDesconhecidas(a, MODELOS[a].padrao)).toEqual([]);
      expect(previaModelo(a, MODELOS[a].padrao)).not.toMatch(/\{\w+\}/);
    }
  });

  it("modelo da conta vale; em branco volta ao padrão", () => {
    expect(modeloDe("pedido", { pedido: "Meu texto" })).toBe("Meu texto");
    expect(modeloDe("pedido", { pedido: "   " })).toBe(MODELOS.pedido.padrao);
    expect(modeloDe("pedido", null)).toBe(MODELOS.pedido.padrao);
  });
});

describe("padrões = textos que o sistema já mandava", () => {
  const base: EntradaMensagens = {
    loja: "Loja Sertão",
    hoje: "2026-10-02",
    pedidosCatalogo: [{ id: "p1", numero: "P-5", cliente_nome: "Ana Lima", cliente_whatsapp: "75999998888", total: 50, status: "pendente", criado_em: "2026-10-02T10:00:00Z", venda_id: null }],
    vendas: [
      { id: "v1", numero: "V-6", cliente: "Bia", whatsapp: "75988887777", total: 40, etapa: "enviado", status: "paga", rastreio: "BR1", logistica: "Correios", data: "2026-10-01T10:00:00Z", doCatalogo: true },
      { id: "v2", numero: "V-7", cliente: "Caio", whatsapp: "75977776666", total: 30, etapa: "enviado", status: "paga", rastreio: null, logistica: null, data: "2026-10-01T10:00:00Z", doCatalogo: true },
      { id: "v3", numero: "V-8", cliente: "Duda", whatsapp: "75966667777", total: 30, etapa: "enviar", status: "paga", rastreio: null, logistica: null, data: "2026-10-01T10:00:00Z", doCatalogo: true },
    ],
    parcelas: [
      { id: "f1", venda_numero: "V-1", cliente: "Dani", whatsapp: "75966665555", valor: 25, vencimento: "2026-09-28", numero: 1, total_parcelas: 2 },
      { id: "f3", venda_numero: "V-2", cliente: "Eva", whatsapp: "75955554444", valor: 10, vencimento: "2026-10-03", numero: 1, total_parcelas: 1 },
    ],
  };
  const r = mensagensPendentes(base, new Set());
  const t = (chave: string) => r.find((m) => m.chave === chave)!.texto;

  it("pedido, pago e enviado", () => {
    expect(t("pedido:p1")).toBe(textoPedidoRecebido({ nome: "Ana Lima", numero: "P-5", total: 50, loja: "Loja Sertão" }));
    expect(t("pago:v3")).toBe(textoPagamentoConfirmado({ nome: "Duda", numero: "V-8", total: 30, loja: "Loja Sertão" }));
    expect(t("enviado:v1")).toBe(textoEnviado({ nome: "Bia", numero: "V-6", loja: "Loja Sertão", rastreio: "BR1", logistica: "Correios" }));
    expect(t("enviado:v2")).toBe(textoEnviado({ nome: "Caio", numero: "V-7", loja: "Loja Sertão", rastreio: null, logistica: null }));
  });

  it("crediário vencido e vencendo", () => {
    expect(t("fiado:f1:vencido")).toBe(textoFiado({ nome: "Dani", valor: 25, vencimento: "2026-09-28", loja: "Loja Sertão", vencido: true, parcela: "1/2", atualizado: 25 }));
    expect(t("fiado:f3:vence")).toBe(textoFiado({ nome: "Eva", valor: 10, vencimento: "2026-10-03", loja: "Loja Sertão", vencido: false, parcela: null, atualizado: 10 }));
  });

  it("modelo da conta entra no lugar do padrão", () => {
    const m = mensagensPendentes({ ...base, modelos: { fiado_vence: "{cliente}, {parcela} de {valor} vence {vencimento}." } }, new Set());
    expect(m.find((x) => x.chave === "fiado:f3:vence")!.texto).toBe("Eva, o valor de R$ 10,00 vence 03/10/2026.");
  });
});

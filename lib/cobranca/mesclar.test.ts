import { describe, expect, it } from "vitest";
import { decidirEvento, type AssinaturaGravada } from "./mesclar";
import type { EventoCobranca } from "./tipos";

const USER = "6f1c2b9e-3a4d-4e5f-8a7b-9c0d1e2f3a4b";
const OUT = "2026-11-07T23:59:59-03:00";
const NOV = "2026-12-07T23:59:59-03:00";

function ev(e: Partial<EventoCobranca>): EventoCobranca {
  return { userId: USER, planoId: "pro", status: "ativa", periodoFim: OUT, coberturaAte: OUT, provedorRef: "sub_A", ...e };
}
function gravada(a: Partial<AssinaturaGravada>): AssinaturaGravada {
  return { plano_id: "pro", status: "ativa", periodo_fim: OUT, provedor: "asaas", provedor_ref: "sub_A", ...a };
}

describe("decidirEvento", () => {
  it("primeiro pagamento de quem está no teste ativa e limpa o pedido", () => {
    const d = decidirEvento(gravada({ status: "teste", periodo_fim: null, provedor: null, provedor_ref: null }), ev({}), "asaas");
    expect(d).toEqual({
      gravar: true,
      linha: { plano_id: "pro", status: "ativa", periodo_fim: OUT, provedor: "asaas", provedor_ref: "sub_A", plano_solicitado: null, solicitado_em: null },
      cancelarRef: null,
    });
  });

  it("sem linha gravada também ativa", () => {
    expect(decidirEvento(null, ev({}), "asaas")).toMatchObject({ gravar: true, linha: { status: "ativa" } });
  });

  it("evento repetido (CONFIRMED e depois RECEIVED) não grava de novo", () => {
    expect(decidirEvento(gravada({}), ev({}), "asaas")).toMatchObject({ gravar: false });
  });

  it("pagamento antigo chegando depois não encurta o período", () => {
    expect(decidirEvento(gravada({ periodo_fim: NOV }), ev({ periodoFim: OUT }), "asaas")).toMatchObject({ gravar: false });
    // Mesmo saindo de atrasada, mantém o maior período.
    expect(decidirEvento(gravada({ status: "atrasada", periodo_fim: NOV }), ev({ periodoFim: OUT }), "asaas")).toMatchObject({ gravar: true, linha: { periodo_fim: NOV } });
  });

  it("mês seguinte estende", () => {
    expect(decidirEvento(gravada({}), ev({ periodoFim: NOV }), "asaas")).toMatchObject({ gravar: true, linha: { periodo_fim: NOV }, cancelarRef: null });
  });

  it("troca de plano: assinatura nova paga assume e a antiga sai para cancelar", () => {
    const d = decidirEvento(gravada({ plano_id: "essencial", provedor_ref: "sub_A" }), ev({ provedorRef: "sub_B", periodoFim: OUT }), "asaas");
    expect(d).toMatchObject({ gravar: true, linha: { plano_id: "pro", provedor_ref: "sub_B" }, cancelarRef: "sub_A" });
  });

  it("vencida só da assinatura gravada, e só se o período não cobre", () => {
    expect(decidirEvento(gravada({}), ev({ status: "atrasada", periodoFim: null, coberturaAte: NOV }), "asaas")).toMatchObject({
      gravar: true,
      linha: { status: "atrasada", periodo_fim: OUT, plano_id: "pro" },
    });
    // Fatura que já foi paga (período cobre): evento fora de ordem.
    expect(decidirEvento(gravada({ periodo_fim: NOV }), ev({ status: "atrasada", periodoFim: null, coberturaAte: NOV }), "asaas")).toMatchObject({ gravar: false });
    // Primeira fatura nunca paga de quem está no teste: não rebaixa.
    expect(decidirEvento(gravada({ status: "teste", provedor: null, provedor_ref: null }), ev({ status: "atrasada", periodoFim: null }), "asaas")).toMatchObject({ gravar: false });
    // Já atrasada: idempotente.
    expect(decidirEvento(gravada({ status: "atrasada" }), ev({ status: "atrasada", periodoFim: null, coberturaAte: NOV }), "asaas")).toMatchObject({ gravar: false });
  });

  it("cancelada só da assinatura gravada", () => {
    expect(decidirEvento(gravada({}), ev({ status: "cancelada", periodoFim: null, coberturaAte: null }), "asaas")).toMatchObject({ gravar: true, linha: { status: "cancelada", periodo_fim: OUT } });
    expect(decidirEvento(gravada({ provedor_ref: "sub_B" }), ev({ status: "cancelada", periodoFim: null }), "asaas")).toMatchObject({ gravar: false });
    expect(decidirEvento(gravada({ status: "cancelada" }), ev({ status: "cancelada", periodoFim: null }), "asaas")).toMatchObject({ gravar: false });
    expect(decidirEvento(gravada({ provedor: "outro" }), ev({ status: "cancelada", periodoFim: null }), "asaas")).toMatchObject({ gravar: false });
  });

  it("assinatura de outro provedor não é cancelada no Asaas", () => {
    expect(decidirEvento(gravada({ provedor: "manual", provedor_ref: "x" }), ev({}), "asaas")).toMatchObject({ gravar: true, cancelarRef: null });
  });
});

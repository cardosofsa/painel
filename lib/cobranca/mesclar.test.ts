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
      linha: {
        plano_id: "pro",
        status: "ativa",
        periodo_fim: OUT,
        periodo_fim_provedor: OUT,
        provedor: "asaas",
        provedor_ref: "sub_A",
        ultimo_pagamento_ref: null,
        cancelamento_agendado: false,
        plano_solicitado: null,
        solicitado_em: null,
      },
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

  it("troca de plano: fatura da assinatura antiga paga depois não reativa o plano antigo", () => {
    const d = decidirEvento(gravada({ plano_id: "essencial", provedor_ref: "sub_A" }), ev({ provedorRef: "sub_B" }), "asaas");
    expect(d).toMatchObject({ gravar: true, linha: { provedor_refs_encerradas: ["sub_A"] } });
    const depois = gravada({ plano_id: "pro", provedor_ref: "sub_B", provedor_refs_encerradas: ["sub_A"] });
    expect(decidirEvento(depois, ev({ planoId: "essencial", provedorRef: "sub_A", periodoFim: NOV }), "asaas")).toMatchObject({ gravar: false });
    expect(decidirEvento(depois, ev({ planoId: "essencial", provedorRef: "sub_A", status: "cancelada", periodoFim: null }), "asaas")).toMatchObject({ gravar: false });
  });

  it("bônus de indicação sobrevive à renovação", () => {
    const BONUS = new Date(new Date(OUT).getTime() + 30 * 86_400_000).toISOString();
    const comBonus = gravada({ periodo_fim: BONUS, periodo_fim_provedor: OUT, dias_bonus: 30 });
    // Reenvio do mesmo pagamento: nada muda.
    expect(decidirEvento(comBonus, ev({}), "asaas")).toMatchObject({ gravar: false });
    // Mês seguinte: provedor + 30 dias.
    const d = decidirEvento(comBonus, ev({ periodoFim: NOV }), "asaas");
    expect(d).toMatchObject({ gravar: true, linha: { periodo_fim_provedor: NOV, periodo_fim: new Date(new Date(NOV).getTime() + 30 * 86_400_000).toISOString() } });
  });

  it("estorno tira o período da cobrança, uma vez só", () => {
    const est = ev({ status: "estornada", periodoFim: null, coberturaDe: "2026-11-07T00:00:00-03:00", coberturaAte: NOV, pagamentoRef: "pay_2" });
    // Último pagamento estornado: período volta para o vencimento dele.
    const d = decidirEvento(gravada({ periodo_fim: NOV, periodo_fim_provedor: NOV }), est, "asaas");
    expect(d).toMatchObject({ gravar: true, linha: { status: "ativa", periodo_fim_provedor: new Date("2026-11-07T00:00:00-03:00").toISOString(), provedor_pagamentos_estornados: ["pay_2"] } });
    // Repetido: ignorado. E o "pago" reenviado do mesmo pagamento também não volta a valer.
    const depois = gravada({ periodo_fim: OUT, periodo_fim_provedor: OUT, provedor_pagamentos_estornados: ["pay_2"] });
    expect(decidirEvento(depois, est, "asaas")).toMatchObject({ gravar: false });
    expect(decidirEvento(depois, ev({ periodoFim: NOV, pagamentoRef: "pay_2" }), "asaas")).toMatchObject({ gravar: false });
    // Estorno de cobrança antiga com pagamentos posteriores: tira só a duração dela.
    const antigo = ev({ status: "estornada", periodoFim: null, coberturaDe: "2026-10-07T00:00:00-03:00", coberturaAte: OUT, pagamentoRef: "pay_1" });
    const d2 = decidirEvento(gravada({ periodo_fim: NOV, periodo_fim_provedor: NOV }), antigo, "asaas");
    const fim = new Date(NOV).getTime() - (new Date(OUT).getTime() - new Date("2026-10-07T00:00:00-03:00").getTime());
    expect(d2).toMatchObject({ gravar: true, linha: { periodo_fim_provedor: new Date(fim).toISOString() } });
    // Estorno de outra assinatura não mexe.
    expect(decidirEvento(gravada({ provedor_ref: "sub_B" }), est, "asaas")).toMatchObject({ gravar: false });
  });

  it("ida para o Grátis: o cancelamento do provedor não rebaixa antes do fim do período", () => {
    const agendada = gravada({ cancelamento_agendado: true });
    const d = decidirEvento(agendada, ev({ status: "cancelada", periodoFim: null, coberturaAte: null }), "asaas");
    expect(d).toMatchObject({ gravar: true, linha: { status: "ativa", periodo_fim: OUT, provedor_refs_encerradas: ["sub_A"] } });
    // Assinar de novo depois: a nova assume e não tenta cancelar a antiga outra vez.
    const depois = gravada({ cancelamento_agendado: true, provedor_refs_encerradas: ["sub_A"] });
    expect(decidirEvento(depois, ev({ provedorRef: "sub_C", periodoFim: NOV }), "asaas")).toMatchObject({ gravar: true, linha: { cancelamento_agendado: false }, cancelarRef: null });
  });
});

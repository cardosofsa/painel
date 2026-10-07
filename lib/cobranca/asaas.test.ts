import { afterEach, describe, expect, it, vi } from "vitest";
import {
  asaas,
  configAsaas,
  documentoValido,
  erroDoAsaas,
  faturaParaPagar,
  interpretarEventoAsaas,
  lerReferenciaExterna,
  payloadAssinatura,
  payloadCliente,
  periodoFimDoVencimento,
  tokenWebhookValido,
  type CorpoWebhookAsaas,
} from "./asaas";
import { ErroWebhookNaoAutorizado } from "./tipos";

const USER = "6f1c2b9e-3a4d-4e5f-8a7b-9c0d1e2f3a4b";
const REF = `${USER}:pro`;

/** Fixtures no formato que o Asaas manda (campos reais, valores inventados). */
function eventoPagamento(event: string, extra: Record<string, unknown> = {}): CorpoWebhookAsaas {
  return {
    id: "evt_05b708f961d739ea7eba7e4db318f621&368604920",
    event,
    payment: {
      id: "pay_080225913252",
      subscription: "sub_VXJBYgP2u0eO",
      externalReference: REF,
      dueDate: "2026-10-07",
      status: event === "PAYMENT_OVERDUE" ? "OVERDUE" : "RECEIVED",
      invoiceUrl: "https://www.asaas.com/i/080225913252",
      deleted: false,
      ...extra,
    } as CorpoWebhookAsaas["payment"],
  };
}

function eventoAssinatura(event: string, extra: Record<string, unknown> = {}): CorpoWebhookAsaas {
  return {
    id: "evt_x",
    event,
    subscription: { id: "sub_VXJBYgP2u0eO", externalReference: REF, cycle: "MONTHLY", status: "INACTIVE", deleted: event === "SUBSCRIPTION_DELETED", ...extra },
  };
}

describe("configAsaas", () => {
  it("só liga com chave e token", () => {
    expect(configAsaas({})).toBeNull();
    expect(configAsaas({ ASAAS_API_KEY: "k" })).toBeNull();
    expect(configAsaas({ ASAAS_WEBHOOK_TOKEN: "t" })).toBeNull();
    expect(configAsaas({ ASAAS_API_KEY: " ", ASAAS_WEBHOOK_TOKEN: "t" })).toBeNull();
    expect(configAsaas({ ASAAS_API_KEY: "k", ASAAS_WEBHOOK_TOKEN: "t" })).toEqual({ apiKey: "k", webhookToken: "t", ambiente: "producao" });
    expect(configAsaas({ ASAAS_API_KEY: "k", ASAAS_WEBHOOK_TOKEN: "t", ASAAS_AMBIENTE: "Sandbox" })?.ambiente).toBe("sandbox");
    expect(configAsaas({ ASAAS_API_KEY: "k", ASAAS_WEBHOOK_TOKEN: "t", ASAAS_AMBIENTE: "qualquer" })?.ambiente).toBe("producao");
  });
});

describe("tokenWebhookValido", () => {
  it("compara exatamente, inclusive tamanhos diferentes", () => {
    expect(tokenWebhookValido("segredo-123", "segredo-123")).toBe(true);
    expect(tokenWebhookValido("segredo-124", "segredo-123")).toBe(false);
    expect(tokenWebhookValido("segredo", "segredo-123")).toBe(false);
    expect(tokenWebhookValido("", "segredo-123")).toBe(false);
    expect(tokenWebhookValido(null, "segredo-123")).toBe(false);
    expect(tokenWebhookValido("x", "")).toBe(false);
  });
});

describe("referência externa", () => {
  it("lê user_id:plano_id e recusa o resto", () => {
    expect(lerReferenciaExterna(REF)).toEqual({ userId: USER, planoId: "pro" });
    expect(lerReferenciaExterna(`${USER.toUpperCase()}:essencial`)).toEqual({ userId: USER, planoId: "essencial" });
    expect(lerReferenciaExterna("pedido-123")).toBeNull();
    expect(lerReferenciaExterna(`${USER}:pro:extra`)).toBeNull();
    expect(lerReferenciaExterna(`${USER}:PRO`)).toBeNull();
    expect(lerReferenciaExterna("nao-e-uuid:pro")).toBeNull();
    expect(lerReferenciaExterna(null)).toBeNull();
  });
});

describe("documentoValido", () => {
  it("aceita CPF e CNPJ válidos, com ou sem máscara", () => {
    expect(documentoValido("529.982.247-25")).toBe("52998224725");
    expect(documentoValido("11.222.333/0001-81")).toBe("11222333000181");
    expect(documentoValido("529.982.247-26")).toBeNull();
    expect(documentoValido("123")).toBeNull();
    expect(documentoValido(null)).toBeNull();
  });
});

describe("periodoFimDoVencimento", () => {
  it("soma um ciclo e fecha no fim do dia de Brasília", () => {
    expect(periodoFimDoVencimento("2026-10-07")).toBe("2026-11-07T23:59:59-03:00");
    expect(periodoFimDoVencimento("2026-12-15")).toBe("2027-01-15T23:59:59-03:00");
  });
  it("prende no último dia do mês curto", () => {
    expect(periodoFimDoVencimento("2026-01-31")).toBe("2026-02-28T23:59:59-03:00");
    expect(periodoFimDoVencimento("2028-01-31")).toBe("2028-02-29T23:59:59-03:00");
    expect(periodoFimDoVencimento("2026-08-31", "QUARTERLY")).toBe("2026-11-30T23:59:59-03:00");
  });
  it("outros ciclos e data inválida", () => {
    expect(periodoFimDoVencimento("2026-10-07", "YEARLY")).toBe("2027-10-07T23:59:59-03:00");
    expect(periodoFimDoVencimento("2026-10-28", "WEEKLY")).toBe("2026-11-04T23:59:59-03:00");
    expect(periodoFimDoVencimento("07/10/2026")).toBeNull();
  });
});

describe("payloads", () => {
  it("cliente com externalReference = user_id", () => {
    expect(payloadCliente({ userId: USER, email: "loja@exemplo.com", documento: "52998224725" })).toEqual({
      name: "loja",
      email: "loja@exemplo.com",
      cpfCnpj: "52998224725",
      externalReference: USER,
      notificationDisabled: false,
    });
  });
  it("assinatura mensal, cliente escolhe a forma, vence hoje em Brasília", () => {
    // 23h30 de Brasília = 02h30 UTC do dia seguinte: ainda é dia 07.
    const agora = new Date("2026-10-08T02:30:00Z");
    expect(payloadAssinatura({ clienteId: "cus_000005219613", userId: USER, plano: { id: "pro", nome: "Pro", preco: 99.9 }, agora })).toEqual({
      customer: "cus_000005219613",
      billingType: "UNDEFINED",
      value: 99.9,
      nextDueDate: "2026-10-07",
      cycle: "MONTHLY",
      description: "Sertão: plano Pro (mensal)",
      externalReference: REF,
    });
  });
});

describe("interpretarEventoAsaas", () => {
  it("pagamento confirmado/recebido ativa até vencimento + 1 mês", async () => {
    for (const ev of ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]) {
      expect(await interpretarEventoAsaas(eventoPagamento(ev))).toEqual({
        userId: USER,
        planoId: "pro",
        status: "ativa",
        periodoFim: "2026-11-07T23:59:59-03:00",
        coberturaAte: "2026-11-07T23:59:59-03:00",
        provedorRef: "sub_VXJBYgP2u0eO",
        pagamentoRef: "pay_080225913252",
      });
    }
  });
  it("estorno, chargeback e exclusão de cobrança paga viram estornada com a janela da cobrança", async () => {
    for (const ev of ["PAYMENT_REFUNDED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_DELETED"]) {
      expect(await interpretarEventoAsaas(eventoPagamento(ev))).toEqual({
        userId: USER,
        planoId: "pro",
        status: "estornada",
        periodoFim: null,
        coberturaDe: "2026-10-07T00:00:00-03:00",
        coberturaAte: "2026-11-07T23:59:59-03:00",
        provedorRef: "sub_VXJBYgP2u0eO",
        pagamentoRef: "pay_080225913252",
      });
    }
    // Fatura em aberto excluída: nada foi pago, nada a desfazer.
    expect(await interpretarEventoAsaas(eventoPagamento("PAYMENT_DELETED", { status: "PENDING" }))).toBeNull();
    // Sem id da cobrança não dá para aplicar uma vez só.
    expect(await interpretarEventoAsaas(eventoPagamento("PAYMENT_REFUNDED", { id: undefined }))).toBeNull();
  });
  it("vencida vira atrasada sem mexer no período", async () => {
    expect(await interpretarEventoAsaas(eventoPagamento("PAYMENT_OVERDUE"))).toMatchObject({ status: "atrasada", periodoFim: null, coberturaAte: "2026-11-07T23:59:59-03:00" });
  });
  it("assinatura removida ou inativada vira cancelada", async () => {
    expect(await interpretarEventoAsaas(eventoAssinatura("SUBSCRIPTION_DELETED"))).toEqual({ userId: USER, planoId: "pro", status: "cancelada", periodoFim: null, coberturaAte: null, provedorRef: "sub_VXJBYgP2u0eO" });
    expect(await interpretarEventoAsaas(eventoAssinatura("SUBSCRIPTION_INACTIVATED"))).toMatchObject({ status: "cancelada" });
    expect(await interpretarEventoAsaas(eventoAssinatura("SUBSCRIPTION_UPDATED"))).toMatchObject({ status: "cancelada" });
    expect(await interpretarEventoAsaas(eventoAssinatura("SUBSCRIPTION_UPDATED", { status: "ACTIVE" }))).toBeNull();
  });
  it("ignora o que não é nosso", async () => {
    expect(await interpretarEventoAsaas(null)).toBeNull();
    expect(await interpretarEventoAsaas({ event: "PAYMENT_CREATED", payment: eventoPagamento("x").payment })).toBeNull();
    expect(await interpretarEventoAsaas(eventoPagamento("PAYMENT_RECEIVED", { subscription: null }))).toBeNull();
    expect(await interpretarEventoAsaas(eventoPagamento("PAYMENT_RECEIVED", { externalReference: "outro-sistema" }))).toBeNull();
    expect(await interpretarEventoAsaas(eventoPagamento("PAYMENT_RECEIVED", { dueDate: "lixo" }))).toBeNull();
    expect(await interpretarEventoAsaas(eventoAssinatura("SUBSCRIPTION_DELETED", { externalReference: null }))).toBeNull();
  });
  it("cobrança sem externalReference busca o da assinatura", async () => {
    const buscar = vi.fn(async () => REF);
    const ev = await interpretarEventoAsaas(eventoPagamento("PAYMENT_RECEIVED", { externalReference: null }), buscar);
    expect(buscar).toHaveBeenCalledWith("sub_VXJBYgP2u0eO");
    expect(ev).toMatchObject({ userId: USER, status: "ativa" });
  });
});

describe("faturaParaPagar", () => {
  it("pendente mais antiga, depois vencida", () => {
    expect(
      faturaParaPagar([
        { id: "b", dueDate: "2026-11-07", status: "PENDING", invoiceUrl: "u-nov" },
        { id: "a", dueDate: "2026-10-07", status: "PENDING", invoiceUrl: "u-out" },
        { id: "c", dueDate: "2026-09-07", status: "RECEIVED", invoiceUrl: "u-set" },
      ]),
    ).toBe("u-out");
    expect(faturaParaPagar([{ dueDate: "2026-10-07", status: "OVERDUE", invoiceUrl: "u-venc" }])).toBe("u-venc");
    expect(faturaParaPagar([{ dueDate: "2026-10-07", status: "PENDING", invoiceUrl: "u", deleted: true }])).toBeNull();
    expect(faturaParaPagar([])).toBeNull();
  });
});

describe("erroDoAsaas", () => {
  it("traduz status e repassa a descrição", () => {
    expect(erroDoAsaas(null, 401)).toMatch(/Chave da API do Asaas inválida/);
    expect(erroDoAsaas({ errors: [{ code: "invalid_cpfCnpj", description: "O CPF/CNPJ informado é inválido." }] }, 400)).toBe("O CPF/CNPJ informado é inválido.");
    expect(erroDoAsaas({}, 503)).toMatch(/fora do ar/);
    expect(erroDoAsaas("html", 400)).toBe("O Asaas recusou a operação (400).");
  });
});

describe("provedor asaas (fetch simulado)", () => {
  const config = { apiKey: "$aact_teste", webhookToken: "tok-webhook", ambiente: "sandbox" as const };
  afterEach(() => vi.unstubAllGlobals());

  function simular(respostas: Record<string, unknown>) {
    const chamadas: { metodo: string; url: string; corpo: unknown; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const metodo = init.method ?? "GET";
        chamadas.push({ metodo, url, corpo: init.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers as Record<string, string> });
        const chave = `${metodo} ${url.replace("https://api-sandbox.asaas.com/v3", "")}`;
        const r = respostas[chave];
        if (r === undefined) return new Response(JSON.stringify({ errors: [{ description: `sem fixture: ${chave}` }] }), { status: 404 });
        return new Response(JSON.stringify(r), { status: 200 });
      }),
    );
    return chamadas;
  }

  const entrada = { userId: USER, email: "loja@exemplo.com", documento: "529.982.247-25", plano: { id: "pro", nome: "Pro", preco: 99.9 }, voltaUrl: "https://x/configuracoes" };

  it("cliente novo: cria cliente e assinatura e devolve a fatura", async () => {
    const chamadas = simular({
      [`GET /customers?externalReference=${USER}&limit=1`]: { data: [] },
      "POST /customers": { id: "cus_1" },
      "GET /subscriptions?customer=cus_1&status=ACTIVE&limit=20": { data: [] },
      "POST /subscriptions": { id: "sub_1" },
      "GET /subscriptions/sub_1/payments?limit=20": { data: [{ id: "pay_1", dueDate: "2026-10-07", status: "PENDING", invoiceUrl: "https://sandbox.asaas.com/i/1" }] },
    });
    expect(await asaas(config).criarCheckout(entrada)).toEqual({ url: "https://sandbox.asaas.com/i/1" });
    expect(chamadas[0].headers.access_token).toBe("$aact_teste");
    expect(chamadas[1].corpo).toMatchObject({ cpfCnpj: "52998224725", externalReference: USER });
    expect(chamadas[3].corpo).toMatchObject({ customer: "cus_1", billingType: "UNDEFINED", cycle: "MONTHLY", externalReference: REF });
  });

  it("já assina o mesmo plano: reaproveita a fatura em aberto, sem criar outra", async () => {
    const chamadas = simular({
      [`GET /customers?externalReference=${USER}&limit=1`]: { data: [{ id: "cus_1" }] },
      "GET /subscriptions?customer=cus_1&status=ACTIVE&limit=20": { data: [{ id: "sub_9", externalReference: REF }] },
      "GET /subscriptions/sub_9/payments?limit=20": { data: [{ dueDate: "2026-10-07", status: "OVERDUE", invoiceUrl: "u-venc" }] },
    });
    expect(await asaas(config).criarCheckout({ ...entrada, documento: null })).toEqual({ url: "u-venc" });
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false);
  });

  it("cliente novo sem documento válido: pede CPF/CNPJ", async () => {
    simular({ [`GET /customers?externalReference=${USER}&limit=1`]: { data: [] } });
    await expect(asaas(config).criarCheckout({ ...entrada, documento: "111.111.111-11" })).rejects.toThrow(/CPF ou CNPJ/);
  });

  it("webhook: token errado lança, token certo interpreta", async () => {
    simular({});
    const corpo = JSON.stringify(eventoPagamento("PAYMENT_RECEIVED"));
    const ruim = new Request("https://x/api/cobranca/webhook", { method: "POST", headers: { "asaas-access-token": "outro" }, body: corpo });
    await expect(asaas(config).interpretarWebhook(ruim)).rejects.toBeInstanceOf(ErroWebhookNaoAutorizado);
    const bom = new Request("https://x/api/cobranca/webhook", { method: "POST", headers: { "asaas-access-token": "tok-webhook" }, body: corpo });
    expect(await asaas(config).interpretarWebhook(bom)).toMatchObject({ userId: USER, status: "ativa" });
  });
});

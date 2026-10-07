import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { hojeIsoBrasil } from "@/lib/format";
import { cnpjValido, cpfValido } from "@/lib/pix-chave";
import { ErroWebhookNaoAutorizado, type CheckoutCobranca, type EventoCobranca, type ProvedorCobranca } from "./tipos";

/**
 * Asaas (API v3) como provedor de cobrança das assinaturas. Código de SERVIDOR: a chave
 * (`ASAAS_API_KEY`) nunca sai daqui. Passo a passo em `docs/cobranca-asaas.md`.
 *
 * Fluxo:
 *   1. "Assinar" → acha o cliente pelo `externalReference = user_id` (ou cria, com CPF/CNPJ);
 *   2. reaproveita a assinatura ativa do mesmo plano ou cria uma nova: ciclo MONTHLY,
 *      `billingType = UNDEFINED` (o cliente escolhe Pix, boleto ou cartão na fatura) e
 *      `externalReference = user_id:plano_id`;
 *   3. o navegador vai para a `invoiceUrl` da primeira cobrança pendente;
 *   4. o Asaas avisa em `/api/cobranca/webhook` (header `asaas-access-token`), e a rota grava
 *      a assinatura com a service key.
 *
 * As partes puras (payload, evento, token, período) são exportadas e cobertas por
 * `asaas.test.ts`. Toda URL chamada é fixa do código (nada digitado pelo usuário).
 */

export type AmbienteAsaas = "sandbox" | "producao";

export const HOST_ASAAS: Record<AmbienteAsaas, string> = {
  producao: "https://api.asaas.com/v3",
  sandbox: "https://api-sandbox.asaas.com/v3",
};

export const TIMEOUT_ASAAS_MS = 15_000;

export type CicloAsaas = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";

export interface ConfigAsaas {
  apiKey: string;
  webhookToken: string;
  ambiente: AmbienteAsaas;
}

/** Variáveis de ambiente → configuração. Faltando chave ou token, o Asaas fica desligado. */
export function configAsaas(env: Record<string, string | undefined> = process.env): ConfigAsaas | null {
  const apiKey = env.ASAAS_API_KEY?.trim();
  const webhookToken = env.ASAAS_WEBHOOK_TOKEN?.trim();
  if (!apiKey || !webhookToken) return null;
  return { apiKey, webhookToken, ambiente: env.ASAAS_AMBIENTE?.trim().toLowerCase() === "sandbox" ? "sandbox" : "producao" };
}

// ---------------------------------------------------------------- partes puras

/** Compara o token do header com o configurado em tempo constante (hash dos dois lados). */
export function tokenWebhookValido(recebido: string | null | undefined, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = createHash("sha256").update(recebido, "utf8").digest();
  const b = createHash("sha256").update(esperado, "utf8").digest();
  return timingSafeEqual(a, b);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLANO = /^[a-z0-9_-]{2,30}$/;

export function referenciaExterna(userId: string, planoId: string): string {
  return `${userId}:${planoId}`;
}

/** `user_id:plano_id` → partes validadas. Qualquer outra coisa (cobrança avulsa) → null. */
export function lerReferenciaExterna(ref: unknown): { userId: string; planoId: string } | null {
  if (typeof ref !== "string") return null;
  const [userId, planoId, ...resto] = ref.trim().split(":");
  if (resto.length || !userId || !planoId || !UUID.test(userId) || !PLANO.test(planoId)) return null;
  return { userId: userId.toLowerCase(), planoId };
}

/** Só os dígitos de um CPF/CNPJ válido; senão null. */
export function documentoValido(valor: string | null | undefined): string | null {
  const d = (valor ?? "").replace(/\D/g, "");
  if (d.length === 11 && cpfValido(d)) return d;
  if (d.length === 14 && cnpjValido(d)) return d;
  return null;
}

const MESES_DO_CICLO: Partial<Record<CicloAsaas, number>> = { MONTHLY: 1, BIMONTHLY: 2, QUARTERLY: 3, SEMIANNUALLY: 6, YEARLY: 12 };
const DIAS_DO_CICLO: Partial<Record<CicloAsaas, number>> = { WEEKLY: 7, BIWEEKLY: 14 };

/**
 * Até quando uma cobrança paga cobre: vencimento + um ciclo, no fim do dia de Brasília
 * (o Brasil não tem horário de verão desde 2019: sempre −03:00). Mês curto prende no
 * último dia (31/01 + 1 mês = 28 ou 29/02), como o calendário do Asaas faz.
 */
export function periodoFimDoVencimento(vencimento: string, ciclo: CicloAsaas = "MONTHLY"): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(vencimento);
  if (!m) return null;
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  let data: Date;
  const meses = MESES_DO_CICLO[ciclo];
  if (meses) {
    const alvo = new Date(Date.UTC(ano, mes - 1 + meses, 1));
    const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    data = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth(), Math.min(dia, ultimo)));
  } else {
    data = new Date(Date.UTC(ano, mes - 1, dia + (DIAS_DO_CICLO[ciclo] ?? 30)));
  }
  if (Number.isNaN(data.getTime())) return null;
  return `${data.toISOString().slice(0, 10)}T23:59:59-03:00`;
}

export interface PayloadCliente {
  name: string;
  email: string;
  cpfCnpj: string;
  externalReference: string;
  notificationDisabled: boolean;
}

export function payloadCliente(entrada: { userId: string; email: string; nome?: string | null; documento: string }): PayloadCliente {
  const nome = (entrada.nome ?? "").trim() || entrada.email.split("@")[0] || "Cliente Sertão";
  return { name: nome.slice(0, 100), email: entrada.email, cpfCnpj: entrada.documento, externalReference: entrada.userId, notificationDisabled: false };
}

export interface PayloadAssinatura {
  customer: string;
  billingType: "UNDEFINED";
  value: number;
  nextDueDate: string;
  cycle: CicloAsaas;
  description: string;
  externalReference: string;
}

/** Primeira cobrança vence hoje (Brasília): a fatura já nasce pagável. */
export function payloadAssinatura(entrada: { clienteId: string; userId: string; plano: { id: string; nome: string; preco: number }; agora?: Date }): PayloadAssinatura {
  return {
    customer: entrada.clienteId,
    billingType: "UNDEFINED",
    value: Math.round(entrada.plano.preco * 100) / 100,
    nextDueDate: hojeIsoBrasil(entrada.agora),
    cycle: "MONTHLY",
    description: `Sertão: plano ${entrada.plano.nome} (mensal)`.slice(0, 500),
    externalReference: referenciaExterna(entrada.userId, entrada.plano.id),
  };
}

interface PagamentoBruto {
  id?: string;
  subscription?: string | null;
  externalReference?: string | null;
  dueDate?: string;
  status?: string;
  invoiceUrl?: string | null;
  deleted?: boolean;
}

interface AssinaturaBruta {
  id?: string;
  externalReference?: string | null;
  cycle?: CicloAsaas;
  status?: string;
  deleted?: boolean;
}

export interface CorpoWebhookAsaas {
  id?: string;
  event?: string;
  payment?: PagamentoBruto;
  subscription?: AssinaturaBruta;
}

const PAGO = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const ENCERRADA = new Set(["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"]);

/**
 * Corpo do webhook → evento do painel. null = ignorar (evento de outro tipo, cobrança
 * avulsa sem `externalReference` nosso, payload torto). `buscarReferencia` cobre a
 * cobrança que chega sem `externalReference`: devolve o da assinatura dona dela.
 */
export async function interpretarEventoAsaas(
  corpo: CorpoWebhookAsaas | null,
  buscarReferencia?: (assinaturaId: string) => Promise<string | null>,
): Promise<EventoCobranca | null> {
  const evento = corpo?.event;
  if (!evento) return null;

  if (PAGO.has(evento) || evento === "PAYMENT_OVERDUE") {
    const p = corpo.payment;
    if (!p?.subscription || !p.dueDate) return null; // cobrança avulsa: não é assinatura
    let ref = lerReferenciaExterna(p.externalReference);
    if (!ref && buscarReferencia) ref = lerReferenciaExterna(await buscarReferencia(p.subscription));
    if (!ref) return null;
    const cobertura = periodoFimDoVencimento(p.dueDate);
    if (!cobertura) return null;
    return PAGO.has(evento)
      ? { ...ref, status: "ativa", periodoFim: cobertura, coberturaAte: cobertura, provedorRef: p.subscription }
      : { ...ref, status: "atrasada", periodoFim: null, coberturaAte: cobertura, provedorRef: p.subscription };
  }

  const inativada = evento === "SUBSCRIPTION_UPDATED" && corpo.subscription?.status === "INACTIVE";
  if (ENCERRADA.has(evento) || inativada) {
    const s = corpo.subscription;
    const ref = lerReferenciaExterna(s?.externalReference);
    if (!s?.id || !ref) return null;
    return { ...ref, status: "cancelada", periodoFim: null, coberturaAte: null, provedorRef: s.id };
  }

  return null;
}

/** Fatura a mandar o cliente: a pendente mais antiga; senão a vencida mais antiga. */
export function faturaParaPagar(pagamentos: PagamentoBruto[]): string | null {
  const vivos = pagamentos.filter((p) => !p.deleted && p.invoiceUrl).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
  return (vivos.find((p) => p.status === "PENDING") ?? vivos.find((p) => p.status === "OVERDUE"))?.invoiceUrl ?? null;
}

/** Erro da API (`{ errors: [{ code, description }] }`) → mensagem em pt-BR para a tela. */
export function erroDoAsaas(json: unknown, status: number): string {
  if (status === 401) return "Chave da API do Asaas inválida. Confira ASAAS_API_KEY (e ASAAS_AMBIENTE: chave de sandbox não vale em produção).";
  if (status === 403) return "O Asaas recusou o acesso. Confira as permissões da chave da API.";
  if (status === 429) return "O Asaas está limitando as requisições. Tente de novo em alguns minutos.";
  const erros = (json as { errors?: { description?: string }[] } | null)?.errors;
  const texto = Array.isArray(erros)
    ? erros
        .map((e) => e?.description)
        .filter((d): d is string => typeof d === "string" && d.length > 0)
        .slice(0, 2)
        .join(" ")
    : "";
  if (texto) return texto.slice(0, 300);
  return status >= 500 ? "O Asaas está fora do ar agora. Tente de novo em alguns minutos." : `O Asaas recusou a operação (${status}).`;
}

// ---------------------------------------------------------------- provedor

export function asaas(config: ConfigAsaas): ProvedorCobranca {
  const base = HOST_ASAAS[config.ambiente];

  async function chamar<T>(metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
    let r: Response;
    try {
      r = await fetch(`${base}${caminho}`, {
        method: metodo,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          access_token: config.apiKey,
          // O Asaas exige User-Agent nas contas novas.
          "User-Agent": "Sertao-Painel",
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_ASAAS_MS),
      });
    } catch (e) {
      const nome = e instanceof Error ? e.name : "";
      throw new Error(nome === "TimeoutError" || nome === "AbortError" ? "O Asaas demorou demais para responder. Tente de novo." : "Não foi possível falar com o Asaas agora. Tente de novo.");
    }
    const json = await r.json().catch(() => null);
    if (!r.ok) {
      console.error("[cobranca] asaas", metodo, caminho.split("?")[0], r.status);
      throw new Error(erroDoAsaas(json, r.status));
    }
    return json as T;
  }

  type Lista<T> = { data?: T[] };

  async function acharOuCriarCliente(entrada: { userId: string; email: string; documento?: string | null }): Promise<string> {
    const achados = await chamar<Lista<{ id?: string; deleted?: boolean }>>("GET", `/customers?externalReference=${encodeURIComponent(entrada.userId)}&limit=1`);
    const existente = achados.data?.find((c) => c.id && !c.deleted);
    if (existente?.id) return existente.id;
    const documento = documentoValido(entrada.documento);
    if (!documento) throw new Error("Informe um CPF ou CNPJ válido para emitir a cobrança.");
    const criado = await chamar<{ id?: string }>("POST", "/customers", payloadCliente({ userId: entrada.userId, email: entrada.email, documento }));
    if (!criado.id) throw new Error("O Asaas não devolveu o cliente criado. Tente de novo.");
    return criado.id;
  }

  async function faturaDaAssinatura(assinaturaId: string): Promise<string | null> {
    const pagamentos = await chamar<Lista<PagamentoBruto>>("GET", `/subscriptions/${encodeURIComponent(assinaturaId)}/payments?limit=20`);
    return faturaParaPagar(pagamentos.data ?? []);
  }

  return {
    id: "asaas",

    async criarCheckout(entrada): Promise<CheckoutCobranca> {
      if (!(entrada.plano.preco > 0)) throw new Error("Plano grátis não passa pela cobrança.");
      const clienteId = await acharOuCriarCliente(entrada);
      const externa = referenciaExterna(entrada.userId, entrada.plano.id);

      // Já existe assinatura ativa deste plano: manda para a fatura em aberto dela.
      const ativas = await chamar<Lista<AssinaturaBruta>>("GET", `/subscriptions?customer=${encodeURIComponent(clienteId)}&status=ACTIVE&limit=20`);
      const mesma = ativas.data?.find((s) => s.id && !s.deleted && s.externalReference === externa);
      if (mesma?.id) {
        const url = await faturaDaAssinatura(mesma.id);
        if (url) return { url };
        throw new Error("Você já assina este plano e não há cobrança em aberto.");
      }

      const nova = await chamar<{ id?: string }>("POST", "/subscriptions", payloadAssinatura({ clienteId, userId: entrada.userId, plano: entrada.plano }));
      if (!nova.id) throw new Error("O Asaas não devolveu a assinatura criada. Tente de novo.");
      const url = await faturaDaAssinatura(nova.id);
      if (!url) throw new Error("A assinatura foi criada, mas o Asaas ainda não gerou a fatura. Tente de novo em instantes.");
      return { url };
    },

    async interpretarWebhook(req) {
      if (!tokenWebhookValido(req.headers.get("asaas-access-token"), config.webhookToken)) throw new ErroWebhookNaoAutorizado();
      const corpo = (await req.json().catch(() => null)) as CorpoWebhookAsaas | null;
      return interpretarEventoAsaas(corpo, async (id) => {
        const s = await chamar<AssinaturaBruta>("GET", `/subscriptions/${encodeURIComponent(id)}`);
        return s.externalReference ?? null;
      });
    },

    async cancelarAssinatura(ref) {
      await chamar("DELETE", `/subscriptions/${encodeURIComponent(ref)}`);
    },
  };
}

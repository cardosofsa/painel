/**
 * Melhor Envio (API v2). Código de SERVIDOR: o token da conta (gerado em Melhor Envio →
 * Integrações → Permissões de acesso, escopos shipping-calculate, cart-write, shipping-checkout,
 * shipping-generate, shipping-print) fica cifrado em `frete_conexoes` e só é lido aqui.
 *
 * - Cotação: POST /api/v2/me/shipment/calculate.
 * - Etiqueta: carrinho (/me/cart) → pagar com o saldo (/me/shipment/checkout) → gerar
 *   (/me/shipment/generate) → link de impressão (/me/shipment/print). Cobra do saldo da conta.
 *
 * O parser da resposta é puro e coberto por `melhor-envio.test.ts`.
 */

import type { Cotacao, Pacote, ProvedorFrete } from "./tipos";
import { soDigitosCep } from "./tipos";

export type AmbienteFrete = "sandbox" | "producao";

export const HOST_ME: Record<AmbienteFrete, string> = {
  producao: "https://melhorenvio.com.br",
  sandbox: "https://sandbox.melhorenvio.com.br",
};

interface ServicoBruto {
  id?: number;
  name?: string;
  price?: string | number;
  custom_price?: string | number;
  delivery_time?: number;
  custom_delivery_time?: number;
  error?: string;
  company?: { name?: string };
}

/** Resposta do calculate → cotações válidas (serviços com `error` ficam de fora). */
export function cotacoesDoMelhorEnvio(json: unknown): Cotacao[] {
  const lista = Array.isArray(json) ? (json as ServicoBruto[]) : [];
  return lista
    .filter((s) => !s.error && s.id != null && (s.custom_price ?? s.price) != null)
    .map((s) => ({
      servicoId: Number(s.id),
      servico: String(s.name ?? "Serviço"),
      transportadora: String(s.company?.name ?? ""),
      valor: Math.round(Number(s.custom_price ?? s.price) * 100) / 100,
      prazoDias: s.custom_delivery_time ?? s.delivery_time ?? null,
    }))
    .filter((c) => Number.isFinite(c.valor) && c.valor > 0);
}

/** Mensagem de erro da API (vem como `message` e/ou `errors: { campo: [..] }`). */
export function erroDoMelhorEnvio(json: unknown, status: number): string {
  const j = (json ?? {}) as { message?: string; error?: string; errors?: Record<string, string[] | string> };
  const detalhes = j.errors ? Object.values(j.errors).flat().filter(Boolean).slice(0, 2).join(" ") : "";
  if (status === 401) return "Token do Melhor Envio inválido ou vencido. Gere outro e salve em Configurações → Frete.";
  return [j.message || j.error, detalhes].filter(Boolean).join(" — ") || `Melhor Envio respondeu ${status}.`;
}

export function melhorEnvio(token: string, ambiente: AmbienteFrete, contato: string) {
  async function chamar(caminho: string, corpo?: unknown): Promise<unknown> {
    const r = await fetch(`${HOST_ME[ambiente]}${caminho}`, {
      method: corpo === undefined ? "GET" : "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        // Exigido pelo Melhor Envio: nome da aplicação e e-mail de contato.
        "User-Agent": `SERTAO Gestao (${contato})`,
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = await r.json().catch(() => null);
    if (!r.ok) throw new Error(erroDoMelhorEnvio(json, r.status));
    return json;
  }

  const provedor: ProvedorFrete & {
    comprarEtiqueta: (e: EntradaEtiqueta) => Promise<{ etiquetaId: string; rastreio: string | null; urlImpressao: string | null }>;
    saldo: () => Promise<number | null>;
  } = {
    async cotar({ origem, destino, pacote, valorDeclarado }) {
      const json = await chamar("/api/v2/me/shipment/calculate", {
        from: { postal_code: soDigitosCep(origem) },
        to: { postal_code: soDigitosCep(destino) },
        package: pacote,
        options: { insurance_value: Math.round(valorDeclarado * 100) / 100, receipt: false, own_hand: false },
      });
      return cotacoesDoMelhorEnvio(json);
    },

    async saldo() {
      const j = (await chamar("/api/v2/me/balance").catch(() => null)) as { balance?: number | string } | null;
      return j?.balance != null ? Number(j.balance) : null;
    },

    async comprarEtiqueta(e) {
      const cart = (await chamar("/api/v2/me/cart", corpoCarrinho(e))) as { id?: string };
      if (!cart?.id) throw new Error("O Melhor Envio não aceitou o envio no carrinho.");
      await chamar("/api/v2/me/shipment/checkout", { orders: [cart.id] });
      await chamar("/api/v2/me/shipment/generate", { orders: [cart.id] });
      const imp = (await chamar("/api/v2/me/shipment/print", { mode: "public", orders: [cart.id] }).catch(() => null)) as { url?: string } | null;
      const info = (await chamar(`/api/v2/me/orders/${cart.id}`).catch(() => null)) as { tracking?: string | null; self_tracking?: string | null } | null;
      return { etiquetaId: cart.id, rastreio: info?.tracking || info?.self_tracking || null, urlImpressao: imp?.url ?? null };
    },
  };
  return provedor;
}

export interface Endereco {
  nome: string;
  telefone?: string | null;
  email?: string | null;
  documento?: string | null;
  cep: string;
  endereco: string;
  numero: string;
  complemento?: string | null;
  bairro: string;
  cidade: string;
  uf: string;
}

export interface EntradaEtiqueta {
  servicoId: number;
  remetente: Endereco;
  destinatario: Endereco;
  pacote: Pacote;
  valorDeclarado: number;
  produtos: { nome: string; quantidade: number; valor: number }[];
  numeroPedido: string;
}

/** Corpo do /me/cart. Documento com 14 dígitos vai como CNPJ (company_document). */
export function corpoCarrinho(e: EntradaEtiqueta) {
  const parte = (x: Endereco) => {
    const doc = (x.documento ?? "").replace(/\D/g, "");
    return {
      name: x.nome.slice(0, 60),
      phone: (x.telefone ?? "").replace(/\D/g, "") || undefined,
      email: x.email || undefined,
      ...(doc.length === 14 ? { company_document: doc } : doc.length === 11 ? { document: doc } : {}),
      address: x.endereco,
      complement: x.complemento || undefined,
      number: x.numero || "S/N",
      district: x.bairro,
      city: x.cidade,
      state_abbr: x.uf,
      country_id: "BR",
      postal_code: soDigitosCep(x.cep),
    };
  };
  return {
    service: e.servicoId,
    from: parte(e.remetente),
    to: parte(e.destinatario),
    products: e.produtos.map((p) => ({ name: p.nome.slice(0, 80), quantity: p.quantidade, unitary_value: p.valor })),
    volumes: [{ height: e.pacote.altura, width: e.pacote.largura, length: e.pacote.comprimento, weight: e.pacote.peso }],
    options: { insurance_value: Math.round(e.valorDeclarado * 100) / 100, receipt: false, own_hand: false, reverse: false, non_commercial: true, tags: [{ tag: e.numeroPedido }] },
  };
}

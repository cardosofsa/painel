/**
 * Cobrança das assinaturas (Fase 10.9), PLUGÁVEL. Código de SERVIDOR.
 *
 * Nenhum provedor está ligado ainda (Mercado Pago, Asaas, Stripe… a escolher). Enquanto
 * `provedorCobranca()` devolver null:
 *   * "Assinar" em Configurações → Plano registra o PEDIDO (`solicitar_plano`);
 *   * o master ativa em Admin → conta → Plano (`admin_definir_assinatura`).
 *
 * Para ligar um provedor: implementar `ProvedorCobranca` num arquivo ao lado (ex.:
 * `asaas.ts`), devolvê-lo aqui quando as variáveis dele existirem e tratar o webhook em
 * `/api/cobranca/webhook`, gravando a assinatura com a service key (status, período,
 * provedor_ref). Nada nas telas muda.
 */

export interface CheckoutCobranca {
  /** Página de pagamento do provedor (o navegador é redirecionado para ela). */
  url: string;
}

export interface EventoCobranca {
  userId: string;
  planoId: string;
  status: "ativa" | "atrasada" | "cancelada";
  periodoFim: string | null;
  provedorRef: string;
}

export interface ProvedorCobranca {
  id: string;
  /** Cria (ou reaproveita) a assinatura no provedor e devolve o checkout. */
  criarCheckout(entrada: { userId: string; email: string; plano: { id: string; nome: string; preco: number }; voltaUrl: string }): Promise<CheckoutCobranca>;
  /** Valida a assinatura do webhook e traduz o evento. null = evento ignorado. */
  interpretarWebhook(req: Request): Promise<EventoCobranca | null>;
}

export function provedorCobranca(): ProvedorCobranca | null {
  return null;
}

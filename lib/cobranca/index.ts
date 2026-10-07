import "server-only";
import { asaas, configAsaas } from "./asaas";
import type { ProvedorCobranca } from "./tipos";

/**
 * Cobrança das assinaturas (Fase 10.9), PLUGÁVEL. Código de SERVIDOR.
 *
 * Provedor ligado hoje: Asaas (`asaas.ts`), quando `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN`
 * existem (ver `docs/cobranca-asaas.md`). Enquanto `provedorCobranca()` devolver null:
 *   * "Assinar" em Configurações → Plano registra o PEDIDO (`solicitar_plano`);
 *   * o master ativa em Admin → conta → Plano (`admin_definir_assinatura`).
 *
 * Com provedor: "Assinar" leva ao checkout dele e `/api/cobranca/webhook` grava a assinatura
 * com a service key (status, período, provedor_ref), sempre filtrando `user_id` explícito.
 * Outro provedor no futuro: implementar `ProvedorCobranca` ao lado e escolher aqui.
 */

export type { CheckoutCobranca, EntradaCheckout, EventoCobranca, ProvedorCobranca } from "./tipos";
export { ErroWebhookNaoAutorizado } from "./tipos";

export function provedorCobranca(): ProvedorCobranca | null {
  const config = configAsaas();
  return config ? asaas(config) : null;
}

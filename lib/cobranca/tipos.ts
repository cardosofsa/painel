/**
 * Tipos da cobrança plugável (10.9). Sem `server-only`: as partes puras (e os testes)
 * importam daqui; o que fala com o provedor fica em `asaas.ts`/`index.ts`.
 */

export interface CheckoutCobranca {
  /** Página de pagamento do provedor (o navegador é redirecionado para ela). */
  url: string;
}

export interface EventoCobranca {
  userId: string;
  planoId: string;
  status: "ativa" | "atrasada" | "cancelada";
  /** Novo fim do período pago (só em `ativa`); null = mantém o que está gravado. */
  periodoFim: string | null;
  /**
   * Até quando ESTA cobrança cobriria se paga. Serve para descartar evento fora de ordem:
   * um "vencida" de uma cobrança que o período gravado já cobre (foi paga depois).
   */
  coberturaAte?: string | null;
  /** Id da assinatura no provedor (não o da cobrança): é o que liga eventos da mesma conta. */
  provedorRef: string;
}

export interface EntradaCheckout {
  userId: string;
  email: string;
  /** CPF/CNPJ do pagador: o provedor pode exigir para criar o cliente. */
  documento?: string | null;
  plano: { id: string; nome: string; preco: number };
  voltaUrl: string;
}

export interface ProvedorCobranca {
  id: string;
  /** Cria (ou reaproveita) a assinatura no provedor e devolve o checkout. */
  criarCheckout(entrada: EntradaCheckout): Promise<CheckoutCobranca>;
  /**
   * Valida a autenticação do webhook e traduz o evento. null = evento ignorado.
   * Lança `ErroWebhookNaoAutorizado` quando o token não confere.
   */
  interpretarWebhook(req: Request): Promise<EventoCobranca | null>;
  /** Encerra uma assinatura no provedor (troca de plano, ida para o grátis). */
  cancelarAssinatura?(provedorRef: string): Promise<void>;
}

export class ErroWebhookNaoAutorizado extends Error {
  constructor() {
    super("Webhook de cobrança sem autenticação válida.");
    this.name = "ErroWebhookNaoAutorizado";
  }
}

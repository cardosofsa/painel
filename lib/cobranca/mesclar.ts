import type { EventoCobranca } from "./tipos";

/**
 * O que um evento do webhook faz com a assinatura gravada. Puro (coberto por
 * `mesclar.test.ts`) para a rota ser idempotente e aguentar evento repetido ou fora de ordem:
 *
 *   * pago (`ativa`): ativa o plano do evento e estende o período, nunca o encurta quando é
 *     a mesma assinatura do provedor. Assinatura NOVA (troca de plano) assume o lugar e a
 *     antiga sai em `cancelarRef` para a rota encerrar no provedor;
 *   * vencida (`atrasada`) e encerrada (`cancelada`) só valem para a assinatura que está
 *     gravada: a antiga de uma troca de plano, ou a primeira fatura nunca paga de quem está no
 *     teste, não rebaixam ninguém. Vencida de uma cobrança que o período já cobre (paga depois)
 *     é descartada;
 *   * o mesmo evento duas vezes dá `gravar: false` na segunda.
 */

export interface AssinaturaGravada {
  plano_id: string;
  status: string;
  periodo_fim: string | null;
  provedor: string | null;
  provedor_ref: string | null;
}

export interface LinhaAssinatura {
  plano_id: string;
  status: EventoCobranca["status"];
  periodo_fim: string | null;
  provedor: string;
  provedor_ref: string;
  plano_solicitado?: null;
  solicitado_em?: null;
}

export type DecisaoEvento = { gravar: false; motivo: string } | { gravar: true; linha: LinhaAssinatura; cancelarRef: string | null };

function instante(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function decidirEvento(atual: AssinaturaGravada | null, evento: EventoCobranca, provedorId: string): DecisaoEvento {
  const mesmaRef = !!atual && atual.provedor === provedorId && atual.provedor_ref === evento.provedorRef;
  const fimAtual = instante(atual?.periodo_fim);

  if (evento.status === "ativa") {
    const fimEvento = instante(evento.periodoFim);
    if (fimEvento === null) return { gravar: false, motivo: "pagamento sem período" };
    const periodo = mesmaRef && fimAtual !== null && fimAtual > fimEvento ? atual!.periodo_fim : evento.periodoFim;
    if (mesmaRef && atual!.status === "ativa" && atual!.plano_id === evento.planoId && fimAtual !== null && fimAtual >= fimEvento) {
      return { gravar: false, motivo: "período já cobre este pagamento" };
    }
    const anterior = atual && atual.provedor === provedorId && atual.provedor_ref && !mesmaRef && atual.status !== "cancelada" ? atual.provedor_ref : null;
    return {
      gravar: true,
      linha: { plano_id: evento.planoId, status: "ativa", periodo_fim: periodo, provedor: provedorId, provedor_ref: evento.provedorRef, plano_solicitado: null, solicitado_em: null },
      cancelarRef: anterior,
    };
  }

  if (!mesmaRef) return { gravar: false, motivo: "assinatura que não é a gravada" };
  if (atual!.status === "cancelada") return { gravar: false, motivo: "já cancelada" };
  if (atual!.status === evento.status) return { gravar: false, motivo: "status já aplicado" };

  if (evento.status === "atrasada") {
    const cobertura = instante(evento.coberturaAte);
    if (fimAtual !== null && cobertura !== null && fimAtual >= cobertura) return { gravar: false, motivo: "cobrança já coberta pelo período" };
  }

  return {
    gravar: true,
    linha: { plano_id: atual!.plano_id, status: evento.status, periodo_fim: atual!.periodo_fim, provedor: provedorId, provedor_ref: evento.provedorRef },
    cancelarRef: null,
  };
}

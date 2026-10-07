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
 *   * assinatura ENCERRADA (`provedor_refs_encerradas`: a antiga de uma troca de plano, a que
 *     foi cancelada na ida para o Grátis) não mexe em nada, nem se uma fatura pendente dela
 *     for paga depois;
 *   * estorno/chargeback/exclusão (`estornada`) tira do período o que aquela cobrança cobria,
 *     uma vez só (`provedor_pagamentos_estornados`); pagamento já estornado não volta a valer;
 *   * ida para o Grátis (`cancelamento_agendado`): o "cancelada" que o provedor manda não
 *     rebaixa; a ref entra nas encerradas e o plano pago vale até `periodo_fim`;
 *   * o período do provedor fica em `periodo_fim_provedor`; o efetivo (`periodo_fim`) é ele +
 *     `dias_bonus` (bônus de indicação), para a renovação não engolir o bônus;
 *   * o mesmo evento duas vezes dá `gravar: false` na segunda.
 */

export interface AssinaturaGravada {
  plano_id: string;
  status: string;
  periodo_fim: string | null;
  provedor: string | null;
  provedor_ref: string | null;
  /** Colunas da 0082 (ausentes = linha anterior a ela). */
  periodo_fim_provedor?: string | null;
  dias_bonus?: number | null;
  provedor_refs_encerradas?: string[] | null;
  provedor_pagamentos_estornados?: string[] | null;
  cancelamento_agendado?: boolean | null;
}

export interface LinhaAssinatura {
  plano_id: string;
  /** Status gravado (o do evento, ou o atual quando o evento só mexe no período). */
  status: string;
  periodo_fim: string | null;
  provedor: string;
  provedor_ref: string;
  periodo_fim_provedor?: string | null;
  provedor_refs_encerradas?: string[];
  provedor_pagamentos_estornados?: string[];
  ultimo_pagamento_ref?: string | null;
  cancelamento_agendado?: boolean;
  plano_solicitado?: null;
  solicitado_em?: null;
}

export type DecisaoEvento = { gravar: false; motivo: string } | { gravar: true; linha: LinhaAssinatura; cancelarRef: string | null };

const DIA_MS = 86_400_000;

function instante(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Período efetivo = período do provedor + dias de bônus. Sem bônus, devolve a data como veio. */
export function somarBonus(iso: string | null, dias: number): string | null {
  const t = instante(iso);
  if (t === null || !dias) return iso;
  return new Date(t + dias * DIA_MS).toISOString();
}

export function decidirEvento(atual: AssinaturaGravada | null, evento: EventoCobranca, provedorId: string): DecisaoEvento {
  const doProvedor = !!atual && atual.provedor === provedorId;
  const encerradas = (doProvedor && atual!.provedor_refs_encerradas) || [];
  const estornados = (doProvedor && atual!.provedor_pagamentos_estornados) || [];
  if (encerradas.includes(evento.provedorRef)) return { gravar: false, motivo: "assinatura já encerrada" };
  if (evento.pagamentoRef && estornados.includes(evento.pagamentoRef)) return { gravar: false, motivo: "pagamento já estornado" };

  const mesmaRef = doProvedor && atual!.provedor_ref === evento.provedorRef;
  const bonus = Math.max(0, Math.trunc(Number(atual?.dias_bonus) || 0));
  // Base de comparação: o período do PROVEDOR (sem bônus). Linha antiga: o período gravado.
  const fimProvIso = mesmaRef ? (atual!.periodo_fim_provedor ?? atual!.periodo_fim) : null;
  const fimProv = instante(fimProvIso);

  if (evento.status === "ativa") {
    const fimEvento = instante(evento.periodoFim);
    if (fimEvento === null) return { gravar: false, motivo: "pagamento sem período" };
    if (mesmaRef && atual!.status === "ativa" && atual!.plano_id === evento.planoId && fimProv !== null && fimProv >= fimEvento) {
      return { gravar: false, motivo: "período já cobre este pagamento" };
    }
    const periodo = mesmaRef && fimProv !== null && fimProv > fimEvento ? fimProvIso : evento.periodoFim;
    const linha: LinhaAssinatura = {
      plano_id: evento.planoId,
      status: "ativa",
      periodo_fim: somarBonus(periodo, bonus),
      periodo_fim_provedor: periodo,
      provedor: provedorId,
      provedor_ref: evento.provedorRef,
      ultimo_pagamento_ref: evento.pagamentoRef ?? null,
      plano_solicitado: null,
      solicitado_em: null,
    };
    let anterior: string | null = null;
    if (!mesmaRef) {
      // Assinatura nova assume. A anterior entra nas encerradas (fatura dela paga depois não
      // reativa nada) e, se ainda cobra, sai para a rota cancelar no provedor.
      const antiga = doProvedor ? atual!.provedor_ref : null;
      if (antiga) {
        if (!encerradas.includes(antiga)) linha.provedor_refs_encerradas = [...encerradas, antiga];
        if (atual!.status !== "cancelada" && !atual!.cancelamento_agendado) anterior = antiga;
      }
      linha.cancelamento_agendado = false;
    }
    return { gravar: true, linha, cancelarRef: anterior };
  }

  if (!mesmaRef) return { gravar: false, motivo: "assinatura que não é a gravada" };

  if (evento.status === "estornada") {
    const pagamento = evento.pagamentoRef;
    const ini = instante(evento.coberturaDe);
    const fim = instante(evento.coberturaAte);
    if (!pagamento || ini === null || fim === null || fim <= ini) return { gravar: false, motivo: "estorno sem cobrança identificável" };
    let novoProvIso = fimProvIso;
    if (fimProv !== null && fimProv > ini) {
      // Tira a duração desta cobrança do fim; nunca antes do início dela (pagamentos
      // posteriores continuam valendo).
      novoProvIso = new Date(Math.max(ini, fimProv - (fim - ini))).toISOString();
    }
    return {
      gravar: true,
      linha: {
        plano_id: atual!.plano_id,
        status: atual!.status,
        periodo_fim: novoProvIso === fimProvIso ? atual!.periodo_fim : somarBonus(novoProvIso, bonus),
        periodo_fim_provedor: novoProvIso,
        provedor: provedorId,
        provedor_ref: evento.provedorRef,
        provedor_pagamentos_estornados: [...estornados, pagamento],
      },
      cancelarRef: null,
    };
  }

  if (evento.status === "cancelada" && atual!.cancelamento_agendado) {
    // Ida para o Grátis: o plano pago vale até o fim do período; só encerra a ref.
    return {
      gravar: true,
      linha: { plano_id: atual!.plano_id, status: atual!.status, periodo_fim: atual!.periodo_fim, provedor: provedorId, provedor_ref: evento.provedorRef, provedor_refs_encerradas: [...encerradas, evento.provedorRef] },
      cancelarRef: null,
    };
  }

  if (atual!.status === "cancelada") return { gravar: false, motivo: "já cancelada" };
  if (atual!.status === evento.status) return { gravar: false, motivo: "status já aplicado" };

  if (evento.status === "atrasada") {
    const cobertura = instante(evento.coberturaAte);
    if (fimProv !== null && cobertura !== null && fimProv >= cobertura) return { gravar: false, motivo: "cobrança já coberta pelo período" };
  }

  return {
    gravar: true,
    linha: { plano_id: atual!.plano_id, status: evento.status, periodo_fim: atual!.periodo_fim, provedor: provedorId, provedor_ref: evento.provedorRef },
    cancelarRef: null,
  };
}

"use client";

import { useEffect, useState } from "react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/Badge";
import { formatBRL, formatarDataIso, hojeIsoLocal } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { obterParcelasVenda, marcarParcelaPaga, type ParcelaVenda } from "@/app/(painel)/financeiro/actions";
import type { Conta } from "@/app/(painel)/financeiro/FinanceiroClient";
import { cobraEncargos, encargosAtraso, faltaDaParcela, pagamentoParcela, type RegraEncargos } from "@/lib/crediario";

/**
 * Tabela de parcelas de uma venda fiado parcelada (migração 0030): parcela, valor, status,
 * data de pagamento. Registrar pagamento pede valor recebido, data e conta — pagar menos
 * que o que falta deixa a parcela em aberto acumulando (0083); quando a última fica paga, o
 * registro "pai" em contas_a_pagar_receber muda de status sozinho (ver `marcar_parcela_paga`
 * no banco), sem precisar de ação nenhuma aqui.
 */
export function ParcelasVendaModal({
  vendaId,
  vendaNumero,
  contas,
  onClose,
  regra = null,
}: {
  /** Multa e juros por atraso (0065): a parcela atrasada já sugere o valor atualizado. */
  regra?: RegraEncargos | null;
  vendaId: string | null;
  vendaNumero: string | null;
  contas: Conta[];
  onClose: () => void;
}) {
  const [carregando, setCarregando] = useState(true);
  const [parcelas, setParcelas] = useState<ParcelaVenda[]>([]);
  const [editando, setEditando] = useState<ParcelaVenda | null>(null);
  const [valorPago, setValorPago] = useState(0);
  const [dataPagamento, setDataPagamento] = useState(() => hojeIsoLocal());
  const [contaId, setContaId] = useState<string | null>(contas[0]?.id ?? null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!vendaId) return;
    executarComToast(obterParcelasVenda(vendaId), { erro: "Erro ao carregar parcelas" })
      .then((r) => {
        if (r.ok) setParcelas(r.dado);
      })
      .finally(() => setCarregando(false));
  }, [vendaId]);

  function abrirPagamento(p: ParcelaVenda) {
    setEditando(p);
    setValorPago(encargosAtraso(faltaDaParcela(p.valor, p.valor_pago), p.data_vencimento, hojeIsoLocal(), regra).total);
    setDataPagamento(hojeIsoLocal());
    setContaId(contas[0]?.id ?? null);
  }

  async function confirmarPagamento() {
    if (!editando || !contaId) return;
    setSalvando(true);
    const efeito = pagamentoParcela(editando.valor, editando.valor_pago, valorPago);
    const r = await executarComToast(marcarParcelaPaga(editando.id, valorPago, dataPagamento, contaId), {
      sucesso: efeito.quitada
        ? `Parcela ${editando.numero}/${editando.total_parcelas} paga`
        : `Pagamento parcial registrado: faltam ${formatBRL(efeito.falta)} da parcela ${editando.numero}/${editando.total_parcelas}`,
      erro: "Erro ao registrar o pagamento da parcela",
    });
    setSalvando(false);
    if (r.ok) {
      setParcelas((prev) =>
        prev.map((p) =>
          p.id === editando.id
            ? { ...p, status: efeito.quitada ? "paga" : "pendente", data_pagamento: dataPagamento, valor_pago: efeito.valorPago }
            : p,
        ),
      );
      setEditando(null);
    }
  }

  const hoje = hojeIsoLocal();

  return (
    <Modal open={!!vendaId} onClose={onClose} title={vendaNumero ? `Parcelas — Venda ${vendaNumero}` : ""}>
      {carregando ? (
        <p className="text-sm text-text-tertiary py-6 text-center">Carregando…</p>
      ) : parcelas.length === 0 ? (
        <p className="text-sm text-text-tertiary py-6 text-center">Nenhuma parcela encontrada para esta venda.</p>
      ) : (
        <div className="border border-border rounded-md divide-y divide-border">
          {parcelas.map((p) => {
            const atrasada = p.status === "pendente" && p.data_vencimento < hoje;
            return (
              <div key={p.id} className="px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-text-primary">
                      {p.numero}ª parcela de {p.total_parcelas}
                    </div>
                    <div className="text-xs text-text-tertiary">
                      {p.status === "paga"
                        ? `Paga em ${formatarDataIso(p.data_pagamento)}`
                        : `Vence em ${formatarDataIso(p.data_vencimento)}`}
                    </div>
                    {p.status === "pendente" && (p.valor_pago ?? 0) > 0 && (
                      <div className="text-xs text-text-secondary">
                        Pago {formatBRL(p.valor_pago ?? 0)} · falta {formatBRL(faltaDaParcela(p.valor, p.valor_pago))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-text-primary">{formatBRL(p.valor)}</span>
                    <StatusChip
                      label={p.status === "paga" ? "Paga" : atrasada ? "Atrasada" : "Em aberto"}
                      tone={p.status === "paga" ? "positive" : atrasada ? "negative" : "neutral"}
                    />
                  </div>
                </div>
                {p.status === "pendente" && editando?.id !== p.id && (
                  <button onClick={() => abrirPagamento(p)} className="text-xs text-accent hover:underline mt-1.5">
                    Registrar pagamento
                  </button>
                )}
                {editando?.id === p.id && (
                  <div className="mt-2.5 pt-2.5 border-t border-border space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <FormField label="Valor recebido (R$)">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={inputClass}
                          value={valorPago || ""}
                          onChange={(e) => setValorPago(Number(e.target.value) || 0)}
                        />
                      </FormField>
                      <FormField label="Data do recebimento">
                        <input
                          type="date"
                          className={inputClass}
                          value={dataPagamento}
                          onChange={(e) => setDataPagamento(e.target.value)}
                        />
                      </FormField>
                    </div>
                    {(() => {
                      const falta = faltaDaParcela(p.valor, p.valor_pago);
                      const e = encargosAtraso(falta, p.data_vencimento, hoje, regra);
                      if (!cobraEncargos(regra) || e.dias === 0) return null;
                      return (
                        <p className="text-xs text-text-secondary">
                          {e.dias} dia(s) de atraso: {formatBRL(falta)} + multa {formatBRL(e.multa)} + juros {formatBRL(e.juros)} = <strong className="text-text-primary">{formatBRL(e.total)}</strong>. Mude o valor se for cobrar diferente; o que passar da parcela fica registrado como juros e multa.
                        </p>
                      );
                    })()}
                    {(() => {
                      const efeito = pagamentoParcela(p.valor, p.valor_pago, valorPago);
                      if (valorPago <= 0 || efeito.quitada) return null;
                      return (
                        <p className="text-xs text-text-secondary">
                          Pagamento parcial: a parcela continua em aberto e ficam faltando <strong className="text-text-primary">{formatBRL(efeito.falta)}</strong>.
                        </p>
                      );
                    })()}
                    <FormField label="Conta que recebeu">
                      <select className={inputClass} value={contaId ?? ""} onChange={(e) => setContaId(e.target.value || null)}>
                        <option value="">Selecione…</option>
                        {contas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nome}
                          </option>
                        ))}
                      </select>
                    </FormField>
                    <div className="flex gap-2">
                      <Button variant="secondary" className="flex-1" onClick={() => setEditando(null)}>
                        Voltar
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={confirmarPagamento}
                        loading={salvando}
                        disabled={valorPago <= 0 || !contaId}
                      >
                        Confirmar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatBRL, hojeIsoLocal, numeroOuNulo } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { pagarFaturaCartao } from "@/app/(painel)/financeiro/fatura-actions";

/** Pagar a fatura de um cartão com dinheiro de uma conta. Montado só quando aberto. */
export function PagarFaturaModal({
  cartao,
  contas,
  onClose,
}: {
  cartao: { id: string; nome: string; divida: number };
  /** Só contas comuns: cartão não paga cartão. */
  contas: { id: string; nome: string; saldo: number }[];
  onClose: () => void;
}) {
  const hoje = hojeIsoLocal();
  const [valor, setValor] = useState(String(cartao.divida).replace(".", ","));
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [data, setData] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const v = numeroOuNulo(valor);
  const invalido = v === null || v <= 0 || v > cartao.divida + 0.005 || !contaId;

  async function confirmar() {
    if (invalido || v === null) return;
    setSalvando(true);
    const r = await executarComToast(pagarFaturaCartao({ cartao_id: cartao.id, conta_id: contaId, valor: v, data }), { erro: "Erro ao pagar a fatura" });
    setSalvando(false);
    if (!r.ok) return;
    toast.success(r.dado.dividaRestante > 0 ? `Fatura paga. Ainda restam ${formatBRL(r.dado.dividaRestante)}.` : "Fatura quitada. Limite liberado.");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Pagar fatura — ${cartao.nome}`}>
      <div className="space-y-3">
        <p className="text-sm text-text-secondary">
          Fatura em aberto: <span className="font-mono text-text-primary">{formatBRL(cartao.divida)}</span>. O valor sai da conta escolhida e o limite do cartão é liberado.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="Valor pago (R$)">
            <input type="text" inputMode="decimal" className={inputClass} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" />
          </FormField>
          <FormField label="Data do pagamento">
            <input type="date" className={inputClass} value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
          </FormField>
        </div>
        <FormField label="Pagar com a conta">
          <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
            <option value="">Selecione…</option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} ({formatBRL(c.saldo)})
              </option>
            ))}
          </select>
        </FormField>
        {v !== null && v > cartao.divida + 0.005 && <p className="text-xs text-negative">O valor passa da fatura em aberto.</p>}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" className="flex-1" onClick={confirmar} loading={salvando} disabled={invalido}>
            Pagar fatura
          </Button>
        </div>
      </div>
    </Modal>
  );
}

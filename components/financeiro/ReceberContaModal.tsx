"use client";

import { useState } from "react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatBRL, formatarDataIso, hojeIsoLocal, numeroOuNulo } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { cobraEncargos, encargosAtraso, type RegraEncargos } from "@/lib/crediario";
import { receberConta } from "@/app/(painel)/financeiro/pagamentos-actions";

export interface ContaParaReceber {
  id: string;
  descricao: string;
  valor: number;
  valor_pago: number;
  data_vencimento: string;
  conta_id: string | null;
  /** Crediário (venda) cobra encargos; conta avulsa não. */
  crediario: boolean;
}

/**
 * Receber conta a receber com valor livre (0065). Crediário atrasado já sugere o valor com
 * multa e juros. Montado com `key` pela tela: o estado nasce da conta escolhida.
 */
export function ReceberContaModal({
  conta,
  contas,
  regra,
  onClose,
}: {
  conta: ContaParaReceber | null;
  contas: { id: string; nome: string }[];
  regra: RegraEncargos | null;
  onClose: () => void;
}) {
  const hoje = hojeIsoLocal();
  const restante = conta ? Math.max(0, Math.round((conta.valor - conta.valor_pago) * 100) / 100) : 0;
  const enc = conta && conta.crediario ? encargosAtraso(restante, conta.data_vencimento, hoje, regra) : null;
  const [valor, setValor] = useState(() => (enc ? enc.total : restante).toFixed(2));
  const [data, setData] = useState(hoje);
  const [contaId, setContaId] = useState(conta?.conta_id ?? contas[0]?.id ?? "");
  const [quitar, setQuitar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const v = numeroOuNulo(valor);

  async function confirmar() {
    if (!conta || v === null || v <= 0 || !contaId) return;
    setSalvando(true);
    const r = await executarComToast(receberConta({ id: conta.id, valor: v, data, conta_id: contaId, quitar }), { sucesso: "Recebimento registrado", erro: "Erro ao registrar o recebimento" });
    setSalvando(false);
    if (r.ok) onClose();
  }

  return (
    <Modal open={!!conta} onClose={onClose} title={conta ? `Receber — ${conta.descricao}` : ""}>
      {conta && (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Falta receber <strong className="text-text-primary">{formatBRL(restante)}</strong>
            {conta.valor_pago > 0 && ` (de ${formatBRL(conta.valor)})`} · venceu/vence em {formatarDataIso(conta.data_vencimento)}.
          </p>
          {enc && cobraEncargos(regra) && enc.dias > 0 && (
            <p className="text-xs text-text-secondary">
              {enc.dias} dia(s) de atraso: multa {formatBRL(enc.multa)} + juros {formatBRL(enc.juros)} = <strong className="text-text-primary">{formatBRL(enc.total)}</strong>. O que passar do devido fica registrado como juros e multa.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Valor recebido (R$)">
              <input type="text" inputMode="decimal" className={inputClass} value={valor} onChange={(e) => setValor(e.target.value)} />
            </FormField>
            <FormField label="Data do recebimento">
              <input type="date" className={inputClass} value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Conta que recebeu">
            <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
              <option value="">Selecione…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </FormField>
          {v !== null && v > 0 && v < restante && (
            <label className="flex items-start gap-2 text-xs text-text-secondary">
              <input type="checkbox" className="mt-0.5" checked={quitar} onChange={(e) => setQuitar(e.target.checked)} />
              <span>Dar por quitada (desconto de {formatBRL(restante - v)}). Sem marcar, o resto continua em aberto.</span>
            </label>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" className="flex-1" onClick={confirmar} loading={salvando} disabled={v === null || v <= 0 || !contaId}>
              Confirmar recebimento
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

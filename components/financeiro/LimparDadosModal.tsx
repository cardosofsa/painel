"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { hojeIsoLocal } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import {
  avaliarLimpezaFinanceiro,
  limparDadosFinanceiros,
  type EscopoLimpeza,
  type ImpactoLimpeza,
} from "@/app/(painel)/financeiro/actions";

/**
 * Apagar lançamentos financeiros por período.
 *
 * Ganhou arquivo próprio pelo peso do que faz: é a única operação destrutiva em massa do
 * sistema, e o fluxo de duas etapas (avaliar o impacto, depois confirmar) é o que impede
 * alguém apagar seis meses de caixa por engano num modal de 1.000 linhas.
 */
export function LimparDadosModal({
  open,
  onClose,
  confirm,
}: {
  open: boolean;
  onClose: () => void;
  confirm: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const [pending, startTransition] = useTransition();
  const hoje = new Date();
  const primeiroDiaMes = hojeIsoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [dataInicio, setDataInicio] = useState(primeiroDiaMes);
  const [dataFim, setDataFim] = useState(hojeIsoLocal(hoje));
  const [escopo, setEscopo] = useState<EscopoLimpeza>({ lancamentos: true, contasPagarReceber: false });
  const [impacto, setImpacto] = useState<ImpactoLimpeza | null>(null);
  const [avaliando, setAvaliando] = useState(false);

  function fechar() {
    setImpacto(null);
    onClose();
  }

  function limparImpacto() {
    setImpacto(null);
  }

  async function avaliar() {
    setAvaliando(true);
    const r = await executarComToast(avaliarLimpezaFinanceiro(dataInicio, dataFim, escopo), {
      erro: "Erro ao avaliar impacto",
    });
    setAvaliando(false);
    if (r.ok) setImpacto(r.dado);
  }

  // Nome antigo era `executar`, que passou a colidir com o helper de action do
  // `lib/acao`. `apagar` também diz melhor o que o botão faz.
  async function apagar() {
    if (!impacto) return;
    const total = impacto.lancamentos + impacto.contasPagarReceber;
    if (total === 0) {
      toast("Nenhum registro encontrado nesse período");
      return;
    }
    let mensagem = `${total} registro(s) serão apagados definitivamente para o período selecionado.`;
    if (impacto.contasVinculadasCompra > 0) {
      mensagem += ` ${impacto.contasVinculadasCompra} título(s) vêm de pedidos de compra — apagar mesmo assim?`;
    }
    const ok = await confirm({ title: "Apagar dados do Financeiro?", message: mensagem, confirmLabel: "Apagar" });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(limparDadosFinanceiros(dataInicio, dataFim, escopo), { sucesso: "Dados removidos", erro: "Erro ao limpar dados" });
      if (r.ok) {
        fechar();
      }
    });
  }

  return (
    <Modal open={open} onClose={fechar} title="Limpar Dados do Financeiro">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="De">
          <input
            type="date"
            className={inputClass}
            value={dataInicio}
            onChange={(e) => {
              setDataInicio(e.target.value);
              limparImpacto();
            }}
          />
        </FormField>
        <FormField label="Até">
          <input
            type="date"
            className={inputClass}
            value={dataFim}
            onChange={(e) => {
              setDataFim(e.target.value);
              limparImpacto();
            }}
          />
        </FormField>
      </div>
      <div className="space-y-1 mb-4">
        {(
          [
            { key: "lancamentos", label: "Lançamentos (entradas/saídas)" },
            { key: "contasPagarReceber", label: "Contas a Pagar / Receber" },
          ] as const
        ).map((item) => (
          <label key={item.key} className="flex items-center gap-2 cursor-pointer py-1">
            <input
              type="checkbox"
              checked={escopo[item.key]}
              onChange={(e) => {
                setEscopo((prev) => ({ ...prev, [item.key]: e.target.checked }));
                limparImpacto();
              }}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-sm text-text-primary">{item.label}</span>
          </label>
        ))}
      </div>

      {impacto && (
        <div className="bg-surface-2 border border-border rounded-md p-3 mb-4 text-sm space-y-1">
          <div className="text-text-secondary">Serão apagados:</div>
          {escopo.lancamentos && <div className="text-text-primary">{impacto.lancamentos} lançamento(s)</div>}
          {escopo.contasPagarReceber && (
            <div className="text-text-primary">{impacto.contasPagarReceber} conta(s) a pagar/receber</div>
          )}
          {impacto.contasVinculadasCompra > 0 && (
            <div className="text-negative">{impacto.contasVinculadasCompra} vêm de pedidos de compra</div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={fechar}>
          Cancelar
        </Button>
        {!impacto ? (
          <Button variant="secondary" className="flex-1" onClick={avaliar} disabled={avaliando}>
            {avaliando ? "Avaliando…" : "Avaliar Impacto"}
          </Button>
        ) : (
          <Button variant="destructive" className="flex-1" onClick={apagar} loading={pending}>
            Apagar
          </Button>
        )}
      </div>
    </Modal>
  );
}

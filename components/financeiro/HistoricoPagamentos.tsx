"use client";

import { useCallback, useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { formatBRL, formatarDataIso, hojeIsoLocal, numeroOuNulo } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { restanteParcela, resumoPagamento, situacaoParcela, SITUACAO_PARCELA, type ParcelaPagar } from "@/lib/pagamentos";
import { estornarPagamento, obterPagamentos, pagarConta, type AlvoPagamentos } from "@/app/(painel)/financeiro/pagamentos-actions";

export interface ContaOpcao {
  id: string;
  nome: string;
}

/**
 * Histórico de pagamentos de um pedido de compra (0064): cada parcela com vencimento,
 * valor, o que foi pago (data, valor, conta) e a situação. Registrar pagamento aceita valor
 * livre — menos que o devido deixa o resto pendente, "dar por quitada" fecha com desconto.
 * Usado no detalhe do pedido (Compras) e no Financeiro.
 */
export function HistoricoPagamentos({ alvo, contas }: { alvo: AlvoPagamentos; contas: ContaOpcao[] }) {
  const [carregando, setCarregando] = useState(true);
  const [parcelas, setParcelas] = useState<ParcelaPagar[]>([]);
  const [pagando, setPagando] = useState<ParcelaPagar | null>(null);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(() => hojeIsoLocal());
  const [contaId, setContaId] = useState("");
  const [quitar, setQuitar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();

  const chave = "pedidoId" in alvo ? `pedido:${alvo.pedidoId}` : `conta:${alvo.contaId}`;
  const buscar = useCallback(() => {
    const [tipo, id] = chave.split(":");
    return executarComToast(obterPagamentos(tipo === "pedido" ? { pedidoId: id } : { contaId: id }), { erro: "Erro ao carregar os pagamentos" });
  }, [chave]);

  async function carregar() {
    const r = await buscar();
    if (r.ok) setParcelas(r.dado);
  }

  useEffect(() => {
    buscar()
      .then((r) => {
        if (r.ok) setParcelas(r.dado);
      })
      .finally(() => setCarregando(false));
  }, [buscar]);

  function abrir(p: ParcelaPagar) {
    setPagando(p);
    setValor(restanteParcela(p).toFixed(2));
    setData(hojeIsoLocal());
    setContaId(p.conta_id ?? contas[0]?.id ?? "");
    setQuitar(false);
  }

  async function confirmar() {
    const v = numeroOuNulo(valor);
    if (!pagando || v === null || v <= 0 || !contaId) return;
    setSalvando(true);
    const r = await executarComToast(pagarConta({ id: pagando.id, valor: v, data, conta_id: contaId, quitar }), { erro: "Erro ao registrar o pagamento" });
    setSalvando(false);
    if (!r.ok) return;
    setPagando(null);
    await carregar();
  }

  async function estornar(pagamentoId: string, v: number) {
    const ok = await confirm({ title: "Estornar este pagamento?", message: `${formatBRL(v)} volta para a conta e a parcela fica em aberto de novo.`, confirmLabel: "Estornar" });
    if (!ok) return;
    const r = await executarComToast(estornarPagamento(pagamentoId), { sucesso: "Pagamento estornado", erro: "Erro ao estornar" });
    if (r.ok) await carregar();
  }

  if (carregando) return <p className="text-sm text-text-tertiary py-4 text-center">Carregando pagamentos…</p>;
  if (parcelas.length === 0) return <p className="text-sm text-text-tertiary py-4 text-center">Nenhuma parcela a pagar lançada.</p>;

  const hoje = hojeIsoLocal();
  const resumo = resumoPagamento(parcelas, hoje);
  const valorNum = numeroOuNulo(valor);
  const restante = pagando ? restanteParcela(pagando) : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-surface-2 px-2 py-2">
          <div className="text-[11px] text-text-tertiary">Parcelas pagas</div>
          <div className="font-mono text-text-primary">
            {resumo.quitadas}/{resumo.total}
          </div>
        </div>
        <div className="rounded-md bg-surface-2 px-2 py-2">
          <div className="text-[11px] text-text-tertiary">Já pago</div>
          <div className="font-mono text-text-primary">{formatBRL(resumo.pago)}</div>
        </div>
        <div className="rounded-md bg-surface-2 px-2 py-2">
          <div className="text-[11px] text-text-tertiary">Em aberto</div>
          <div className={`font-mono ${resumo.atrasado ? "text-negative" : "text-text-primary"}`}>{formatBRL(resumo.emAberto)}</div>
        </div>
      </div>

      <div className="border border-border rounded-md divide-y divide-border">
        {parcelas.map((p) => {
          const sit = situacaoParcela(p, hoje);
          return (
            <div key={p.id} className="px-3 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-text-primary">{(p.total_parcelas ?? 1) > 1 ? `${p.parcela_numero}ª parcela de ${p.total_parcelas}` : p.descricao}</div>
                  <div className="text-xs text-text-tertiary">Vence em {formatarDataIso(p.data_vencimento)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono text-text-primary">{formatBRL(p.valor)}</span>
                  <StatusChip label={SITUACAO_PARCELA[sit].rotulo} tone={SITUACAO_PARCELA[sit].tom} />
                </div>
              </div>

              {p.pagamentos.length > 0 && (
                <ul className="mt-1.5 space-y-1">
                  {p.pagamentos.map((g) => (
                    <li key={g.id} className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                      <span>
                        Pago {formatBRL(g.valor)} em {formatarDataIso(g.data)}
                        {g.conta_nome ? ` · ${g.conta_nome}` : ""}
                      </span>
                      <button type="button" onClick={() => estornar(g.id, g.valor)} className="inline-flex items-center gap-1 text-text-tertiary hover:text-negative" title="Estornar este pagamento">
                        <Undo2 size={12} /> Estornar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {p.status !== "pendente" && p.pagamentos.length === 0 && (
                <p className="mt-1 text-xs text-text-tertiary">{p.data_pagamento ? `Quitado em ${formatarDataIso(p.data_pagamento)}` : "Quitado (antes do histórico de pagamentos)"}</p>
              )}
              {p.status === "pendente" && p.valor_pago > 0 && <p className="mt-1 text-xs text-text-secondary">Falta {formatBRL(restanteParcela(p))}</p>}

              {p.status === "pendente" && pagando?.id !== p.id && (
                <button type="button" onClick={() => abrir(p)} className="text-xs text-accent hover:underline mt-1.5">
                  Registrar pagamento
                </button>
              )}
              {pagando?.id === p.id && (
                <div className="mt-2.5 pt-2.5 border-t border-border space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <FormField label="Valor pago (R$)">
                      <input type="text" inputMode="decimal" className={inputClass} value={valor} onChange={(e) => setValor(e.target.value)} />
                    </FormField>
                    <FormField label="Data do pagamento">
                      <input type="date" className={inputClass} value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
                    </FormField>
                  </div>
                  <FormField label="Conta de onde saiu">
                    <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
                      <option value="">Selecione…</option>
                      {contas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  {valorNum !== null && valorNum > 0 && valorNum < restante && (
                    <label className="flex items-start gap-2 text-xs text-text-secondary">
                      <input type="checkbox" className="mt-0.5" checked={quitar} onChange={(e) => setQuitar(e.target.checked)} />
                      <span>
                        Dar por quitada (desconto de {formatBRL(restante - valorNum)}). Sem marcar, os {formatBRL(restante - valorNum)} continuam em aberto.
                      </span>
                    </label>
                  )}
                  {valorNum !== null && valorNum > restante && <p className="text-xs text-text-secondary">Acima do valor da parcela: a diferença ({formatBRL(valorNum - restante)}) entra como juros.</p>}
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1" onClick={() => setPagando(null)}>
                      Voltar
                    </Button>
                    <Button variant="primary" className="flex-1" onClick={confirmar} loading={salvando} disabled={valorNum === null || valorNum <= 0 || !contaId}>
                      Confirmar pagamento
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {ConfirmDialog}
    </div>
  );
}

/** O histórico em modal (Financeiro → Contas a pagar). */
export function HistoricoPagamentosModal({ aberto, contas, onClose }: { aberto: { alvo: AlvoPagamentos; titulo: string } | null; contas: ContaOpcao[]; onClose: () => void }) {
  return (
    <Modal open={!!aberto} onClose={onClose} title={aberto ? `Pagamentos — ${aberto.titulo}` : ""}>
      {aberto && <HistoricoPagamentos key={aberto.titulo} alvo={aberto.alvo} contas={contas} />}
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Fechar
        </Button>
      </div>
    </Modal>
  );
}

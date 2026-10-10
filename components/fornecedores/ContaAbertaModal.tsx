"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/Badge";
import { RowMenu } from "@/components/ui/RowMenu";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL, formatarDataIso, hojeIsoLocal, numeroOuNulo } from "@/lib/format";
import { extratoComSaldo, ROTULO_LANCAMENTO, type LancamentoFornecedor } from "@/lib/conta-aberta";
import { estornarLancamentoFornecedor, lancarDividaAberta, listarContaAberta, pagarContaAberta } from "@/app/(painel)/fornecedores/conta-aberta-actions";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { toast } from "sonner";

/**
 * Conta em aberto com UM fornecedor (0095): o que você deve, sem parcelas nem vencimento. Compras
 * "deixadas em aberto" e dívida antiga sobem o saldo; cada Pix que você manda desce. Montado só
 * quando aberto (`key` por fornecedor): o estado nasce limpo.
 */
export function ContaAbertaModal({
  fornecedor,
  contas,
  onClose,
}: {
  fornecedor: { id: string; nome: string };
  /** Contas de onde sai o dinheiro do pagamento. */
  contas: { id: string; nome: string }[];
  onClose: () => void;
}) {
  const hoje = hojeIsoLocal();
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [lancamentos, setLancamentos] = useState<LancamentoFornecedor[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [painel, setPainel] = useState<"pagar" | "divida" | null>(null);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [descricao, setDescricao] = useState("");

  const aplicar = useCallback((r: Awaited<ReturnType<typeof executarComToast<{ lancamentos: LancamentoFornecedor[]; saldo: number }>>>) => {
    if (r.ok) {
      setLancamentos(r.dado.lancamentos);
      setErro(null);
    } else {
      setErro("Não foi possível carregar o extrato.");
    }
  }, []);

  /** Recarrega o extrato depois de um pagamento, lançamento ou estorno. */
  const carregar = useCallback(async () => {
    aplicar(await executarComToast(listarContaAberta(fornecedor.id), { erro: "Erro ao carregar o extrato" }));
  }, [fornecedor.id, aplicar]);

  // Primeira carga: o estado só muda dentro do `.then`, nunca de forma síncrona no efeito.
  useEffect(() => {
    let vivo = true;
    void executarComToast(listarContaAberta(fornecedor.id), { erro: "Erro ao carregar o extrato" }).then((r) => {
      if (vivo) aplicar(r);
    });
    return () => {
      vivo = false;
    };
  }, [fornecedor.id, aplicar]);

  const extrato = lancamentos ? extratoComSaldo(lancamentos) : [];
  const saldo = extrato[0]?.saldoApos ?? 0;
  const v = numeroOuNulo(valor);
  const valido = v !== null && v > 0 && (painel === "divida" || (painel === "pagar" && !!contaId && v <= saldo + 0.005));

  function abrir(p: "pagar" | "divida") {
    setPainel(p);
    setValor(p === "pagar" && saldo > 0 ? String(saldo).replace(".", ",") : "");
    setDescricao("");
    setData(hoje);
  }

  function confirmar() {
    if (!valido || v === null) return;
    startTransition(async () => {
      const r =
        painel === "pagar"
          ? await executarComToast(pagarContaAberta({ fornecedor_id: fornecedor.id, conta_id: contaId, valor: v, data, descricao: descricao.trim() || null }), { erro: "Erro ao registrar o pagamento" })
          : await executarComToast(lancarDividaAberta({ fornecedor_id: fornecedor.id, valor: v, data, descricao: descricao.trim() || null }), { erro: "Erro ao lançar a dívida" });
      if (!r.ok) return;
      toast.success(painel === "pagar" ? "Pagamento registrado" : "Dívida lançada em aberto");
      setPainel(null);
      await carregar();
    });
  }

  async function estornar(l: LancamentoFornecedor) {
    const ok = await confirm({
      title: l.tipo === "pagamento" ? "Estornar este pagamento?" : "Remover este lançamento?",
      message: l.tipo === "pagamento" ? `${formatBRL(l.valor)} volta para a conta e para o saldo em aberto do fornecedor.` : `${formatBRL(l.valor)} sai do saldo em aberto. Só é possível se o saldo não ficar negativo.`,
      confirmLabel: l.tipo === "pagamento" ? "Estornar" : "Remover",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(estornarLancamentoFornecedor(l.id), { sucesso: "Lançamento desfeito", erro: "Erro ao desfazer" });
      if (r.ok) await carregar();
    });
  }

  return (
    <Modal open onClose={onClose} title={`Conta em aberto — ${fornecedor.nome}`} width="max-w-2xl">
      <div className="rounded-md border border-border bg-surface-2 p-4 mb-4">
        <div className="text-xs text-text-tertiary mb-1">Você deve a este fornecedor</div>
        <div className="font-mono text-2xl text-text-primary">{lancamentos ? formatBRL(saldo) : "…"}</div>
        <p className="mt-1 text-xs text-text-tertiary">Sem parcelas nem vencimento: compras deixadas em aberto e dívida antiga somam; cada pagamento seu desconta.</p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <Button variant="primary" size="sm" onClick={() => abrir("pagar")} disabled={!lancamentos || saldo <= 0}>
          Registrar pagamento
        </Button>
        <Button variant="secondary" size="sm" onClick={() => abrir("divida")} disabled={!lancamentos}>
          Lançar dívida antiga
        </Button>
      </div>

      {painel && (
        <div className="rounded-md border border-border p-3 mb-4 space-y-3">
          <div className="text-sm font-medium text-text-primary">{painel === "pagar" ? "Registrar pagamento (Pix, transferência…)" : "Lançar dívida antiga em aberto"}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={painel === "pagar" ? "Valor pago (R$)" : "Valor em aberto (R$)"}>
              <input className={`${inputClass} font-mono`} inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
            </FormField>
            <FormField label="Data">
              <input type="date" className={inputClass} value={data} max={painel === "pagar" ? hoje : undefined} onChange={(e) => setData(e.target.value)} />
            </FormField>
          </div>
          {painel === "pagar" && (
            <FormField label="Saiu da conta">
              <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
                <option value="">Selecione…</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </FormField>
          )}
          <FormField label="Observação (opcional)">
            <input className={inputClass} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={painel === "pagar" ? "Ex.: Pix de segunda" : "Ex.: Saldo anterior ao sistema"} />
          </FormField>
          {painel === "pagar" && v !== null && v > saldo + 0.005 && <p className="text-xs text-negative">O valor passa do que você deve ({formatBRL(saldo)}).</p>}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setPainel(null)}>
              Cancelar
            </Button>
            <Button variant="primary" className="flex-1" onClick={confirmar} loading={pending} disabled={!valido}>
              {painel === "pagar" ? "Registrar pagamento" : "Lançar dívida"}
            </Button>
          </div>
        </div>
      )}

      <div className="text-xs font-medium text-text-secondary mb-2">Extrato</div>
      {erro && <p className="text-sm text-negative">{erro}</p>}
      {lancamentos && extrato.length === 0 && <p className="text-sm text-text-tertiary text-center py-6 border border-dashed border-border rounded-md">Nada em aberto com este fornecedor. Ao fazer uma compra, escolha &quot;Deixar em aberto&quot;, ou lance uma dívida antiga acima.</p>}
      {extrato.length > 0 && (
        <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {extrato.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="w-20 shrink-0 font-mono text-xs text-text-tertiary">{formatarDataIso(l.data)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-text-primary">{l.descricao ?? ROTULO_LANCAMENTO[l.tipo]}</div>
                <div className="text-xs text-text-tertiary">{ROTULO_LANCAMENTO[l.tipo]}</div>
              </div>
              <div className="text-right">
                <div className={`font-mono ${l.tipo === "pagamento" ? "text-positive" : "text-text-primary"}`}>{l.tipo === "pagamento" ? "−" : "+"} {formatBRL(l.valor)}</div>
                <div className="text-xs text-text-tertiary font-mono">saldo {formatBRL(l.saldoApos)}</div>
              </div>
              <RowMenu actions={[{ label: l.tipo === "pagamento" ? "Estornar pagamento" : "Remover lançamento", onClick: () => void estornar(l), destructive: true }]} />
            </div>
          ))}
        </div>
      )}
      {lancamentos && saldo <= 0 && extrato.length > 0 && <div className="mt-3"><StatusChip label="Quitado" tone="positive" /></div>}

      <div className="flex mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Fechar
        </Button>
      </div>
      {ConfirmDialog}
    </Modal>
  );
}

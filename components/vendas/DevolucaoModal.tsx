"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import { itensParaDevolver, registrarDevolucao, type ItemDevolvivel } from "@/app/(painel)/vendas/devolucao-actions";

type Forma = "reembolso" | "abater" | "troca" | "nenhum";

const FORMAS: { id: Forma; rotulo: string; ajuda: string }[] = [
  { id: "reembolso", rotulo: "Devolver o dinheiro", ajuda: "Sai do caixa escolhido." },
  { id: "troca", rotulo: "Trocar por outro produto", ajuda: "Vira crédito: o PDV abre com esse valor de desconto." },
  { id: "abater", rotulo: "Abater do crediário", ajuda: "Reduz o que o cliente ainda deve desta venda." },
  { id: "nenhum", rotulo: "Sem estorno", ajuda: "Só registra a devolução e o estoque." },
];

/**
 * Devolução e troca com estorno parcial (11.3): escolhe itens e quantidades (até o que
 * resta), se cada um volta ao estoque ou vai para avaria, e como estornar.
 */
export function DevolucaoModal({
  vendaId,
  numero,
  totalRestante,
  fiado,
  contas,
  onClose,
}: {
  vendaId: string;
  numero: string;
  /** Total que ainda resta na venda (já descontadas devoluções anteriores). */
  totalRestante: number;
  fiado: boolean;
  contas: { id: string; nome: string }[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [itens, setItens] = useState<ItemDevolvivel[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [avaria, setAvaria] = useState<Record<string, boolean>>({});
  const [forma, setForma] = useState<Forma>("reembolso");
  const [conta, setConta] = useState(contas[0]?.id ?? "");
  const [motivo, setMotivo] = useState("");
  const [valorManual, setValorManual] = useState<number | null>(null);

  useEffect(() => {
    let vivo = true;
    itensParaDevolver(vendaId).then((r) => {
      if (!vivo) return;
      if (r.ok) setItens(r.dado);
      else setErro(r.erro);
    });
    return () => {
      vivo = false;
    };
  }, [vendaId]);

  const sugerido = useMemo(() => Math.min(totalRestante, (itens ?? []).reduce((s, i) => s + (qtd[i.id] ?? 0) * i.precoUnitario, 0)), [itens, qtd, totalRestante]);
  const valor = valorManual ?? Math.round(sugerido * 100) / 100;
  const escolhidos = (itens ?? []).filter((i) => (qtd[i.id] ?? 0) > 0);

  function confirmar() {
    startTransition(async () => {
      const r = await executarComToast(
        registrarDevolucao({
          vendaId,
          itens: escolhidos.map((i) => ({ venda_item_id: i.id, quantidade: qtd[i.id], destino: avaria[i.id] ? "avaria" : "estoque" })),
          valorEstorno: forma === "nenhum" ? 0 : valor,
          forma,
          contaId: forma === "reembolso" ? conta || null : null,
          motivo: motivo.trim() || null,
        }),
        { erro: "Erro ao registrar a devolução" },
      );
      if (!r.ok) return;
      if (forma === "troca") {
        toast.success(`${r.dado.numero}: crédito de ${formatBRL(r.dado.estorno)}. Monte a nova venda no PDV.`);
        // Leva o crédito para o PDV (desconto da nova venda).
        router.push(`/pdv?troca=${encodeURIComponent(r.dado.numero)}&credito=${r.dado.estorno}`);
        return;
      }
      toast.success(`Devolução ${r.dado.numero} registrada${r.dado.estorno ? ` · estorno ${formatBRL(r.dado.estorno)}` : ""}.`);
      onClose();
    });
  }

  return (
    <Modal open onClose={onClose} title={`Devolução / troca · ${numero}`} width="max-w-lg">
      {erro && <p className="text-sm text-negative mb-3">{erro}</p>}
      {!itens && !erro && <p className="text-sm text-text-secondary">Carregando os itens…</p>}
      {itens && (
        <>
          <div className="border border-border rounded-md divide-y divide-border mb-4">
            {itens.map((i) => {
              const resta = i.quantidade - i.devolvido;
              return (
                <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-text-primary">{i.produtoNome}</div>
                    <div className="text-[11px] text-text-tertiary">
                      vendido {i.quantidade} · {formatBRL(i.precoUnitario)}/un{i.devolvido ? ` · já devolvido ${i.devolvido}` : ""}
                    </div>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={resta}
                    disabled={resta <= 0}
                    aria-label={`Quantidade a devolver de ${i.produtoNome}`}
                    className={`${inputClass} h-8 text-right`}
                    value={qtd[i.id] ?? 0}
                    onChange={(e) => (setQtd((x) => ({ ...x, [i.id]: Math.max(0, Math.min(resta, Math.floor(Number(e.target.value) || 0))) })), setValorManual(null))}
                  />
                  <label className="flex items-center gap-1 text-[11px] text-text-secondary whitespace-nowrap" title="Avaria: não volta ao estoque">
                    <input type="checkbox" checked={!!avaria[i.id]} onChange={(e) => setAvaria((x) => ({ ...x, [i.id]: e.target.checked }))} /> avaria
                  </label>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2 mb-1">
            {FORMAS.filter((f) => f.id !== "abater" || fiado).map((f) => (
              <Chip key={f.id} ativo={forma === f.id} onClick={() => setForma(f.id)}>
                {f.rotulo}
              </Chip>
            ))}
          </div>
          <p className="text-[11px] text-text-tertiary mb-3">{FORMAS.find((f) => f.id === forma)!.ajuda}</p>

          <div className="grid grid-cols-2 gap-3">
            {forma !== "nenhum" && (
              <FormField label={forma === "troca" ? "Crédito (R$)" : "Valor do estorno (R$)"} dica={`Até ${formatBRL(totalRestante)}`}>
                <input
                  className={inputClass}
                  inputMode="decimal"
                  value={valor}
                  onChange={(e) => setValorManual(Math.max(0, Math.min(totalRestante, Number(e.target.value.replace(",", ".")) || 0)))}
                />
              </FormField>
            )}
            {forma === "reembolso" && (
              <FormField label="Sai de qual conta">
                <select className={inputClass} value={conta} onChange={(e) => setConta(e.target.value)}>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
          </div>
          <FormField label="Motivo (opcional)">
            <input className={inputClass} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: tamanho errado, defeito" />
          </FormField>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" loading={pending} disabled={!escolhidos.length || (forma === "reembolso" && !conta)} onClick={confirmar}>
              {forma === "troca" ? "Registrar e ir ao PDV" : "Registrar devolução"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

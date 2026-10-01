"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { executarComToast } from "@/lib/acao-cliente";
import { normalizarTags } from "@/lib/expedicao";
import { anotarPedidos } from "@/app/(painel)/vendas/central-actions";
import { TagPedido } from "./TagPedido";

/**
 * Observação interna (só a equipe vê) e tags, para um ou vários pedidos. Com vários, os
 * campos começam vazios e só o que for preenchido muda.
 */
export function AnotarModal({
  chaves,
  inicial,
  tagsSugeridas,
  onClose,
}: {
  chaves: string[];
  inicial?: { observacao: string | null; tags: string[] };
  tagsSugeridas: string[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const um = chaves.length === 1;
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");
  const [tagsTexto, setTagsTexto] = useState((inicial?.tags ?? []).join(", "));
  const tags = normalizarTags(tagsTexto);

  function salvar() {
    startTransition(async () => {
      const r = await executarComToast(
        anotarPedidos(chaves, {
          ...(um || observacao.trim() ? { observacao: observacao.trim() || null } : {}),
          ...(um || tagsTexto.trim() ? { tags } : {}),
        }),
        { erro: "Erro ao salvar" },
      );
      if (r.ok) {
        toast.success(um ? "Pedido anotado" : `${r.dado} pedido(s) anotado(s)`);
        onClose();
      }
    });
  }

  return (
    <Modal open onClose={onClose} title={um ? "Observação e tags" : `Observação e tags · ${chaves.length} pedidos`} width="max-w-md">
      <FormField label="Observação interna" dica="Só a equipe vê. Ex.: embalar para presente, cliente pediu urgência.">
        <textarea className={`${inputClass} h-24 py-2 resize-y`} maxLength={1000} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
      </FormField>
      <FormField label="Tags" dica="Separe por vírgula (até 8). Dá para filtrar por tag em Filtrar.">
        <input className={inputClass} value={tagsTexto} onChange={(e) => setTagsTexto(e.target.value)} placeholder="urgente, brinde, troca" />
      </FormField>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 -mt-2 mb-3">
          {tags.map((t) => (
            <TagPedido key={t} tag={t} />
          ))}
        </div>
      )}
      {tagsSugeridas.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] text-text-tertiary mb-1">Já usadas:</div>
          <div className="flex flex-wrap gap-1">
            {tagsSugeridas
              .filter((t) => !tags.some((x) => x.toLowerCase() === t.toLowerCase()))
              .slice(0, 12)
              .map((t) => (
                <button key={t} type="button" onClick={() => setTagsTexto((x) => (x.trim() ? `${x}, ${t}` : t))}>
                  <TagPedido tag={t} />
                </button>
              ))}
          </div>
        </div>
      )}
      {!um && <p className="text-xs text-text-tertiary mb-3">Com vários pedidos, campo vazio não muda nada.</p>}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" loading={pending} onClick={salvar}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

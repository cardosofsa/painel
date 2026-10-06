"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { executar } from "@/lib/acao";
import { executarComToast } from "@/lib/acao-cliente";
import type { DiferencaEstoque } from "@/lib/marketplace/estoque-shopee";
import { definirEstoqueAutomatico, previaEstoqueShopee } from "@/app/(painel)/vendas/marketplace-actions";

/**
 * Antes de ligar o envio automático de estoque de uma loja: "Sertão × Shopee" com o que vai
 * mudar em cada anúncio. Confirmar envia tudo agora e deixa automático daí em diante.
 */
export function EstoqueShopeeModal({ lojaId, nomeLoja, onClose }: { lojaId: string; nomeLoja: string; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [previa, setPrevia] = useState<{ total: number; semVinculo: number; diferencas: DiferencaEstoque[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    executar(previaEstoqueShopee(lojaId))
      .then((r) => vivo && setPrevia(r))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível ler os anúncios da Shopee."));
    return () => {
      vivo = false;
    };
  }, [lojaId]);

  function ativar() {
    startTransition(async () => {
      const r = await executarComToast(definirEstoqueAutomatico(lojaId, true), { erro: "Erro ao ativar" });
      if (r.ok) {
        toast.success(`Envio automático ligado: ${r.dado.enviados} anúncio(s) atualizado(s) agora.`);
        if (r.dado.erros.length) toast.error(r.dado.erros.slice(0, 3).join(" · "));
        onClose();
      }
    });
  }

  return (
    <Modal open onClose={onClose} title={`Estoque automático · ${nomeLoja}`} width="max-w-2xl">
      <p className="text-sm text-text-secondary mb-3">
        O Sertão passa a mandar para a Shopee o saldo do armazém que abastece esta loja, a cada venda, compra recebida ou ajuste (e a cada 15 min). Confira antes o que vai mudar agora:
      </p>
      {erro ? (
        <p className="text-sm text-negative">{erro}</p>
      ) : !previa ? (
        <div className="space-y-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 rounded-md bg-surface-2 animate-pulse" />
          ))}
          <p className="text-xs text-text-tertiary">Lendo os anúncios da loja na Shopee…</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-sm mb-3">
            <span>
              Anúncios: <strong>{previa.total}</strong>
            </span>
            <span>
              Vão mudar: <strong>{previa.diferencas.length}</strong>
            </span>
            {previa.semVinculo > 0 && (
              <span className="text-negative">
                Sem produto vinculado (não mudam): <strong>{previa.semVinculo}</strong>
              </span>
            )}
          </div>
          {previa.diferencas.length > 0 ? (
            <div className="border border-border rounded-md divide-y divide-border max-h-[45vh] overflow-y-auto mb-4">
              {previa.diferencas.map((d) => (
                <div key={`${d.itemId}:${d.modelId}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate text-text-primary" title={d.nome ?? ""}>
                      {d.nome ?? `Anúncio ${d.itemId}`}
                    </div>
                    {d.sku && <div className="text-xs font-mono text-text-tertiary">{d.sku}</div>}
                  </div>
                  <span className="shrink-0 inline-flex items-center gap-1.5 font-mono">
                    <span className="text-text-tertiary">{d.de}</span>
                    <ArrowRight size={12} className="text-text-tertiary" />
                    <span className={d.para === 0 ? "text-negative font-semibold" : "text-text-primary font-semibold"}>{d.para}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-positive mb-4">O estoque da Shopee já está igual ao do Sertão.</p>
          )}
          <p className="text-xs text-text-tertiary mb-3">
            Shopee à esquerda, Sertão à direita. Anúncios que vão para 0 ficam sem estoque na loja. As duas lojas que puxam do mesmo armazém recebem o mesmo saldo; a sincronização frequente evita vender o que já saiu na outra.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Agora não
            </Button>
            <Button variant="primary" loading={pending} onClick={ativar}>
              Confirmar e ligar o automático
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

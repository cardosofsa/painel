"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { FileText, Receipt } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { PedidoCentral } from "@/lib/pedidos-central";
import { atualizarNfe, emitirComprovante, emitirNfe } from "@/app/(painel)/vendas/fiscal-actions";

export interface FiscalResumo {
  /** Token do emissor configurado (Configurações → Fiscal). */
  ligada: boolean;
  padraoPdv: "comprovante" | "nfe" | "perguntar";
  padraoCatalogo: "comprovante" | "nfe" | "perguntar";
}

export interface NotaResumo {
  tipo: "comprovante" | "nfe";
  status: "pendente" | "processando" | "autorizada" | "rejeitada" | "cancelada";
  numero: string | null;
  danfe: string | null;
  mensagem: string | null;
}

type Escolha = "comprovante" | "nfe";

/**
 * Etapa Emitir (11.7): "Comprovante do sistema ou NF-e?", com o padrão do canal marcado.
 * Comprovante segue na hora; NF-e vai ao emissor e, autorizada, o pedido segue para Enviar.
 */
export function useEmissao(fiscal: FiscalResumo, doCatalogo: (p: PedidoCentral) => boolean) {
  const [pending, startTransition] = useTransition();
  const [emitindo, setEmitindo] = useState<PedidoCentral[] | null>(null);
  const [escolha, setEscolha] = useState<Escolha | null>(null);

  function abrir(ps: PedidoCentral[]) {
    const vendas = ps.filter((p) => p.chave.startsWith("venda:"));
    if (!vendas.length) return;
    const padrao = doCatalogo(vendas[0]) ? fiscal.padraoCatalogo : fiscal.padraoPdv;
    setEscolha(padrao === "perguntar" ? null : padrao === "nfe" && !fiscal.ligada ? "comprovante" : padrao);
    setEmitindo(vendas);
  }

  function confirmar(aoTerminar?: () => void) {
    if (!emitindo || !escolha) return;
    const lista = emitindo;
    startTransition(async () => {
      let ok = 0;
      for (const p of lista) {
        const r = escolha === "comprovante" ? await emitirComprovante(p.id) : await emitirNfe(p.id);
        if (!r.ok) {
          toast.error(`${p.numero}: ${r.erro}`, { duration: 10_000 });
          continue;
        }
        if (escolha === "nfe") {
          const d = r.dado as { status: string; mensagem: string | null; danfe: string | null };
          if (d.status === "autorizada") {
            ok++;
            if (d.danfe && lista.length === 1) window.open(d.danfe, "_blank", "noopener");
          } else if (d.status === "rejeitada") toast.error(`${p.numero}: NF-e rejeitada. ${d.mensagem ?? ""}`, { duration: 10_000 });
          else toast.message(`${p.numero}: NF-e em processamento. Use "Atualizar NF-e" no menu do pedido em instantes.`);
        } else ok++;
      }
      if (ok) toast.success(`${ok} pedido(s) emitido(s) e em Para Enviar.`);
      setEmitindo(null);
      aoTerminar?.();
    });
  }

  function atualizar(p: PedidoCentral) {
    startTransition(async () => {
      const r = await atualizarNfe(p.id);
      if (!r.ok) return void toast.error(r.erro);
      if (r.dado.status === "autorizada") toast.success(`NF-e de ${p.numero} autorizada.`);
      else if (r.dado.status === "rejeitada") toast.error(`NF-e rejeitada: ${r.dado.mensagem ?? ""}`);
      else toast.message("Ainda em processamento na Sefaz.");
    });
  }

  const modal = (aoTerminar?: () => void) =>
    emitindo && (
      <Modal open onClose={() => setEmitindo(null)} title={emitindo.length === 1 ? `Emitir ${emitindo[0].numero}` : `Emitir ${emitindo.length} pedidos`} width="max-w-md">
        <p className="text-sm text-text-secondary mb-3">O que gerar para {emitindo.length === 1 ? "este pedido" : "estes pedidos"}?</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {(
            [
              ["comprovante", "Comprovante do sistema", "Não fiscal. Segue para Enviar na hora.", Receipt],
              ["nfe", "NF-e", fiscal.ligada ? "Nota fiscal pelo emissor (Sefaz)." : "Desligada: configure em Configurações → Fiscal.", FileText],
            ] as const
          ).map(([id, rotulo, ajuda, Icone]) => (
            <button
              key={id}
              type="button"
              aria-pressed={escolha === id}
              disabled={id === "nfe" && !fiscal.ligada}
              onClick={() => setEscolha(id)}
              className={`rounded-md border px-3 py-2 text-left disabled:opacity-50 ${escolha === id ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-text-primary">
                <Icone size={14} className="text-accent" /> {rotulo}
              </span>
              <span className="block text-[11px] text-text-tertiary mt-0.5">{ajuda}</span>
            </button>
          ))}
        </div>
        {!fiscal.ligada && (
          <p className="text-[11px] text-text-tertiary mb-3">
            Para emitir NF-e:{" "}
            <Link href="/configuracoes" className="text-accent hover:underline">
              Configurações → Fiscal
            </Link>{" "}
            (emissor, certificado A1 e regras do contador).
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEmitindo(null)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} disabled={!escolha} onClick={() => confirmar(aoTerminar)}>
            {escolha === "nfe" ? "Emitir NF-e" : "Emitir comprovante"}
          </Button>
        </div>
      </Modal>
    );

  return { abrir, atualizar, modal, ocupado: pending };
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { executarComToast } from "@/lib/acao-cliente";
import type { PedidoCentral } from "@/lib/pedidos-central";
import { desmarcarEtiqueta, etiquetasShopee, programarEnvioShopee } from "@/app/(painel)/vendas/envio-actions";

type Modo = "pickup" | "dropoff";

function abrirPdf(base64: string, nome: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const aba = window.open(url, "_blank");
  if (!aba) {
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function avisarFalhas(falhas: { numero: string; erro: string }[]) {
  if (!falhas.length) return;
  const [f, ...resto] = falhas;
  toast.error(`${f.numero}: ${f.erro}${resto.length ? ` (+${resto.length} com problema)` : ""}`, { duration: 8000 });
}

/**
 * Envio da Shopee pelo SERTÃO (Fase 10.5): Para Enviar → "Programar envio" (coleta ou
 * postagem) e Para Imprimir → "Imprimir etiquetas" (um PDF só). Só para lojas ligadas à API.
 */
export function useEnvioShopee({ lojasApi }: { /** loja → plataforma ('shopee' | 'mercadolivre'), só com API ligada. */ lojasApi: Map<string, string> }) {
  const [pending, startTransition] = useTransition();
  const [programando, setProgramando] = useState<PedidoCentral[] | null>(null);
  const [modo, setModo] = useState<Modo>("dropoff");

  /** Pedido em que a ação da Shopee vale (marketplace, loja com API, etapa certa). */
  function acaoDe(p: PedidoCentral): string | null {
    if (p.origem !== "marketplace" || !p.lojaId || !lojasApi.has(p.lojaId)) return null;
    // Mercado Livre: não há "programar"; a etiqueta sai quando o ML libera (Para Imprimir).
    if (p.etapa === "enviar") return lojasApi.get(p.lojaId) === "mercadolivre" || (p.envio?.programado && !p.envio.erro) ? null : "Programar envio";
    if (p.etapa === "imprimir") return "Imprimir etiqueta";
    return null;
  }

  /** Mesma ação para todos os selecionados? (senão a barra de massa não oferece). */
  function acaoEmMassa(ps: PedidoCentral[]): string | null {
    const a = ps.length ? acaoDe(ps[0]) : null;
    if (!a || !ps.every((p) => acaoDe(p) === a)) return null;
    return a === "Imprimir etiqueta" ? "Imprimir etiquetas" : a;
  }

  function executar(ps: PedidoCentral[], aoTerminar?: () => void) {
    const a = ps.length ? acaoDe(ps[0]) : null;
    if (a === "Programar envio") return setProgramando(ps);
    if (a !== "Imprimir etiqueta") return;
    startTransition(async () => {
      const r = await executarComToast(etiquetasShopee(ps.map((p) => p.id)), { erro: "Erro ao gerar as etiquetas" });
      if (!r.ok) return;
      for (const arq of r.dado.arquivos) abrirPdf(arq.base64, arq.nome);
      if (r.dado.impressas) toast.success(`${r.dado.impressas} etiqueta(s) prontas. Pedido(s) em Para Retirada.`);
      avisarFalhas(r.dado.falhas);
      aoTerminar?.();
    });
  }

  function confirmarProgramar(aoTerminar?: () => void) {
    if (!programando) return;
    const ids = programando.map((p) => p.id);
    startTransition(async () => {
      const r = await executarComToast(programarEnvioShopee(ids, modo), { erro: "Erro ao programar o envio" });
      setProgramando(null);
      if (!r.ok) return;
      if (r.dado.programados) toast.success(`${r.dado.programados} envio(s) programado(s)${r.dado.resumo ? ` · ${r.dado.resumo}` : ""}.`);
      avisarFalhas(r.dado.falhas);
      aoTerminar?.();
    });
  }

  function voltarParaImprimir(p: PedidoCentral) {
    startTransition(async () => {
      await executarComToast(desmarcarEtiqueta([p.id]), { sucesso: `Pedido ${p.numero} de volta em Para Imprimir`, erro: "Erro ao atualizar" });
    });
  }

  const modal = (aoTerminar?: () => void) =>
    programando && (
      <Modal open onClose={() => setProgramando(null)} title={`Programar envio · ${programando.length} pedido(s)`} width="max-w-md">
        <p className="text-sm text-text-secondary mb-3">
          A Shopee define o que a logística aceita. Se a forma escolhida não estiver disponível para um pedido, uso a outra. Na coleta, vai o endereço de coleta da loja e o
          primeiro horário livre.
        </p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {(
            [
              ["dropoff", "Postagem", "Levo à agência"],
              ["pickup", "Coleta", "A transportadora busca"],
            ] as const
          ).map(([m, r, d]) => (
            <button
              key={m}
              type="button"
              aria-pressed={modo === m}
              onClick={() => setModo(m)}
              className={`rounded-md border px-3 py-2 text-left ${modo === m ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
            >
              <span className="block text-sm font-medium text-text-primary">{r}</span>
              <span className="block text-[11px] text-text-tertiary">{d}</span>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setProgramando(null)}>
            Cancelar
          </Button>
          <Button variant="primary" loading={pending} onClick={() => confirmarProgramar(aoTerminar)}>
            Programar
          </Button>
        </div>
      </Modal>
    );

  return { acaoDe, acaoEmMassa, executar, voltarParaImprimir, modal, ocupado: pending };
}

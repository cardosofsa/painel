"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronDown, Printer } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { Button } from "@/components/ui/Button";
import { executarComToast } from "@/lib/acao-cliente";
import { listaResumo, listaSeparacao, romaneio } from "@/lib/expedicao";
import type { PedidoCentral } from "@/lib/pedidos-central";
import type { TabelaExport } from "@/lib/exportar";
import { anotarPedidos } from "@/app/(painel)/vendas/central-actions";

async function abrirPdf<L>(tabela: TabelaExport<L>, empresa?: { nome: string | null } | null) {
  const { gerarPdf } = await import("@/lib/exportar-arquivos");
  const blob = await gerarPdf(tabela, empresa);
  const url = URL.createObjectURL(blob);
  // Abre numa aba para imprimir; o navegador revoga a URL quando a aba fecha.
  const aba = window.open(url, "_blank");
  if (!aba) {
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tabela.titulo.toLowerCase().replace(/\s+/g, "-")}.pdf`;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Barra que aparece com pedidos selecionados: imprimir em massa (separação, resumo,
 * romaneio), mais ações (observação/tags, ocultar/mostrar) e a ação da etapa.
 */
export function AcoesMassa({
  selecionados,
  onLimpar,
  onAnotar,
  acaoEtapa,
  empresa,
  verOcultos,
}: {
  selecionados: PedidoCentral[];
  onLimpar: () => void;
  onAnotar: () => void;
  /** Ação da etapa para os selecionados (Aprovar, Programar envio...), se todos estão na mesma etapa. */
  acaoEtapa: { rotulo: string; executar: () => void; carregando: boolean } | null;
  empresa?: { nome: string | null } | null;
  /** Na aba Oculto a ação é "Mostrar". */
  verOcultos: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [gerando, setGerando] = useState(false);
  const anotaveis = selecionados.filter((p) => p.chave.startsWith("venda:") || p.chave.startsWith("mkt:")).map((p) => p.chave);

  async function imprimir(tipo: "separacao" | "resumo" | "romaneio") {
    setGerando(true);
    try {
      if (tipo === "separacao") await abrirPdf(listaSeparacao(selecionados), empresa);
      else if (tipo === "resumo") await abrirPdf(listaResumo(selecionados), empresa);
      else await abrirPdf(romaneio(selecionados), empresa);
    } catch (e) {
      console.error("[expedicao]", e);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setGerando(false);
    }
  }

  function ocultar(ocultar: boolean) {
    startTransition(async () => {
      const r = await executarComToast(anotarPedidos(anotaveis, { ocultar }), { erro: "Erro ao atualizar" });
      if (r.ok) {
        toast.success(ocultar ? `${r.dado} pedido(s) ocultado(s)` : `${r.dado} pedido(s) de volta às etapas`);
        onLimpar();
      }
    });
  }

  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-surface-1 shadow-elev-2 px-3 py-2">
      <span className="text-sm text-text-primary font-medium">{selecionados.length} selecionado(s)</span>
      <button type="button" onClick={onLimpar} className="text-xs text-text-tertiary hover:text-text-primary">
        limpar
      </button>
      <div className="flex-1" />
      <Popover
        alinhar="direita"
        largura="w-60"
        rotulo={
          <>
            <Printer size={14} /> {gerando ? "Gerando…" : "Imprimir em massa"} <ChevronDown size={13} />
          </>
        }
      >
        {(fechar) => (
          <div className="space-y-0.5 -m-1">
            {(
              [
                ["separacao", "Lista de separação", "Produtos somados por SKU"],
                ["resumo", "Lista de resumo", "Pedido × itens"],
                ["romaneio", "Romaneio", "Para a coleta, com assinatura"],
              ] as const
            ).map(([t, r, d]) => (
              <button key={t} type="button" onClick={() => (fechar(), imprimir(t))} className="w-full text-left rounded-md px-2 py-1.5 hover:bg-surface-2">
                <span className="block text-sm text-text-primary">{r}</span>
                <span className="block text-[11px] text-text-tertiary">{d}</span>
              </button>
            ))}
          </div>
        )}
      </Popover>
      {anotaveis.length > 0 && (
        <Popover
          alinhar="direita"
          largura="w-56"
          rotulo={
            <>
              Mais ações <ChevronDown size={13} />
            </>
          }
        >
          {(fechar) => (
            <div className="space-y-0.5 -m-1">
              <button type="button" onClick={() => (fechar(), onAnotar())} className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                Observação e tags…
              </button>
              <button type="button" disabled={pending} onClick={() => (fechar(), ocultar(!verOcultos))} className="w-full text-left rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                {verOcultos ? "Mostrar de novo" : "Ocultar pedido(s)"}
              </button>
            </div>
          )}
        </Popover>
      )}
      {acaoEtapa && (
        <Button size="sm" variant="primary" loading={acaoEtapa.carregando} onClick={acaoEtapa.executar}>
          {acaoEtapa.rotulo}
        </Button>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { ComprovanteVenda } from "@/components/comprovante/ComprovanteVenda";
import type { DadosComprovante } from "@/lib/comprovante";

/**
 * Captura o comprovante como PNG para copiar (colar no WhatsApp) ou baixar. Mesmo padrão
 * de `ResumoFiadoImagem`/`resultado-compartilhado`: um card oculto fora da tela, capturado
 * por `html-to-image` no efeito seguinte ao render (é quando o DOM já existe).
 */
export function useComprovanteImagem() {
  const [pendente, setPendente] = useState<{ dados: DadosComprovante; acao: "copiar" | "baixar" } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendente || !ref.current) return;
    const node = ref.current;
    const { dados, acao } = pendente;
    (async () => {
      try {
        const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff" });
        const nomeArquivo = `comprovante-${dados.numero}.png`;
        const baixar = () => {
          const a = document.createElement("a");
          a.href = dataUrl;
          a.download = nomeArquivo;
          a.click();
        };
        if (acao === "baixar") {
          baixar();
          toast.success("Imagem baixada");
          return;
        }
        try {
          const blob = await (await fetch(dataUrl)).blob();
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          toast.success("Imagem copiada — cole na conversa do WhatsApp");
        } catch {
          baixar();
          toast.error("Não foi possível copiar — baixando a imagem em vez disso");
        }
      } catch {
        toast.error("Erro ao gerar a imagem do comprovante");
      } finally {
        setPendente(null);
      }
    })();
  }, [pendente]);

  function gerar(dados: DadosComprovante, acao: "copiar" | "baixar") {
    setPendente({ dados, acao });
  }

  const oculto = (
    <div style={{ position: "fixed", left: -9999, top: 0, pointerEvents: "none" }} aria-hidden>
      <div ref={ref}>{pendente && <ComprovanteVenda dados={pendente.dados} />}</div>
    </div>
  );

  return { gerar, gerando: pendente !== null, oculto };
}

"use client";

import { ComprovanteVenda } from "@/components/comprovante/ComprovanteVenda";
import { useCapturaImagem } from "@/components/ui/PreviaImagem";
import { formatBRL } from "@/lib/format";
import type { DadosComprovante } from "@/lib/comprovante";

/**
 * Comprovante como imagem: captura o cartão e abre a prévia (copiar, baixar, enviar).
 * Ver `useCapturaImagem` para o porquê de não copiar direto.
 */
export function useComprovanteImagem() {
  const { capturar, gerando, elementos } = useCapturaImagem();

  function gerar(dados: DadosComprovante) {
    capturar(<ComprovanteVenda dados={dados} />, {
      nome: `comprovante-${dados.numero}.png`,
      titulo: `Comprovante · ${dados.numero}`,
      texto: `Comprovante da venda ${dados.numero}: ${formatBRL(dados.total)}.`,
      largura: 420,
    });
  }

  return { gerar, gerando, oculto: elementos };
}

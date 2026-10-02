"use client";

import { useState } from "react";
import type { PedidoCentral } from "@/lib/pedidos-central";
import { ConfirmarImpressaoModal } from "./ConfirmarImpressaoModal";

const urlImpressao = (ps: PedidoCentral[]) => `/vendas/imprimir?ids=${ps.map((p) => p.id).join(",")}`;

/** Para Imprimir: abre a impressão (um ou vários) e depois pergunta se saiu no papel. */
export function useImpressao() {
  const [imprimindo, setImprimindo] = useState<PedidoCentral[] | null>(null);

  function imprimir(ps: PedidoCentral[]) {
    const vendas = ps.filter((p) => p.chave.startsWith("venda:") && p.etapa === "imprimir");
    if (!vendas.length) return;
    window.open(urlImpressao(vendas), "_blank");
    setImprimindo(vendas);
  }

  const modal = (confirmar: (ps: PedidoCentral[]) => void, carregando: boolean) =>
    imprimindo && (
      <ConfirmarImpressaoModal
        numeros={imprimindo.map((p) => p.numero)}
        onImprimirDeNovo={() => window.open(urlImpressao(imprimindo), "_blank")}
        onConfirmar={() => confirmar(imprimindo)}
        onClose={() => setImprimindo(null)}
        carregando={carregando}
      />
    );

  return { imprimir, modal, fechar: () => setImprimindo(null) };
}

"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ComprovanteVenda } from "@/components/comprovante/ComprovanteVenda";
import type { DadosComprovante } from "@/lib/comprovante";

/** Vários comprovantes, um por folha; abre a impressão assim que a página carrega. */
export function ImprimirLote({ dados }: { dados: DadosComprovante[] }) {
  useEffect(() => {
    // Dá um respiro para as fontes e imagens (logo) carregarem antes da janela de impressão.
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-5 print:hidden">
        <span className="text-sm text-text-secondary">
          {dados.length} pedido(s): {dados.map((d) => d.numero).join(", ")}
        </span>
        <Button variant="primary" onClick={() => window.print()}>
          <Printer size={14} /> Imprimir de novo
        </Button>
      </div>
      {dados.map((d, i) => (
        <div key={d.numero} className={`flex justify-center print:block mb-8 print:mb-0 ${i < dados.length - 1 ? "print:break-after-page" : ""}`}>
          <ComprovanteVenda dados={d} largura={480} />
        </div>
      ))}
    </div>
  );
}

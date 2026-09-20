"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { VitrineView, type ItemVitrine } from "./VitrineView";

/** Envolve a VitrineView com os botões de exportar imagem/PDF — só existe pra ter acesso ao DOM. */
export function VitrineExportBar({ nome, itens }: { nome: string; itens: ItemVitrine[] }) {
  const [baixando, setBaixando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function baixarImagem() {
    if (!ref.current) return;
    setBaixando(true);
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, backgroundColor: "#ffffff" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${nome.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}.png`;
      a.click();
    } catch {
      toast.error("Erro ao gerar imagem");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div>
      <div className="flex gap-2 mb-6 print:hidden">
        <Button variant="secondary" onClick={baixarImagem} loading={baixando}>
          <Download size={14} />
          Baixar Imagem
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={14} />
          Salvar como PDF
        </Button>
      </div>
      <div ref={ref} className="bg-background">
        <VitrineView itens={itens} />
      </div>
    </div>
  );
}

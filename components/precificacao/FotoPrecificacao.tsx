"use client";

import { ImageIcon } from "lucide-react";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";

/**
 * Foto que vai na imagem compartilhada da precificação. Sem foto própria, usa a do produto
 * vinculado; com ela, a própria vale (e é salva junto, 0045).
 */
export function FotoPrecificacao({
  propria,
  doProduto,
  onChange,
}: {
  propria: string | null;
  doProduto: string | null;
  onChange: (url: string | null) => void;
}) {
  const { enviar, enviando } = useSupabaseUpload("produtos");
  const atual = propria ?? doProduto;

  async function escolher(file: File) {
    const r = await enviar(file, { maxSizeMb: 5, tiposAceitos: ["image/"], prefixo: "precificacao" });
    if (r) onChange(r.publicUrl);
  }

  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="w-12 h-12 rounded-md border border-border bg-surface-2 overflow-hidden shrink-0 flex items-center justify-center text-text-tertiary">
        {atual ? <ImagemStorage src={atual} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={18} />}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-text-secondary">Foto na imagem compartilhada</div>
        <div className="flex items-center gap-3 mt-1">
          <CampoArquivo onArquivo={escolher} disabled={enviando} rotulo={atual ? "Trocar foto" : "Escolher foto"} />
          {propria && (
            <button type="button" className="text-xs text-text-tertiary hover:text-negative" onClick={() => onChange(null)}>
              {doProduto ? "Usar a do produto" : "Remover"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

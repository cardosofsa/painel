import { ImageIcon } from "lucide-react";
import { ImagemStorage } from "./ImagemStorage";

/**
 * Miniatura do produto. O SKU, quando pedido, vai AO LADO da imagem, numa linha só
 * (cortado com "…" e completo no `title`): embaixo, SKUs longos quebravam em várias linhas
 * e amontoavam a tabela.
 */
export function ProductThumb({ src, sku, size = 40, mostrarSku = false }: { src: string | null; sku: string; size?: number; mostrarSku?: boolean }) {
  const imagem = (
    <div
      className="rounded-md bg-surface-2 border border-border flex items-center justify-center overflow-hidden shrink-0"
      style={{ width: size, height: size }}
    >
      {src ? <ImagemStorage src={src} alt={sku} className="w-full h-full object-cover" /> : <ImageIcon size={16} className="text-text-tertiary" />}
    </div>
  );
  if (!mostrarSku) return imagem;
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {imagem}
      <span className="font-mono text-xs text-text-tertiary whitespace-nowrap truncate max-w-[9rem]" title={sku}>
        {sku}
      </span>
    </div>
  );
}

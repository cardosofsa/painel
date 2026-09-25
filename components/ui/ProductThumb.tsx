import { ImageIcon } from "lucide-react";

export function ProductThumb({ src, sku, size = 40 }: { src: string | null; sku: string; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-1" style={{ width: size }}>
      <div
        className="rounded-md bg-surface-2 border border-border flex items-center justify-center overflow-hidden shrink-0"
        style={{ width: size, height: size }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- thumbnails vêm de URLs externas arbitrárias
          <img src={src} alt={sku} loading="lazy" decoding="async" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon size={16} className="text-text-tertiary" />
        )}
      </div>
      <span className="font-mono text-[10px] text-text-tertiary">{sku}</span>
    </div>
  );
}

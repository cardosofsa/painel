"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { urlEmbedVideo, urlMiniaturaVideo } from "@/lib/landing";

/**
 * Vídeo de demonstração com "fachada": até o clique, só uma miniatura e o botão de play —
 * nenhum script, cookie ou requisição do player do YouTube. No clique, troca pelo iframe do
 * youtube-nocookie já tocando. A origem dos dois está em `lib/csp.ts` (só com a variável).
 */
export function VideoDemo({ id, titulo }: { id: string; titulo: string }) {
  const [tocando, setTocando] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-surface-2 shadow-elev-2">
      {tocando ? (
        <iframe
          src={urlEmbedVideo(id)}
          title={titulo}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <button type="button" onClick={() => setTocando(true)} className="group absolute inset-0 h-full w-full" aria-label={`Assistir: ${titulo}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- miniatura externa da fachada; o otimizador do Next não serve i.ytimg.com */}
          <img src={urlMiniaturaVideo(id)} alt="" loading="lazy" className="h-full w-full object-cover" />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-on shadow-elev-3 transition-transform group-hover:scale-105">
              <Play size={28} className="ml-1" aria-hidden />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

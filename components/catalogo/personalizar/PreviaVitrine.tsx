"use client";

import type { CSSProperties } from "react";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { DestaqueVitrine, SecoesFinaisVitrine } from "@/components/catalogo/VitrineSecoes";
import { variaveisCssVitrine } from "@/lib/cores";
import { classeFonte } from "@/lib/fontes-vitrine";
import type { SecoesVitrine } from "@/lib/vixe/vitrine";
import type { AparenciaCatalogo } from "@/app/(painel)/catalogo/aparencia-actions";

/**
 * Prévia ao vivo da vitrine com as cores já ajustadas para contraste (mesmo
 * `variaveisCssVitrine` do layout público) e os mesmos componentes de seção.
 */
export function PreviaVitrine({
  aparencia,
  secoes,
  nomeCatalogo,
  logoEmpresa,
  whatsapp,
}: {
  aparencia: AparenciaCatalogo;
  secoes: SecoesVitrine;
  nomeCatalogo: string;
  logoEmpresa: string | null;
  whatsapp: string | null;
}) {
  const estilo = variaveisCssVitrine({
    corPrimaria: aparencia.cor_primaria,
    corFundo: aparencia.cor_fundo,
    corSuperficie: aparencia.cor_superficie,
    corTexto: aparencia.cor_texto,
  }) as CSSProperties;
  const logo = aparencia.logo_url || logoEmpresa;
  return (
    <div style={estilo} className={`${classeFonte(aparencia.fonte)} rounded-lg border border-border bg-background p-4 max-h-[75vh] overflow-y-auto`}>
      <div className="flex items-center gap-3 mb-1">
        {logo && (
          <div className="w-10 h-10 rounded-md overflow-hidden border border-border bg-surface-1 shrink-0">
            <ImagemStorage src={logo} alt="" className="w-full h-full object-contain" />
          </div>
        )}
        <h1 className="text-xl font-semibold text-text-primary truncate">{aparencia.titulo || nomeCatalogo}</h1>
      </div>
      {aparencia.mensagem_boas_vindas && <p className="text-sm text-text-secondary mb-4">{aparencia.mensagem_boas_vindas}</p>}
      <div className="mt-3">
        <DestaqueVitrine secoes={secoes} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg bg-surface-1 border border-border overflow-hidden">
            <div className="aspect-square bg-surface-2" />
            <div className="p-2">
              <div className="h-2.5 w-3/4 rounded bg-surface-3 mb-1.5" />
              <div className="text-xs font-mono text-accent font-semibold">R$ 00,00</div>
            </div>
          </div>
        ))}
      </div>
      <SecoesFinaisVitrine secoes={secoes} whatsapp={whatsapp} />
    </div>
  );
}

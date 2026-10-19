"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { MessageCircle, PanelRightClose, X } from "lucide-react";
import { IconButton } from "@/components/ui/Button";

/** Cabeçalho comum ao painel fixo e à gaveta. */
function Cabecalho({ tituloId, subtitulo, fechar }: { tituloId: string; subtitulo: string | null; fechar: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h2 id={tituloId} className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <MessageCircle size={14} aria-hidden /> Conversa
        </h2>
        {subtitulo && <p className="truncate text-xs text-text-secondary">{subtitulo}</p>}
      </div>
      {fechar}
    </div>
  );
}

/**
 * Tela larga (≥ 1280 px): o chat fica fixo à direita, com a altura da janela (menos a barra do
 * topo, que também é fixa: `top-20`) e rolagem própria.
 * A coluna central encolhe para caber.
 */
export function PainelConversaFixo({ subtitulo, onRecolher, children }: { subtitulo: string | null; onRecolher: () => void; children: ReactNode }) {
  const tituloId = useId();
  return (
    <aside aria-labelledby={tituloId} className="sticky top-20 flex h-[calc(100dvh-6rem)] min-h-[24rem] flex-col overflow-hidden rounded-lg border border-border bg-surface-1 shadow-elev-1">
      <Cabecalho
        tituloId={tituloId}
        subtitulo={subtitulo}
        fechar={
          <IconButton aria-label="Recolher a conversa" onClick={onRecolher}>
            <PanelRightClose size={16} aria-hidden />
          </IconButton>
        }
      />
      <div className="flex-1 min-h-0">{children}</div>
    </aside>
  );
}

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Tela menor: entre 1024 e 1279 px o chat abre como gaveta à direita, por cima do conteúdo; no
 * celular, em tela cheia (folha de baixo para cima). O resto da tela fica intacto por baixo.
 * Esc fecha e o foco volta para o botão que abriu.
 */
export function GavetaConversa({ subtitulo, onFechar, focoInicial, children }: { subtitulo: string | null; onFechar: () => void; focoInicial?: React.RefObject<HTMLElement | null>; children: ReactNode }) {
  const tituloId = useId();
  const painelRef = useRef<HTMLDivElement>(null);
  const aoFechar = useRef(onFechar);
  useEffect(() => {
    aoFechar.current = onFechar;
  });

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (focoInicial?.current ?? painelRef.current)?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // Esc já tratado dentro do chat (ex.: fechar a imagem ampliada) não fecha a gaveta junto.
        if (e.defaultPrevented) return;
        aoFechar.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Só o que o Tab alcança: o campo de arquivo escondido (tabIndex -1) não pode ser o "último".
      const lista = Array.from(painelRef.current?.querySelectorAll<HTMLElement>(FOCAVEIS) ?? []).filter((el) => el.offsetParent !== null && el.tabIndex >= 0);
      if (lista.length === 0) return;
      const [primeiro, ultimo] = [lista[0], lista[lista.length - 1]];
      const dentro = painelRef.current?.contains(document.activeElement);
      if (e.shiftKey && (!dentro || document.activeElement === primeiro || document.activeElement === painelRef.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (!dentro || document.activeElement === ultimo)) {
        e.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      anterior?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir e fechar
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 hidden bg-text-primary/40 animate-esmaecer lg:block" onClick={() => aoFechar.current()} aria-hidden="true" />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-surface-1 shadow-elev-3 outline-none animate-surgir lg:w-[24rem] lg:border-l lg:border-border"
      >
        <Cabecalho
          tituloId={tituloId}
          subtitulo={subtitulo}
          fechar={
            <IconButton aria-label="Fechar a conversa" onClick={() => aoFechar.current()}>
              <X size={18} aria-hidden />
            </IconButton>
          }
        />
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

export interface RowMenuAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  icon?: ReactNode;
}

const MENU_WIDTH = 176; // w-44

const ITEM_HEIGHT = 36;
const MENU_PADDING = 8;

export function RowMenu({ actions }: { actions: RowMenuAction[] }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [montado, setMontado] = useState(false);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- só monta o portal após o primeiro render no client, evita mismatch de SSR
    setMontado(true);
  }, []);

  function calcularPosicao() {
    const rect = botaoRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8);
    const alturaMenu = actions.length * ITEM_HEIGHT + MENU_PADDING;
    const cabeAbaixo = rect.bottom + 4 + alturaMenu <= window.innerHeight;
    const top = cabeAbaixo ? rect.bottom + 4 : Math.max(8, rect.top - alturaMenu - 4);
    setPos({ top, left: Math.max(8, left) });
  }

  function abrir() {
    calcularPosicao();
    setAberto(true);
  }

  useEffect(() => {
    if (!aberto) return;

    function onClickFora(e: MouseEvent) {
      const alvo = e.target as Node;
      if (botaoRef.current?.contains(alvo) || menuRef.current?.contains(alvo)) return;
      setAberto(false);
    }
    function onScrollOuResize() {
      setAberto(false);
    }

    document.addEventListener("mousedown", onClickFora);
    window.addEventListener("scroll", onScrollOuResize, true);
    window.addEventListener("resize", onScrollOuResize);
    return () => {
      document.removeEventListener("mousedown", onClickFora);
      window.removeEventListener("scroll", onScrollOuResize, true);
      window.removeEventListener("resize", onScrollOuResize);
    };
  }, [aberto]);

  return (
    <>
      <button
        ref={botaoRef}
        onClick={(e) => {
          e.stopPropagation();
          if (aberto) setAberto(false);
          else abrir();
        }}
        className="p-1.5 rounded-md text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
        aria-label="Mais ações"
      >
        <MoreVertical size={16} />
      </button>
      {aberto &&
        montado &&
        createPortal(
          <div
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: MENU_WIDTH }}
            className="bg-surface-1 border border-border rounded-md shadow-lg py-1 text-sm z-50"
          >
            {actions.map((a) => (
              <button
                key={a.label}
                onClick={() => {
                  a.onClick();
                  setAberto(false);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-2 ${
                  a.destructive ? "text-negative" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

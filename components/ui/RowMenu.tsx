"use client";

import { useEffect, useRef, useState, ReactNode } from "react";
import { MoreVertical } from "lucide-react";

export interface RowMenuAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  icon?: ReactNode;
}

export function RowMenu({ actions }: { actions: RowMenuAction[] }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setAberto((v) => !v);
        }}
        className="p-1.5 rounded-md text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
        aria-label="Mais ações"
      >
        <MoreVertical size={16} />
      </button>
      {aberto && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 mt-1 w-44 bg-surface-1 border border-border rounded-md shadow-lg py-1 text-sm z-20"
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
        </div>
      )}
    </div>
  );
}

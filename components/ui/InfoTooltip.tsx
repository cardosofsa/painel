"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";

export function InfoTooltip({ text }: { text: string }) {
  const [aberto, setAberto] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onClick={(e) => {
          e.stopPropagation();
          setAberto((v) => !v);
        }}
        className="text-text-tertiary hover:text-text-secondary"
        aria-label="Mais informações"
      >
        <HelpCircle size={12} />
      </button>
      {aberto && (
        <span className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-48 rounded-md bg-surface-3 text-text-primary text-xs px-2.5 py-1.5 shadow-lg pointer-events-none">
          {text}
        </span>
      )}
    </span>
  );
}

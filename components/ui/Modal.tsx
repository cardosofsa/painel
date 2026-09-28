"use client";

import { ReactNode, useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className={`relative w-full ${width} bg-surface-1 rounded-lg border border-border shadow-lg max-h-[90vh] overflow-y-auto`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary text-xl leading-none"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function FormField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block mb-4 last:mb-0">
      <span className="block text-xs font-medium text-text-secondary mb-1.5">{label}</span>
      {children}
    </label>
  );
}

/**
 * Aparência de campo, **sem** largura. Use quando o campo não ocupa a linha toda: filtro
 * numa barra, busca com largura fixa, input dentro de um flex.
 *
 * A separação existe porque a string do `inputClass` estava copiada à mão em 19 lugares,
 * justamente nos que precisavam de outra largura — e nenhuma das cópias tinha o
 * `transition-colors`, então campo de busca não animava o foco e campo de modal animava.
 */
export const campoBase =
  "h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent transition-colors";

/** Campo de formulário: ocupa a linha inteira. É o caso de tudo que vive num `FormField`. */
export const inputClass = `w-full ${campoBase}`;

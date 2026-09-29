"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button";

/**
 * Diálogo modal.
 *
 * O que faltava e foi acrescentado, tudo pelo mesmo motivo — quem não usa mouse ficava
 * de fora:
 *
 * - `role="dialog"` + `aria-modal` + `aria-labelledby`: sem isso o leitor de tela anuncia
 *   uma `<div>` qualquer e não diz que o resto da página ficou inerte.
 * - **Armadilha de foco.** O Tab saía do modal e passeava pela tela atrás dele, que o
 *   usuário não consegue ver.
 * - **Devolver o foco ao fechar.** Sem isso o foco volta para o `<body>` e o próximo Tab
 *   recomeça do topo da página.
 * - **Travar a rolagem do fundo.** No celular, rolar dentro do modal rolava a página
 *   atrás e o modal "fugia".
 * - Transição de entrada. Antes era `if (!open) return null`: aparecia e sumia seco.
 */
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
  const tituloId = useId();
  const painelRef = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    focoAnterior.current = document.activeElement as HTMLElement | null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Foca o painel, não o primeiro campo: abrir um formulário já com o teclado do celular
    // levantado esconde metade do modal.
    painelRef.current?.focus();

    function focaveis() {
      return Array.from(
        painelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const lista = focaveis();
      if (lista.length === 0) {
        e.preventDefault();
        return;
      }
      const primeiro = lista[0];
      const ultimo = lista[lista.length - 1];
      const ativo = document.activeElement;

      if (e.shiftKey && (ativo === primeiro || ativo === painelRef.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflowAnterior;
      focoAnterior.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-text-primary/40 animate-esmaecer" onClick={onClose} aria-hidden="true" />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className={`relative w-full ${width} bg-surface-1 rounded-t-xl sm:rounded-lg border border-border shadow-elev-3 max-h-[92vh] sm:max-h-[90vh] overflow-y-auto animate-surgir outline-none`}
      >
        {/* Sticky: em formulário longo, o título e o X somem ao rolar e não há como fechar
            sem voltar ao topo. */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-border bg-surface-1">
          <h2 id={tituloId} className="text-base font-semibold text-text-primary tracking-tight">
            {title}
          </h2>
          <IconButton onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </IconButton>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function FormField({
  label,
  children,
  dica,
}: {
  label: string;
  children: ReactNode;
  /** Explicação curta abaixo do campo, para o rótulo não virar uma frase. */
  dica?: string;
}) {
  return (
    <label className="block mb-4 last:mb-0">
      <span className="block text-xs font-medium text-text-secondary mb-1.5">{label}</span>
      {children}
      {dica && <span className="block text-xs text-text-tertiary mt-1.5">{dica}</span>}
    </label>
  );
}

/**
 * Aparência de campo, **sem** largura. Use quando o campo não ocupa a linha toda: filtro
 * numa barra, busca com largura fixa, input dentro de um flex.
 *
 * A separação existe porque a string do `inputClass` estava copiada à mão em 17 lugares,
 * justamente nos que precisavam de outra largura — e nenhuma das cópias tinha o
 * `transition-colors`, então campo de busca não animava o foco e campo de modal animava.
 */
export const campoBase =
  "h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary " +
  "outline-none focus:border-accent hover:border-border-forte transition-colors duration-[--duracao-rapida]";

/** Campo de formulário: ocupa a linha inteira. É o caso de tudo que vive num `FormField`. */
export const inputClass = `w-full ${campoBase}`;

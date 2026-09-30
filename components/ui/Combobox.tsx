"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { campoBase } from "@/components/ui/Modal";

export interface ItemCombobox {
  id: string;
  rotulo: string;
  /** Texto menor à direita (saldo, SKU, preço…). */
  detalhe?: string;
  /** Texto extra só para a busca (SKU, código de barras). */
  busca?: string;
  /** Grupo para ordenar/rotular (ex.: "Insumos e embalagens"). */
  grupo?: string;
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Campo de busca com sugestões: digita e aparece a lista filtrada; setas, Enter e Esc
 * funcionam. Serve no lugar do <select> quando a lista é grande (produtos, insumos).
 *
 * Controlado pelo pai (`valor` + `onChange`). O texto digitado é estado local: ao escolher,
 * vira o rótulo do item.
 */
export function Combobox({
  itens,
  valor,
  onChange,
  placeholder = "Buscar…",
  vazio = "Nada encontrado",
  limite = 50,
  autoFocus,
  className = "",
}: {
  itens: ItemCombobox[];
  valor: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  vazio?: string;
  limite?: number;
  autoFocus?: boolean;
  className?: string;
}) {
  const idLista = useId();
  const selecionado = itens.find((i) => i.id === valor) ?? null;
  const [texto, setTexto] = useState(selecionado?.rotulo ?? "");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  const filtrados = useMemo(() => {
    const t = normalizar(texto.trim());
    // Com um item escolhido e o texto igual ao rótulo, mostra tudo (a pessoa abriu para trocar).
    const lista = !t || (selecionado && texto === selecionado.rotulo) ? itens : itens.filter((i) => normalizar(`${i.rotulo} ${i.busca ?? ""} ${i.detalhe ?? ""}`).includes(t));
    return lista.slice(0, limite);
  }, [itens, texto, selecionado, limite]);

  function escolher(item: ItemCombobox) {
    onChange(item.id);
    setTexto(item.rotulo);
    setAberto(false);
  }

  function teclado(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAberto(true);
      setAtivo((a) => Math.min(a + 1, filtrados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && aberto && filtrados[ativo]) {
      e.preventDefault();
      escolher(filtrados[ativo]);
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  let grupoAnterior: string | undefined;
  return (
    <div className={`relative ${className}`}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" />
      <input
        ref={ref}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={idLista}
        aria-autocomplete="list"
        autoFocus={autoFocus}
        value={texto}
        placeholder={placeholder}
        onFocus={(e) => {
          setAberto(true);
          e.currentTarget.select();
        }}
        onBlur={() => setTimeout(() => setAberto(false), 120)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberto(true);
          setAtivo(0);
          if (selecionado && e.target.value !== selecionado.rotulo) onChange(null);
        }}
        onKeyDown={teclado}
        className={`${campoBase} w-full pl-9`}
      />
      {aberto && (
        <ul id={idLista} role="listbox" className="absolute z-40 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-border bg-surface-1 shadow-elev-2 py-1 text-sm">
          {filtrados.length === 0 ? (
            <li className="px-3 py-2 text-text-tertiary">{vazio}</li>
          ) : (
            filtrados.map((item, i) => {
              const cabecalho = item.grupo && item.grupo !== grupoAnterior ? item.grupo : null;
              grupoAnterior = item.grupo;
              return (
                <li key={item.id}>
                  {cabecalho && <div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">{cabecalho}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.id === valor}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setAtivo(i)}
                    onClick={() => escolher(item)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left ${i === ativo ? "bg-surface-2" : ""} ${item.id === valor ? "text-accent font-medium" : "text-text-primary"}`}
                  >
                    <span className="truncate">{item.rotulo}</span>
                    {item.detalhe && <span className="shrink-0 text-xs text-text-tertiary font-mono">{item.detalhe}</span>}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

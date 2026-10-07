"use client";

import { useEffect, useState } from "react";

export type Papel = "10x15" | "a4";

const CHAVE = "painel:papel-impressao";

/** Largura do comprovante em cada papel: 10×15 é 100 mm, menos 3 mm de margem de cada lado. */
export const LARGURA_PAPEL: Record<Papel, number> = { "10x15": 355, a4: 480 };

/**
 * Papel da impressão do pedido. Padrão 10×15 (impressora térmica de etiqueta); a escolha fica
 * salva neste navegador.
 */
export function usePapel(): [Papel, (p: Papel) => void] {
  const [papel, setPapel] = useState<Papel>("10x15");
  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE) === "a4") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o localStorage no mount, para não divergir do HTML do servidor
        setPapel("a4");
      }
    } catch {
      // Sem localStorage (aba anônima bloqueada): fica no padrão.
    }
  }, []);
  function escolher(p: Papel) {
    setPapel(p);
    try {
      localStorage.setItem(CHAVE, p);
    } catch {
      // idem
    }
  }
  return [papel, escolher];
}

/** Tamanho da folha para a janela de impressão do navegador. */
export function EstiloPapel({ papel }: { papel: Papel }) {
  const regra = papel === "10x15" ? "@page { size: 100mm 150mm; margin: 3mm; }" : "@page { size: A4; margin: 12mm; }";
  return <style>{regra}</style>;
}

/** Botões "10×15 / A4" (somem na impressão). */
export function SeletorPapel({ papel, onChange }: { papel: Papel; onChange: (p: Papel) => void }) {
  return (
    <div role="group" aria-label="Papel" className="inline-flex rounded-md border border-border p-0.5 print:hidden">
      {(
        [
          ["10x15", "10×15 térmica"],
          ["a4", "A4"],
        ] as const
      ).map(([p, rotulo]) => (
        <button
          key={p}
          type="button"
          aria-pressed={papel === p}
          onClick={() => onChange(p)}
          className={`rounded px-2.5 py-1 text-xs font-medium ${papel === p ? "bg-accent-soft text-accent" : "text-text-secondary hover:text-text-primary"}`}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}

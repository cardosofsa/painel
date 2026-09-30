"use client";

import { Check, CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { avaliarTitulo } from "@/lib/ia/nota-titulo";

function corDaNota(nota: number): string {
  if (nota >= 100) return "bg-positive-soft text-positive";
  if (nota >= 75) return "bg-accent-soft text-accent";
  return "bg-negative-soft text-negative";
}

/**
 * Uma opção gerada pela IA. Título mostra a nota local (sem IA) e o que falta; descrição
 * mostra o texto inteiro com as quebras de seção.
 */
export function OpcaoSugestao({
  texto,
  limite,
  titulo,
  termoPrincipal,
  onUsar,
}: {
  texto: string;
  limite: number;
  /** `true` = é título: avalia e mostra a nota. */
  titulo: boolean;
  termoPrincipal: string | null;
  onUsar: () => void;
}) {
  const avaliacao = titulo ? avaliarTitulo(texto, { limite, termoPrincipal }) : null;
  const falhas = avaliacao?.criterios.filter((c) => !c.ok) ?? [];

  return (
    <div className="rounded-md border border-border bg-surface-1 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className={`text-sm text-text-primary min-w-0 ${titulo ? "" : "whitespace-pre-wrap"}`}>{texto}</p>
        <span className={`text-xs font-mono shrink-0 ${texto.length > limite ? "text-negative" : "text-text-tertiary"}`}>
          {texto.length}/{limite}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
        {avaliacao ? (
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span
              className={`text-xs font-medium rounded px-1.5 py-0.5 ${corDaNota(avaliacao.nota)}`}
              title={avaliacao.criterios.map((c) => `${c.ok ? "✓" : "✗"} ${c.texto}`).join("\n")}
            >
              Nota {avaliacao.nota}
            </span>
            {falhas.length === 0 ? (
              <span className="flex items-center gap-1 text-xs text-text-tertiary">
                <CircleCheck size={12} className="text-positive" /> Atende às regras de busca
              </span>
            ) : (
              falhas.map((f) => (
                <span key={f.texto} className="flex items-center gap-1 text-xs text-text-tertiary">
                  <CircleAlert size={12} className="text-negative" /> {f.texto}
                </span>
              ))
            )}
          </div>
        ) : (
          <span />
        )}
        <Button type="button" variant="primary" onClick={onUsar} className="shrink-0">
          <Check size={14} /> Usar este
        </Button>
      </div>
    </div>
  );
}

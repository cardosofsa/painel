"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { executarComToast } from "@/lib/acao-cliente";
import { ocultarPrimeirosPassos } from "@/app/(painel)/dashboard/actions";

export interface PassoInicial {
  id: string;
  rotulo: string;
  ajuda: string;
  href: string;
  feito: boolean;
}

/**
 * Primeiros passos de uma conta nova: some sozinho quando tudo está feito, ou quando a
 * pessoa oculta (fica gravado no perfil, 0065).
 */
export function PrimeirosPassos({ passos }: { passos: PassoInicial[] }) {
  const [oculto, setOculto] = useState(false);
  const [, startTransition] = useTransition();
  const feitos = passos.filter((p) => p.feito).length;
  if (oculto || feitos === passos.length) return null;

  function ocultar() {
    setOculto(true);
    startTransition(async () => {
      const r = await executarComToast(ocultarPrimeirosPassos(), { erro: "Erro ao ocultar" });
      if (!r.ok) setOculto(false);
    });
  }

  return (
    <Card className="mb-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">Primeiros passos</h2>
          <p className="text-xs text-text-tertiary">
            {feitos} de {passos.length} feitos. Com isso pronto, preço, estoque e lucro já saem certos.
          </p>
        </div>
        <button type="button" onClick={ocultar} className="text-text-tertiary hover:text-text-primary" aria-label="Ocultar primeiros passos" title="Ocultar">
          <X size={16} />
        </button>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden mb-4">
        <div className="h-full bg-accent" style={{ width: `${(feitos / passos.length) * 100}%` }} />
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        {passos.map((p) => (
          <li key={p.id}>
            <Link
              href={p.href}
              className={`flex h-full items-start gap-2 rounded-md border px-3 py-2.5 text-sm hover:bg-surface-2 ${p.feito ? "border-border text-text-tertiary" : "border-accent/40 text-text-primary"}`}
            >
              {p.feito ? <CheckCircle2 size={16} className="text-positive shrink-0 mt-0.5" /> : <Circle size={16} className="text-accent shrink-0 mt-0.5" />}
              <span>
                <span className={`block font-medium ${p.feito ? "line-through" : ""}`}>{p.rotulo}</span>
                {!p.feito && <span className="block text-xs text-text-secondary">{p.ajuda}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}

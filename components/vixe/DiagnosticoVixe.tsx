"use client";

import { Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import { ROTULO_ESTRATEGIA, type DiagnosticoPreco } from "@/lib/ia/prompts-preco";
import type { ResultadoPrecificacao } from "@/lib/pricing";

/**
 * Resposta da Vixe. O preço sugerido aparece com lucro e margem RECALCULADOS pelo sistema
 * (`simulado`), nunca com a conta do modelo.
 */
export function DiagnosticoVixe({
  diagnostico,
  simulado,
  atual,
  rodape,
  doCache,
  podeSalvar,
  salvando,
  onTestar,
  onSalvar,
}: {
  diagnostico: DiagnosticoPreco;
  simulado: ResultadoPrecificacao | null;
  atual: ResultadoPrecificacao;
  rodape: string;
  doCache: boolean;
  podeSalvar: boolean;
  salvando: boolean;
  onTestar: (preco: number) => void;
  onSalvar: (preco: number) => void;
}) {
  const p = diagnostico.precoSugerido;
  const diferenca = simulado ? simulado.lucroLiquido - atual.lucroLiquido : 0;

  return (
    <div className="space-y-4">
      {diagnostico.diagnostico && <p className="text-sm text-text-primary leading-relaxed">{diagnostico.diagnostico}</p>}

      {p != null && simulado && (
        <div className="rounded-md border border-border bg-surface-2 p-3">
          <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Preço sugerido</div>
          <div className="flex items-baseline gap-3 flex-wrap mt-0.5">
            <span className="text-xl font-semibold font-mono text-accent">{formatBRL(p)}</span>
            <span className="text-sm text-text-secondary">
              lucro {formatBRL(simulado.lucroLiquido)} por venda ({diferenca >= 0 ? "+" : ""}
              {formatBRL(diferenca)} que hoje)
            </span>
          </div>
          {diagnostico.motivoPreco && <p className="text-sm text-text-secondary mt-1">{diagnostico.motivoPreco}</p>}
          <div className="flex flex-wrap gap-2 mt-2.5">
            <Button variant="secondary" onClick={() => onTestar(p)}>
              Testar este preço
            </Button>
            {podeSalvar && (
              <Button variant="primary" loading={salvando} onClick={() => onSalvar(p)}>
                Salvar no produto
              </Button>
            )}
          </div>
        </div>
      )}

      {diagnostico.estrategias.length > 0 && (
        <ul className="space-y-2">
          {diagnostico.estrategias.map((e) => (
            <li key={e.titulo} className="rounded-md border border-border p-3">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-accent-soft text-accent">
                  {ROTULO_ESTRATEGIA[e.tipo]}
                </span>
                <span className="text-sm font-medium text-text-primary">{e.titulo}</span>
              </div>
              <p className="text-sm text-text-secondary">{e.detalhe}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5 text-xs text-text-tertiary">
        <span>A Vixe usa só os números acima. Confira antes de mudar o anúncio.</span>
        <span className="shrink-0 flex items-center gap-1">
          {doCache && (
            <span className="flex items-center gap-1 text-accent" title="Já tinha sido gerado antes: não consumiu cota">
              <Zap size={11} /> cache
            </span>
          )}
          {rodape}
        </span>
      </div>
    </div>
  );
}

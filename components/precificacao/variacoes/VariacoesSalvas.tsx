"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Layers } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBRL, formatarMargemPct, classeValor, formatarData } from "@/lib/format";
import type { AnuncioSalvo } from "@/lib/precificacao-estado";

/** Últimos anúncios com variações salvos, expansíveis, com exportação e atalho pro histórico. */
export function VariacoesSalvas({
  anuncios,
  onExcluir,
  onExportarCsv,
  onVerHistorico,
}: {
  anuncios: AnuncioSalvo[];
  onExcluir: (a: AnuncioSalvo) => void;
  onExportarCsv: () => void;
  onVerHistorico: () => void;
}) {
  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <Card padding="nenhum" className="overflow-hidden">
      <div className="px-5 pt-5 pb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-text-primary">Variações Salvas</h2>
        <div className="flex items-center gap-3">
          <button onClick={onExportarCsv} className="text-xs text-accent hover:underline" disabled={anuncios.length === 0}>
            Exportar
          </button>
          <button onClick={onVerHistorico} className="text-xs text-accent hover:underline">
            Ver histórico completo →
          </button>
        </div>
      </div>
      <div className="divide-y divide-border">
        {anuncios.slice(0, 5).map((a) => (
          <div key={a.id} className="p-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setExpandido((v) => (v === a.id ? null : a.id))}
                className="text-sm font-medium text-text-primary hover:text-accent text-left"
              >
                {a.nome_anuncio}{" "}
                <span className="text-text-tertiary font-normal">
                  ({a.variacoes.length} variações · {formatarData(a.criado_em)})
                </span>
              </button>
              <button onClick={() => onExcluir(a)} className="text-xs text-negative hover:underline shrink-0">
                Remover
              </button>
            </div>
            {expandido === a.id && (
              <div className="mt-3 border border-border rounded-md divide-y divide-border">
                {a.variacoes.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span className="text-text-primary">{v.nome_variacao}</span>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-text-secondary">custo {formatBRL(v.custo)}</span>
                      <span className="font-mono text-accent">{formatBRL(v.preco_calculado)}</span>
                      <span className={`font-mono ${classeValor(v.lucro)}`}>{formatarMargemPct(v.lucro, v.preco_calculado)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {anuncios.length === 0 && (
          <EmptyState
            icon={Layers}
            title="Nenhum produto com variações salvo ainda"
            description="Precifique as variações de um anúncio (cor, tamanho, kit) e salve para ver aqui."
          />
        )}
      </div>
    </Card>
  );
}

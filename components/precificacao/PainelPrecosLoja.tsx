"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import { precosPorLoja, type LojaParaPreco, type PrecoGravado, type SituacaoPrecoLoja } from "@/lib/precos-loja";

const SELO: Record<SituacaoPrecoLoja, { texto: string; classe: string }> = {
  sem_preco: { texto: "Sem preço", classe: "bg-surface-2 text-text-secondary" },
  prejuizo: { texto: "Prejuízo", classe: "bg-negative-soft text-negative" },
  zona_morta: { texto: "Zona morta", classe: "bg-negative-soft text-negative" },
  ok: { texto: "Ok", classe: "bg-positive-soft text-positive" },
};

/**
 * Preços por loja (0101): uma linha por loja cadastrada, cada uma com o próprio preço e o
 * lucro calculado com as taxas DAQUELA loja e o custo de hoje do produto. Loja nova aparece
 * sozinha, sem preço. "Precificar" passa a calcular com a loja; salvar grava o preço nela.
 */
export function PainelPrecosLoja({
  custo,
  impostoPct,
  lojas,
  precos,
  lojaAtual,
  onPrecificar,
}: {
  custo: number;
  /** Fração (0,06). */
  impostoPct: number;
  lojas: LojaParaPreco[];
  precos: PrecoGravado[];
  lojaAtual: string | null;
  onPrecificar: (lojaId: string) => void;
}) {
  if (lojas.length === 0) return null;
  const linhas = precosPorLoja(lojas, precos, custo, impostoPct);
  const comPreco = linhas.filter((l) => l.preco !== null).length;

  return (
    <Card>
      <CardEyebrow>
        Preços por loja ({comPreco} de {linhas.length})
      </CardEyebrow>
      <ul className="mt-2 divide-y divide-border">
        {linhas.map((l) => (
          <li key={l.loja.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-text-primary truncate">{l.rotulo}</div>
              {l.resultado ? (
                <div className="text-xs text-text-secondary">
                  Lucro <span className={l.resultado.lucroLiquido < 0 ? "text-negative" : "text-text-primary"}>{formatBRL(l.resultado.lucroLiquido)}</span> · margem{" "}
                  {(l.resultado.margemEfetivaPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                </div>
              ) : (
                <div className="text-xs text-text-tertiary">Ainda não precificado para esta loja</div>
              )}
              {l.zonaMorta && (
                <div className="text-xs text-negative flex gap-1 mt-0.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> Baixe para {formatBRL(l.zonaMorta.precoMelhor)} e receba {formatBRL(l.zonaMorta.ganhoLiquido)} a mais
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {l.preco !== null && <span className="font-mono text-sm text-text-primary">{formatBRL(l.preco)}</span>}
              <span className={`text-xs font-medium rounded px-1.5 py-0.5 ${SELO[l.situacao].classe}`}>{SELO[l.situacao].texto}</span>
              {lojaAtual === l.loja.id ? (
                <span className="text-xs text-accent">Calculando</span>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => onPrecificar(l.loja.id)}>
                  Precificar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

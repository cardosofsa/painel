"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { formatBRL } from "@/lib/format";
import { precosPorLoja, type LojaParaPreco, type PrecoGravado, type SituacaoPrecoLoja } from "@/lib/precos-loja";

const SELO: Record<SituacaoPrecoLoja, { texto: string; classe: string }> = {
  sem_preco: { texto: "Sem preço", classe: "bg-surface-2 text-text-secondary" },
  sem_custo: { texto: "Sem custo", classe: "bg-surface-2 text-text-secondary" },
  sem_faixas: { texto: "Sem faixas", classe: "bg-negative-soft text-negative" },
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
  produtoId,
  custo,
  impostoPct,
  lojas,
  precos,
  lojaAtual,
  onPrecificar,
}: {
  produtoId: string;
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
          <li key={l.loja.id} className={`py-3 ${lojaAtual === l.loja.id ? "-mx-2 px-2 rounded-md bg-accent-soft/50" : ""}`}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-start">
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate" title={l.rotulo}>
                  {l.rotulo}
                </div>
                {l.resultado ? (
                  <div className="text-xs text-text-secondary">
                    lucro <span className={l.resultado.lucroLiquido < 0 ? "text-negative" : "text-text-primary"}>{formatBRL(l.resultado.lucroLiquido)}</span> · margem{" "}
                    {(l.resultado.margemEfetivaPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                  </div>
                ) : (
                  <div className="text-xs text-text-tertiary">ainda sem preço</div>
                )}
              </div>
              <div className="text-right">
                {l.preco !== null && <div className="font-mono text-sm text-text-primary">{formatBRL(l.preco)}</div>}
                <span className={`inline-block mt-0.5 text-xs font-medium rounded px-1.5 py-0.5 ${SELO[l.situacao].classe}`}>{SELO[l.situacao].texto}</span>
              </div>
            </div>
            {l.zonaMorta && (
              <div className="mt-1 text-xs text-negative flex gap-1">
                <AlertTriangle size={12} className="mt-0.5 shrink-0" aria-hidden /> Baixe para {formatBRL(l.zonaMorta.precoMelhor)} e receba {formatBRL(l.zonaMorta.ganhoLiquido)} a mais
              </div>
            )}
            <div className="mt-1.5 flex gap-4 text-xs">
              {lojaAtual === l.loja.id ? (
                <span className="text-accent font-medium">Calculando nesta loja</span>
              ) : (
                <button type="button" className="text-accent hover:underline" onClick={() => onPrecificar(l.loja.id)}>
                  Precificar aqui
                </button>
              )}
              {l.preco !== null && (
                <Link href={`/precificacao/ajuste/novo?produto=${produtoId}&loja=${l.loja.id}`} className="text-accent hover:underline">
                  Ajuste de Preço
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

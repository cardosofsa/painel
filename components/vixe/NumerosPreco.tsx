"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import type { AnalisePreco } from "@/lib/vixe/preco";

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: "positivo" | "negativo" }) {
  const cor = destaque === "positivo" ? "text-positive" : destaque === "negativo" ? "text-negative" : "text-text-primary";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary">{rotulo}</span>
      <span className={`text-sm font-mono tabular ${cor}`}>{valor}</span>
    </div>
  );
}

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** Os números do preço atual, sem IA: tudo sai de `analisarPreco`. */
export function NumerosPreco({ analise, onUsarPreco }: { analise: AnalisePreco; onUsarPreco: (preco: number) => void }) {
  const r = analise.resultado;
  if (!r.viavel) {
    return <p className="text-sm text-text-tertiary">Informe custo e preço para ver os números.</p>;
  }
  const prejuizo = r.lucroLiquido < 0;

  return (
    <div className="space-y-4">
      <div>
        <Linha rotulo="Lucro por venda" valor={formatBRL(r.lucroLiquido)} destaque={prejuizo ? "negativo" : "positivo"} />
        <Linha rotulo="Margem líquida" valor={pct(r.margemEfetivaPct)} destaque={prejuizo ? "negativo" : undefined} />
        <Linha rotulo="Comissão nesse preço" valor={`${analise.comissaoAplicadaPct}% + ${formatBRL(analise.tarifaAplicada)}`} />
        <Linha rotulo="Imposto" valor={formatBRL(r.impostoValor)} />
        {analise.precoMinimoViavel != null && <Linha rotulo="Preço mínimo sem prejuízo" valor={formatBRL(analise.precoMinimoViavel)} />}
      </div>

      {prejuizo && (
        <p className="flex gap-2 text-sm text-negative border border-negative/30 bg-negative-soft rounded-md px-3 py-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" /> Nesse preço cada venda dá prejuízo.
        </p>
      )}

      {analise.zonaMorta && (
        <div className="rounded-md border border-accent/40 bg-accent-soft px-3 py-2.5">
          <p className="text-sm text-text-primary font-medium">Preço em zona morta</p>
          <p className="text-sm text-text-secondary mt-0.5">
            Entre {formatBRL(analise.zonaMorta.inicio)} e {formatBRL(analise.zonaMorta.fim)} a comissão muda de faixa. A{" "}
            {formatBRL(analise.zonaMorta.precoMelhor)} você recebe {formatBRL(analise.zonaMorta.ganhoLiquido)} a mais por venda.
          </p>
          <Button variant="secondary" className="mt-2" onClick={() => onUsarPreco(analise.zonaMorta!.precoMelhor)}>
            Testar {formatBRL(analise.zonaMorta.precoMelhor)}
          </Button>
        </div>
      )}

      {analise.concorrencia && (
        <div>
          <div className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1">Concorrentes cadastrados</div>
          <Linha rotulo="Faixa" valor={`${formatBRL(analise.concorrencia.min)} a ${formatBRL(analise.concorrencia.max)}`} />
          <Linha rotulo="Média" valor={formatBRL(analise.concorrencia.media)} />
          <Linha
            rotulo="Seu preço"
            valor={
              analise.concorrencia.posicao === "na_media"
                ? "na média"
                : `${pct(Math.abs(analise.concorrencia.diferencaPct))} ${analise.concorrencia.posicao === "acima" ? "acima" : "abaixo"}`
            }
          />
        </div>
      )}

      {analise.precoPsicologico != null && !analise.zonaMorta && (
        <p className="text-xs text-text-tertiary">
          Preço quebrado mais próximo:{" "}
          <button type="button" className="text-accent hover:underline" onClick={() => onUsarPreco(analise.precoPsicologico!)}>
            {formatBRL(analise.precoPsicologico)}
          </button>
        </p>
      )}
    </div>
  );
}

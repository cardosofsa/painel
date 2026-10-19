"use client";

import { montarComposicao, type ParteComposicao } from "@/lib/composicao-preco";
import { CORES_CATEGORICAS, COR_NEGATIVA, formatarMoedaTooltip } from "./tema";

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Composição do preço: para onde vai cada real cobrado (custo, taxas, imposto, lucro), numa
 * barra empilhada. No prejuízo a barra mostra o que SAI e o trecho depois do preço vem
 * hachurado como perda — o donut de antes descartava o lucro negativo e parecia saudável.
 * A conta mora em `lib/composicao-preco.ts`.
 *
 * As quatro cores são atribuídas pela posição da parte, em ordem fixa, nunca cicladas. A
 * legenda com valores é obrigatória: a identidade de cada trecho não depende só da cor.
 */
export function PriceBreakdownChart({ data }: { data: ParteComposicao[] }) {
  const c = montarComposicao(data.slice(0, CORES_CATEGORICAS.length));
  const descricao =
    c.segmentos.map((s) => `${s.nome} ${formatarMoedaTooltip(s.valor)}`).join(", ") +
    (c.prejuizo > 0 ? `; prejuízo de ${formatarMoedaTooltip(c.prejuizo)}` : "");

  return (
    <div>
      <div role="img" aria-label={`Composição do preço: ${descricao}`} className="relative flex h-7 w-full overflow-hidden rounded-md bg-surface-2">
        {c.segmentos.map((s) => (
          <div key={s.nome} style={{ width: `${s.larguraPct}%`, background: CORES_CATEGORICAS[s.indice] }} className="h-full border-r-2 border-surface-1 last:border-r-0" />
        ))}
        {c.prejuizo > 0 && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 border-l-2 border-negative"
            style={{
              width: `${100 - c.marcadorPrecoPct}%`,
              backgroundImage: `repeating-linear-gradient(135deg, ${COR_NEGATIVA} 0 2px, transparent 2px 7px)`,
            }}
          />
        )}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-y-1.5 text-xs">
        {c.segmentos.map((s) => (
          <li key={s.nome} className="flex items-center gap-2 min-w-0">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CORES_CATEGORICAS[s.indice] }} />
            <span className="text-text-secondary truncate">{s.nome}</span>
            <span className="ml-auto font-mono text-text-primary">{formatarMoedaTooltip(s.valor)}</span>
            {c.preco > 0 && <span className="font-mono text-text-tertiary w-12 text-right">{pct(s.doPreco)}</span>}
          </li>
        ))}
        {c.prejuizo > 0 && (
          <li className="flex items-center gap-2 min-w-0 text-negative">
            <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm border border-negative" />
            <span className="truncate">Prejuízo por venda</span>
            <span className="ml-auto font-mono">{formatarMoedaTooltip(-c.prejuizo)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

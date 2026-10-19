"use client";

import { formatBRL } from "@/lib/format";
import { posicaoNaRegua, type FaixaNaRegua } from "@/lib/ajuste-preco";

export interface MarcadorRegua {
  preco: number;
  rotulo: string;
  tom: "atual" | "ideal" | "minimo" | "maximo";
}

const TOM: Record<MarcadorRegua["tom"], string> = {
  atual: "bg-text-primary",
  ideal: "bg-accent",
  minimo: "bg-negative",
  maximo: "bg-text-tertiary",
};

/**
 * Régua de preço: as faixas de comissão da loja em blocos alternados, as zonas mortas
 * hachuradas e os marcadores (atual, ideal, mínimo, máximo). Com `onMudar`, vira um controle
 * deslizante (o `<input type="range">` nativo por cima, então teclado e leitor de tela
 * funcionam). A cor nunca é o único sinal: cada marcador tem rótulo e valor.
 */
export function ReguaPreco({
  escala: escalaBase,
  faixas,
  zonasMortas,
  marcadores,
  valor,
  onMudar,
}: {
  escala: { de: number; ate: number };
  faixas: FaixaNaRegua[];
  zonasMortas: { inicio: number; fim: number }[];
  marcadores: MarcadorRegua[];
  valor?: number;
  onMudar?: (preco: number) => void;
}) {
  // A régua acompanha o preço testado: um valor fora dela alarga a escala em vez de grudar na ponta.
  const escala = valor !== undefined && valor > 0 ? { de: Math.min(escalaBase.de, Math.floor(valor * 0.9)), ate: Math.max(escalaBase.ate, Math.ceil(valor * 1.1)) } : escalaBase;
  const pos = (p: number) => posicaoNaRegua(p, escala);
  const visiveis = faixas.filter((f) => (f.max ?? Infinity) >= escala.de && f.min <= escala.ate).sort((a, b) => a.min - b.min);
  // Rótulos próximos (menos de 9% da régua) vão para a linha de baixo, para não se sobreporem.
  const linhas = new Map<string, number>();
  let ultimo = -Infinity;
  let linha = 0;
  for (const m of [...marcadores].sort((a, b) => a.preco - b.preco)) {
    const p = pos(m.preco);
    linha = p - ultimo < 9 ? (linha + 1) % 2 : 0;
    linhas.set(m.tom, linha);
    ultimo = p;
  }

  return (
    <div className="select-none">
      <div className="relative h-[4.5rem]">
        {/* Marcadores: rótulo em cima, traço atravessando a barra. */}
        {marcadores.map((m) => (
          <div key={m.tom} className="absolute bottom-0 -translate-x-1/2 flex flex-col items-center pointer-events-none" style={{ left: `${pos(m.preco)}%`, top: linhas.get(m.tom) ? "1rem" : 0 }}>
            <span className="text-xs leading-none whitespace-nowrap text-text-secondary">{m.rotulo}</span>
            <span className={`mt-1 w-0.5 flex-1 rounded ${TOM[m.tom]}`} aria-hidden="true" />
          </div>
        ))}
        <div className="absolute left-0 right-0 bottom-1 h-5 rounded-md overflow-hidden bg-surface-2 border border-border">
          {visiveis.map((f, i) => {
            const ini = pos(Math.max(f.min, escala.de));
            const fim = pos(Math.min(f.max ?? escala.ate, escala.ate));
            return <div key={f.min} className={`absolute inset-y-0 ${i % 2 ? "bg-surface-3" : "bg-surface-2"}`} style={{ left: `${ini}%`, width: `${Math.max(0, fim - ini)}%` }} />;
          })}
          {zonasMortas.map((z) => (
            <div
              key={z.inicio}
              className="absolute inset-y-0 border-x border-negative"
              title={`Zona morta: de ${formatBRL(z.inicio)} a ${formatBRL(z.fim)} você recebe menos que logo abaixo da faixa`}
              style={{
                left: `${pos(z.inicio)}%`,
                width: `${Math.max(0.5, pos(z.fim) - pos(z.inicio))}%`,
                backgroundImage: "repeating-linear-gradient(135deg, var(--negative) 0 2px, transparent 2px 6px)",
                opacity: 0.6,
              }}
            />
          ))}
          {valor !== undefined && <div className="absolute inset-y-0 w-1 -translate-x-1/2 bg-accent" style={{ left: `${pos(valor)}%` }} aria-hidden="true" />}
        </div>
        {onMudar && valor !== undefined && (
          <input
            type="range"
            min={escala.de}
            max={escala.ate}
            step={0.1}
            value={valor}
            onChange={(e) => onMudar(Math.round(Number(e.target.value) * 100) / 100)}
            aria-label="Preço"
            aria-valuetext={formatBRL(valor)}
            className="absolute left-0 right-0 bottom-0 h-7 w-full cursor-pointer opacity-0"
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-text-tertiary font-mono mt-1">
        <span>{formatBRL(escala.de)}</span>
        <span>{formatBRL(escala.ate)}</span>
      </div>
      {visiveis.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
          {visiveis.map((f) => (
            <li key={f.min}>
              {formatBRL(f.min)}
              {f.max !== null ? ` a ${formatBRL(f.max)}` : " ou mais"}: <span className="text-text-primary">{f.rotulo}</span>
            </li>
          ))}
          {zonasMortas.length > 0 && <li className="text-negative">Hachurado: zona morta</li>}
        </ul>
      )}
    </div>
  );
}

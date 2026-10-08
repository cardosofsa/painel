"use client";
import { CampoNumero } from "@/components/ui/CampoNumero";

import { Megaphone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/Modal";
import { formatBRL } from "@/lib/format";
import type { EstadoPrecificacao } from "@/lib/precificacao-estado";

const roas = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (f: number | null) => (f == null ? "—" : `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

/**
 * Anúncio pago: quanto ROAS o anúncio precisa dar para não comer o lucro, e quanto sobra
 * com o investimento informado. Não muda o preço calculado: mostra o efeito do anúncio sobre ele.
 */
export function PainelAnuncio({ estado }: { estado: EstadoPrecificacao }) {
  const { analiseAnuncio: a, anuncioTipo, setAnuncioTipo, anuncioValor, setAnuncioValor, margemAlvoAnuncio, setMargemAlvoAnuncio } = estado;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <Megaphone size={15} className="text-accent" />
        <h3 className="text-sm font-medium text-text-primary">Anúncio pago (ROAS)</h3>
      </div>
      <p className="text-xs text-text-tertiary mb-3">
        ROAS = quanto volta em vendas para cada R$ 1 de anúncio. Abaixo do ROAS mínimo, o anúncio come todo o lucro da venda.
      </p>

      {!a ? (
        <p className="text-sm text-text-tertiary">Chegue a um preço viável para ver os números do anúncio.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <Metrica rotulo="ROAS mínimo (empate)" valor={roas(a.roasEmpate)} dica={`ACoS máx. ${pct(a.acosMaximo)}`} tom={a.roasEmpate == null ? "negativo" : undefined} />
            <Metrica
              rotulo={`ROAS p/ manter ${margemAlvoAnuncio.toLocaleString("pt-BR")}%`}
              valor={roas(a.roasAlvo)}
              dica={a.roasAlvo == null ? "Margem não cabe" : `ACoS máx. ${pct(a.acosAlvo)}`}
              tom={a.roasAlvo == null ? "negativo" : undefined}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div>
              <label className="text-xs text-text-secondary mb-1.5 block">Investimento por venda</label>
              <input
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                value={anuncioValor}
                onChange={(e) => setAnuncioValor(e.target.value === "" ? "" : Math.max(0, Number(e.target.value) || 0))}
                placeholder={anuncioTipo === "percentual" ? "Ex: 8" : "Ex: 5,00"}
                className={inputClass}
              />
            </div>
            <div className="flex rounded-md border border-border overflow-hidden h-9" role="radiogroup" aria-label="Tipo do investimento">
              {(
                [
                  ["percentual", "% do preço"],
                  ["valor", "R$"],
                ] as const
              ).map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={anuncioTipo === v}
                  onClick={() => setAnuncioTipo(v)}
                  className={`px-3 text-xs ${anuncioTipo === v ? "bg-accent-soft text-accent font-medium" : "text-text-secondary hover:bg-surface-2"}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2">
            <label className="text-xs text-text-secondary mb-1.5 block">Margem que quer manter depois do anúncio (%)</label>
            <CampoNumero
              min={0}
              max={90}
              value={margemAlvoAnuncio}
              onChange={(n) => setMargemAlvoAnuncio(Math.min(90, Math.max(0, n)))}
              className={inputClass}
            />
          </div>

          {a.gastoPorVenda > 0 && (
            <div className="mt-3 pt-3 border-t border-border text-sm space-y-1">
              <Linha rotulo="Gasto com anúncio por venda" valor={formatBRL(a.gastoPorVenda)} />
              <Linha rotulo="ROAS deste investimento" valor={roas(a.roasAtual)} />
              <Linha
                rotulo="Lucro depois do anúncio"
                valor={`${formatBRL(a.lucroDepois)} (${pct(a.margemDepoisPct)})`}
                classe={a.lucroDepois >= 0 ? "text-positive" : "text-negative"}
                forte
              />
              {a.lucroDepois < 0 && <p className="text-xs text-negative">Com esse investimento cada venda dá prejuízo. Aumente o preço ou reduza o anúncio.</p>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function Metrica({ rotulo, valor, dica, tom }: { rotulo: string; valor: string; dica: string; tom?: "negativo" }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-2.5">
      <div className="text-[11px] text-text-tertiary">{rotulo}</div>
      <div className={`font-mono text-lg font-semibold ${tom === "negativo" ? "text-negative" : "text-text-primary"}`}>{valor}</div>
      <div className="text-[11px] text-text-tertiary">{dica}</div>
    </div>
  );
}

function Linha({ rotulo, valor, classe = "text-text-primary", forte }: { rotulo: string; valor: string; classe?: string; forte?: boolean }) {
  return (
    <div className={`flex justify-between ${forte ? "font-medium" : ""}`}>
      <span className="text-text-secondary">{rotulo}</span>
      <span className={`font-mono ${classe}`}>{valor}</span>
    </div>
  );
}

"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { campoBase } from "@/components/ui/Modal";
import { formatBRL } from "@/lib/format";
import type { EstadoPrecificacao } from "@/lib/precificacao-estado";

/** Preços de anúncios concorrentes, usados na Estratégia Sugerida. Extraído de
 * `PrecificacaoClient.tsx` — ver comentário em `PainelEntradas.tsx`. */
export function PainelConcorrentes({ estado }: { estado: EstadoPrecificacao }) {
  const {
    produtoId,
    concorrentes,
    novoConcorrenteNome,
    setNovoConcorrenteNome,
    novoConcorrenteLink,
    setNovoConcorrenteLink,
    novoConcorrentePreco,
    setNovoConcorrentePreco,
    adicionarConcorrente,
    removerConcorrente,
  } = estado;

  return (
    <Card>
      <h3 className="text-sm font-medium text-text-primary mb-1">Preços dos Concorrentes</h3>
      <p className="text-xs text-text-tertiary mb-3">
        Adicione o preço de anúncios parecidos para receber uma sugestão de posicionamento.
        {produtoId ? " Salvo automaticamente neste produto." : " Vincule a um produto cadastrado para salvar e reaproveitar depois."}
      </p>
      <div className="flex gap-2 mb-3 flex-wrap">
        <input
          value={novoConcorrenteNome}
          onChange={(e) => setNovoConcorrenteNome(e.target.value)}
          placeholder="Loja / anúncio concorrente"
          className={`${campoBase} flex-1 min-w-[140px]`}
        />
        <input
          value={novoConcorrenteLink}
          onChange={(e) => setNovoConcorrenteLink(e.target.value)}
          placeholder="Link (opcional)"
          className={`${campoBase} flex-1 min-w-[140px]`}
        />
        <input
          type="number"
          step="0.01"
          value={novoConcorrentePreco}
          onChange={(e) => setNovoConcorrentePreco(e.target.value === "" ? "" : Number(e.target.value))}
          placeholder="Preço"
          className="w-28 h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-sm text-text-primary outline-none focus:border-accent"
        />
        <Button variant="secondary" onClick={adicionarConcorrente}>
          Adicionar
        </Button>
      </div>
      {concorrentes.length > 0 && (
        <div className="border border-border rounded-md divide-y divide-border">
          {concorrentes.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <span className="text-text-primary">{c.nome}</span>
                {c.link && (
                  <>
                    {" · "}
                    <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                      ver anúncio
                    </a>
                  </>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-text-secondary">{formatBRL(c.preco)}</span>
                <button onClick={() => removerConcorrente(c.id)} className="text-text-tertiary hover:text-negative">
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

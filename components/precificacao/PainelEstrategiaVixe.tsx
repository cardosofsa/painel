"use client";

import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Modal";
import { IconeLampiao } from "@/components/ui/IconeLampiao";
import { DiagnosticoVixe } from "@/components/vixe/DiagnosticoVixe";
import type { EstadoPrecificacao } from "@/lib/precificacao-estado";

export const ID_ESTRATEGIA_VIXE = "estrategia-vixe";

/**
 * Estratégia da Vixe dentro da Precificação: lê os números desta tela (preço, taxas, zona
 * morta, concorrentes, anúncio) e sugere o que fazer. O preço sugerido é recalculado aqui;
 * "Testar" troca a calculadora para esse preço, e a resposta é salva junto com o anúncio.
 */
export function PainelEstrategiaVixe({ estado, iaDisponivel }: { estado: EstadoPrecificacao; iaDisponivel: boolean }) {
  const {
    objetivoEstrategia,
    setObjetivoEstrategia,
    instrucaoEstrategia,
    setInstrucaoEstrategia,
    estrategia,
    estrategiaVelha,
    pedindoEstrategia,
    pedirEstrategia,
    resultado,
    resultadoNoPreco,
    setModo,
    setPrecoFixo,
  } = estado;

  return (
    <div id={ID_ESTRATEGIA_VIXE} className="scroll-mt-4">
    <Card>
      <div className="flex items-center gap-2 mb-1">
        <IconeLampiao size={15} />
        <h3 className="text-sm font-medium text-text-primary">Estratégia da Vixe</h3>
      </div>
      <p className="text-xs text-text-tertiary mb-3">Ela lê os números desta tela e diz o que fazer com o preço. Nada muda sem você aplicar.</p>

      {!iaDisponivel ? (
        <p className="text-sm text-text-secondary">Nenhuma IA disponível para a sua conta. Cadastre a sua em Configurações → IA.</p>
      ) : (
        <>
          <div className="flex gap-2 mb-3" role="radiogroup" aria-label="Objetivo">
            {(
              [
                ["margem", "Ganhar mais por venda"],
                ["volume", "Vender mais"],
              ] as const
            ).map(([v, r]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={objetivoEstrategia === v}
                onClick={() => setObjetivoEstrategia(v)}
                className={`flex-1 rounded-md border px-2 py-1.5 text-xs ${objetivoEstrategia === v ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            className={`${inputClass} mb-3`}
            value={instrucaoEstrategia}
            maxLength={300}
            onChange={(e) => setInstrucaoEstrategia(e.target.value)}
            placeholder="Algo a considerar? Ex: produto novo, sem avaliações"
            aria-label="Algo a considerar"
          />
          <Button variant="primary" className="w-full" loading={pedindoEstrategia} disabled={!resultado.viavel} onClick={() => pedirEstrategia()}>
            <Sparkles size={14} /> {estrategia ? "Pedir de novo" : "Pedir estratégia"}
          </Button>

          {estrategia && (
            <div className="mt-4 border-t border-border pt-4">
              {estrategiaVelha && <p className="text-xs text-negative mb-3">Os números mudaram desde esta resposta. Peça de novo para atualizar.</p>}
              <DiagnosticoVixe
                diagnostico={estrategia.diagnostico}
                simulado={estrategia.diagnostico.precoSugerido != null ? resultadoNoPreco(estrategia.diagnostico.precoSugerido) : null}
                atual={resultado}
                rodape={estrategia.rodape}
                doCache={estrategia.doCache}
                podeSalvar={false}
                salvando={false}
                onTestar={(p) => {
                  setModo("preco");
                  setPrecoFixo(p);
                }}
                onSalvar={() => undefined}
              />
              {!estrategiaVelha && <p className="text-[11px] text-text-tertiary mt-2">Ao clicar em Salvar Anúncio, esta estratégia vai junto para o histórico.</p>}
            </div>
          )}
        </>
      )}
    </Card>
    </div>
  );
}

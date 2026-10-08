"use client";
import { CampoNumero } from "@/components/ui/CampoNumero";

import { TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { inputClass } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { formatBRL } from "@/lib/format";
import { formatarFaixaLabel, type ZonaMorta } from "@/lib/pricing";
import type { EstadoPrecificacao, LojaOpcao } from "@/lib/precificacao-estado";
import { ID_ESTRATEGIA_VIXE } from "@/components/precificacao/PainelEstrategiaVixe";

/**
 * Manual ou por loja cadastrada, mais a Taxa Adicional e o Imposto/DAS. Extraído de
 * `PrecificacaoClient.tsx` sem mudança de comportamento — ver comentário em
 * `PainelEntradas.tsx` sobre por que recebe o `estado` inteiro.
 */
export function PainelTaxas({ estado, lojas, iaDisponivel = false }: { estado: EstadoPrecificacao; lojas: LojaOpcao[]; iaDisponivel?: boolean }) {
  const {
    modoTaxas,
    setModoTaxas,
    lojaId,
    setLojaId,
    lojaSelecionada,
    canaisAgrupados,
    faixaShopee,
    zonaMorta,
    aplicarPrecoMelhor,
    taxaFixa,
    setTaxaFixa,
    taxaVariavelPct,
    setTaxaVariavelPct,
    taxaAdicionalPct,
    setTaxaAdicionalPct,
    impostoPct,
    setImpostoPct,
  } = estado;

  return (
    <Card>
      <h3 className="text-sm font-medium text-text-primary mb-3">Taxas da Plataforma</h3>
      <div className="flex gap-2 mb-4 flex-wrap">
        <Chip onClick={() => setModoTaxas("manual")} ativo={modoTaxas === "manual"}>
          Manual
        </Chip>
        <Chip onClick={() => setModoTaxas("loja")} ativo={modoTaxas === "loja"}>
          Selecionar Loja
        </Chip>
      </div>

      {modoTaxas === "loja" && (
        <div className="mb-4">
          {lojas.length > 0 ? (
            <>
              <label className="text-xs text-text-secondary mb-1.5 block">Loja</label>
              <select value={lojaId ?? ""} onChange={(e) => setLojaId(e.target.value || null)} className={inputClass}>
                <option value="">Selecione…</option>
                {canaisAgrupados.map((canalNome) => (
                  <optgroup label={canalNome} key={canalNome}>
                    {lojas
                      .filter((l) => l.canalNome === canalNome)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nome}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </>
          ) : (
            <p className="text-xs text-text-tertiary">
              Nenhuma loja cadastrada ainda. Cadastre em Configurações → Canais de Venda.
            </p>
          )}
        </div>
      )}

      {modoTaxas === "manual" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Taxa Fixa (R$)</label>
            <CampoNumero
              value={taxaFixa}
              onChange={(n) => setTaxaFixa(n)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Taxa Variável (%)</label>
            <CampoNumero
              value={taxaVariavelPct}
              onChange={(n) => setTaxaVariavelPct(n)}
              className={inputClass}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Taxa Adicional (%)</label>
          <CampoNumero
            value={taxaAdicionalPct}
            onChange={(n) => setTaxaAdicionalPct(n)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="text-xs text-text-secondary mb-1.5 block">Imposto / DAS (%)</label>
          <CampoNumero
            value={impostoPct}
            onChange={(n) => setImpostoPct(n)}
            className={inputClass}
          />
        </div>
      </div>

      {modoTaxas === "loja" &&
        lojaSelecionada &&
        (lojaSelecionada.tipoTaxa === "faixas" && lojaSelecionada.faixas.length > 0 ? (
          faixaShopee && (
            <>
              <p className="text-xs text-text-tertiary mt-2 bg-surface-2 rounded-md p-2">
                Faixa aplicada: {formatarFaixaLabel(faixaShopee)} · comissão {faixaShopee.comissaoPct}% + {formatBRL(faixaShopee.tarifaFixa)}
              </p>
              <AvisoZonaMorta
                zona={zonaMorta}
                onAplicar={aplicarPrecoMelhor}
                onEstrategia={
                  iaDisponivel
                    ? () => {
                        document.getElementById(ID_ESTRATEGIA_VIXE)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        estado.pedirEstrategia("margem");
                      }
                    : null
                }
              />
            </>
          )
        ) : (
          <p className="text-xs text-text-tertiary mt-2">
            Comissão {lojaSelecionada.comissaoPct}% · Taxa fixa {formatBRL(lojaSelecionada.taxaFixa)}
            {lojaSelecionada.taxaExtraValor != null &&
              lojaSelecionada.taxaExtraTipo &&
              ` · Extra ${
                lojaSelecionada.taxaExtraTipo === "percentual"
                  ? `${lojaSelecionada.taxaExtraValor}%`
                  : formatBRL(lojaSelecionada.taxaExtraValor)
              }`}
          </p>
        ))}
    </Card>
  );
}

/**
 * Aviso da zona morta de comissão.
 *
 * É o alerta que paga o módulo inteiro: um preço R$ 5 maior pode render R$ 7 a MENOS por
 * venda, e nada na tela contava isso. Só aparece quando há zona morta de verdade — alerta
 * que vive na tela vira ruído e para de ser lido.
 */
function AvisoZonaMorta({
  zona,
  onAplicar,
  onEstrategia,
}: {
  zona: ZonaMorta | null;
  onAplicar: (preco: number) => void;
  /** Pede à Vixe uma estratégia para sair da zona morta (null sem IA). */
  onEstrategia: (() => void) | null;
}) {
  if (!zona) return null;

  return (
    <div className="mt-2 rounded-md border border-negative bg-negative-soft p-2.5">
      <div className="flex items-start gap-2">
        <TriangleAlert size={14} className="text-negative shrink-0 mt-0.5" />
        <div className="text-xs text-text-primary">
          <p className="font-medium mb-1">Este preço cai numa zona morta da comissão.</p>
          <p className="text-text-secondary">
            Entre {formatBRL(zona.inicio)} e {formatBRL(zona.fim)} a comissão sobe de faixa e você recebe menos do que
            receberia vendendo por {formatBRL(zona.precoMelhor)} — mesmo cobrando mais caro.
          </p>
          <p className="mt-1">
            Vendendo a {formatBRL(zona.precoMelhor)} sobram <strong>{formatBRL(zona.ganhoLiquido)} a mais</strong> por
            venda.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <button type="button" onClick={() => onAplicar(zona.precoMelhor)} className="text-accent hover:underline font-medium">
              Usar {formatBRL(zona.precoMelhor)}
            </button>
            {onEstrategia && (
              <button type="button" onClick={onEstrategia} className="text-accent hover:underline font-medium">
                Pedir estratégia à Vixe
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

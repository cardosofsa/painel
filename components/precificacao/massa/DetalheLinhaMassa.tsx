"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { PriceBreakdownChart } from "@/components/charts/PriceBreakdownChart";
import { formatBRL } from "@/lib/format";
import { taxasDaLinha, type ResultadoLinhaMassa } from "@/lib/precificacao-massa";
import {
  DetalhamentoPrecificacao,
  SimuladorPreco,
  type ResumoExport,
} from "@/components/precificacao/resultado-compartilhado";

/** Dados do resumo para copiar/WhatsApp/imagem — mesmo formato da calculadora individual. */
export function resumoDeResultadoEmMassa(r: ResultadoLinhaMassa): ResumoExport {
  const { taxaVariavelPct, taxaFixa } = taxasDaLinha(r);
  return {
    titulo: r.linha.nome || r.linha.sku || "Produto",
    precoVenda: r.resultado.precoVenda,
    custoTotal: r.resultado.custoTotal,
    taxaVariavelValor: r.resultado.taxaVariavelValor,
    taxaVariavelPct,
    taxaFixa,
    taxaAdicionalValor: r.resultado.taxaAdicionalValor,
    taxaAdicionalPct: 0,
    impostoValor: r.resultado.impostoValor,
    impostoPct: r.linha.impostoPct / 100,
    taxaExtraCalculada: r.resultado.taxaExtraCalculada,
    lucroLiquido: r.resultado.lucroLiquido,
    margemEfetivaPct: r.resultado.margemEfetivaPct,
    componentes: null,
    faixaVenda: null,
  };
}

/** Painel aberto ao expandir uma linha do resultado: detalhamento, simulador e gráfico. */
export function DetalheLinhaMassa({
  r,
  onCopiar,
  onWhatsapp,
  onImagem,
}: {
  r: ResultadoLinhaMassa;
  onCopiar: () => void;
  onWhatsapp: () => void;
  onImagem: () => void;
}) {
  const { taxaVariavelPct, taxaFixa } = taxasDaLinha(r);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card className={r.resultado.viavel ? "" : "border-negative/30 bg-negative-soft"}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-text-tertiary uppercase">
            Resultado — {r.linha.nome || r.linha.sku}
          </span>
          <StatusChip label={r.resultado.viavel ? "Viável" : "Inviável"} tone={r.resultado.viavel ? "positive" : "negative"} />
        </div>
        <div className="text-center py-4">
          <div className="text-xs text-text-tertiary mb-1">Preço de Venda Recomendado</div>
          <div className="font-mono text-4xl font-semibold text-accent">{formatBRL(r.resultado.precoVenda)}</div>
        </div>
        <div className="pt-4 border-t border-border text-sm space-y-1.5">
          <DetalhamentoPrecificacao
            aberto
            onToggle={() => {}}
            componentes={null}
            custoTotal={r.resultado.custoTotal}
            taxaVariavelValor={r.resultado.taxaVariavelValor}
            taxaVariavelPct={taxaVariavelPct}
            taxaFixa={taxaFixa}
            taxaAdicionalValor={r.resultado.taxaAdicionalValor}
            taxaAdicionalPct={0}
            taxaExtraCalculada={r.resultado.taxaExtraCalculada}
            impostoValor={r.resultado.impostoValor}
            impostoPct={r.linha.impostoPct / 100}
          />
          <div className="flex justify-between font-medium pt-1.5 border-t border-border">
            <span className="text-text-primary">Lucro líquido</span>
            <span className={`font-mono ${r.resultado.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
              {formatBRL(r.resultado.lucroLiquido)} ({(r.resultado.margemEfetivaPct * 100).toFixed(1)}%)
            </span>
          </div>
          <div className="flex justify-between text-text-tertiary text-xs">
            <span>Markup sobre custo</span>
            <span className="font-mono">{(r.resultado.markupSobreCustoPct * 100).toFixed(1)}%</span>
          </div>
        </div>
        <div className="mt-3">
          <SimuladorPreco
            custoTotal={r.resultado.custoTotal}
            taxas={{
              impostoPct: r.linha.impostoPct / 100,
              taxaFixa,
              taxaVariavelPct,
              taxaAdicionalPct: 0,
              taxaExtraValor: r.loja?.taxaExtraValor ?? undefined,
              taxaExtraTipo: r.loja?.taxaExtraTipo ?? null,
            }}
          />
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="secondary" className="flex-1" onClick={onCopiar}>
            Copiar
          </Button>
          <Button variant="secondary" className="flex-1" onClick={onWhatsapp}>
            Enviar WhatsApp
          </Button>
        </div>
        <Button variant="secondary" className="w-full mt-2" onClick={onImagem}>
          Imagem
        </Button>
      </Card>
      <Card>
        <span className="text-xs font-medium text-text-tertiary uppercase block mb-2">Composição do Preço</span>
        <PriceBreakdownChart
          data={[
            { nome: "Custo", valor: r.resultado.custoTotal },
            {
              nome: "Taxas da plataforma",
              valor:
                taxaFixa +
                r.resultado.taxaVariavelValor +
                r.resultado.taxaAdicionalValor +
                r.resultado.taxaExtraCalculada,
            },
            { nome: "Imposto", valor: r.resultado.impostoValor },
            { nome: "Lucro líquido", valor: Math.max(0, r.resultado.lucroLiquido) },
          ]}
        />
      </Card>
    </div>
  );
}

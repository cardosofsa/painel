"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Radar, TrendingDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBRL } from "@/lib/format";
import { montarRadar } from "@/lib/vixe/radar";
import type { DadosRadar } from "@/lib/vixe/radar-servidor";

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const METAS = [0.1, 0.15, 0.2, 0.25];

/** Vixe → Radar: produtos que deram prejuízo ou margem baixa, por canal, com preço sugerido. */
export function VixeRadar({ dados }: { dados: DadosRadar }) {
  const [meta, setMeta] = useState(0.15);
  const itens = useMemo(
    () =>
      montarRadar(
        dados.linhas,
        new Map(dados.produtos.map((p) => [p.id, p])),
        new Map(dados.lojas.map((l) => [l.id, l])),
        { margemAlvo: meta, impostoPct: dados.impostoPct },
      ),
    [dados, meta],
  );
  const perdido = itens.filter((i) => i.lucro < 0).reduce((s, i) => s + i.lucro, 0);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Radar size={20} className="text-accent mt-0.5" />
          <div>
            <div className="font-medium text-text-primary">Radar de prejuízo · últimos {dados.dias} dias</div>
            <p className="text-sm text-text-secondary">
              {itens.length === 0
                ? "Nenhum produto abaixo da margem alvo. Vixe!"
                : `${itens.length} produto(s) × canal abaixo de ${pct(meta)}${perdido < 0 ? `; o prejuízo somado foi de ${formatBRL(-perdido)}` : ""}.`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Margem alvo</span>
          {METAS.map((m) => (
            <Chip key={m} ativo={meta === m} onClick={() => setMeta(m)}>
              {pct(m)}
            </Chip>
          ))}
        </div>
      </Card>

      {itens.length === 0 ? (
        <Card>
          <EmptyState icon={TrendingDown} title="Tudo dentro da margem" description="Quando um produto vender com prejuízo ou abaixo da margem em algum canal, ele aparece aqui com o preço que resolve." />
        </Card>
      ) : (
        <div className="space-y-2">
          {itens.map((i) => (
            <Card key={`${i.produtoId}|${i.canal}`} className="grid grid-cols-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-3 items-center py-3">
              <div className="col-span-2 md:col-span-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 shrink-0 ${i.situacao === "prejuizo" ? "bg-negative-soft text-negative" : "bg-surface-2 text-text-secondary"}`}>
                    {i.situacao === "prejuizo" ? "Prejuízo" : "Margem baixa"}
                  </span>
                  <span className="truncate text-text-primary font-medium" title={i.nome}>
                    {i.nome}
                  </span>
                </div>
                <div className="text-xs text-text-tertiary truncate">
                  {i.sku ? <span className="font-mono">{i.sku}</span> : null} · {i.canalNome}
                </div>
              </div>
              <div className="text-sm">
                <div className={`font-mono ${i.lucro < 0 ? "text-negative" : "text-text-primary"}`}>
                  {formatBRL(i.lucro)} · {pct(i.margem)}
                </div>
                <div className="text-xs text-text-tertiary">
                  {i.unidades} un · receita {formatBRL(i.receita)}
                </div>
              </div>
              <div className="text-sm">
                <div className="font-mono text-text-primary">{formatBRL(i.precoMedio)}</div>
                <div className="text-xs text-text-tertiary">preço médio</div>
              </div>
              <div className="text-sm">
                {i.precoSugerido !== null ? (
                  <>
                    <div className="font-mono text-accent font-semibold">{formatBRL(i.precoSugerido)}</div>
                    <div className="text-xs text-text-tertiary">
                      sugerido p/ {pct(meta)}
                      {i.lucroHojeUnit !== null && i.lucroHojeUnit < 0 ? ` · hoje perde ${formatBRL(-i.lucroHojeUnit)}/un` : ""}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-text-tertiary">Sem custo cadastrado</div>
                )}
              </div>
              <Link href="/precificacao" className="text-xs text-accent hover:underline justify-self-end">
                Recalcular
              </Link>
            </Card>
          ))}
        </div>
      )}
      <p className="text-[11px] text-text-tertiary">
        Lucro por item = receita − custo − taxas do canal, imposto e desconto (rateados pela receita do pedido). O preço sugerido usa o custo de hoje e as taxas atuais do canal.
      </p>
    </div>
  );
}

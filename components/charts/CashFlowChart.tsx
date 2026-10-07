"use client";

import { AreaChart, Area, XAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import {
  ALTURA_GRAFICO,
  COR_POSITIVA,
  COR_NEGATIVA,
  ESTILO_TOOLTIP,
  ESTILO_ROTULO_TOOLTIP,
  TICK_EIXO,
  formatarMoedaTooltip,
} from "./tema";

/**
 * Entradas e saídas de caixa.
 *
 * As cores são as semânticas do sistema (`--positive` / `--negative`), não a escala
 * categórica: aqui a cor **significa** algo, e trocá-la contradiria o resto do painel,
 * onde verde é entrada e vermelho é saída. Antes eram `#4f46e5` e `#dc2626` fixos — o
 * vermelho fixo ignorava que o tema escuro usa um vermelho mais claro justamente porque
 * o escuro não lê sobre fundo preto.
 *
 * A legenda é obrigatória aqui: com duas séries, verde e vermelho sozinhos são
 * exatamente o par que alguém com daltonismo não separa.
 */
export function CashFlowChart({ data }: { data: { dia: string; entradas: number; saidas: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={ALTURA_GRAFICO.fluxoCaixa}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="entradasGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR_POSITIVA} stopOpacity={0.18} />
            <stop offset="100%" stopColor={COR_POSITIVA} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="saidasGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR_NEGATIVA} stopOpacity={0.12} />
            <stop offset="100%" stopColor={COR_NEGATIVA} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={TICK_EIXO} dy={4} />
        <Tooltip
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          cursor={{ stroke: "var(--border-forte)", strokeWidth: 1 }}
          formatter={formatarMoedaTooltip}
        />
        <Legend
          verticalAlign="top"
          height={28}
          iconType="plainline"
          iconSize={14}
          formatter={(value) => (
            <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>
              {value === "entradas" ? "Entradas" : "Saídas"}
            </span>
          )}
        />
        <Area type="monotone" dataKey="entradas" stroke={COR_POSITIVA} strokeWidth={2} fill="url(#entradasGrad)" />
        <Area type="monotone" dataKey="saidas" stroke={COR_NEGATIVA} strokeWidth={1.5} fill="url(#saidasGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

"use client";

import { ComposedChart, Area, Line, XAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ALTURA_GRAFICO, COR_SERIE, COR_POSITIVA, ESTILO_TOOLTIP, ESTILO_ROTULO_TOOLTIP, TICK_EIXO, formatarMoedaTooltip } from "./tema";

/**
 * Faturamento (área, cor da marca) e lucro (linha, verde) por dia. Legenda obrigatória:
 * com duas séries a cor sozinha não basta.
 */
export function FaturamentoLucroChart({ data }: { data: { dia: string; faturamento: number; lucro: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={ALTURA_GRAFICO.faturamentoLucro}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="fatGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR_SERIE} stopOpacity={0.18} />
            <stop offset="100%" stopColor={COR_SERIE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={TICK_EIXO} dy={4} minTickGap={16} />
        <Tooltip contentStyle={ESTILO_TOOLTIP} labelStyle={ESTILO_ROTULO_TOOLTIP} cursor={{ stroke: "var(--border-forte)", strokeWidth: 1 }} formatter={formatarMoedaTooltip} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Area type="monotone" dataKey="faturamento" name="Faturamento" stroke={COR_SERIE} strokeWidth={2} fill="url(#fatGrad)" />
        <Line type="monotone" dataKey="lucro" name="Lucro" stroke={COR_POSITIVA} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

"use client";

import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { ALTURA_GRAFICO, COR_SERIE, ESTILO_TOOLTIP, ESTILO_ROTULO_TOOLTIP, TICK_EIXO, formatarMoedaTooltip } from "./tema";

export function SalesChart({ data }: { data: { dia: string; vendas: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={ALTURA_GRAFICO.vendas}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="vendasGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR_SERIE} stopOpacity={0.2} />
            <stop offset="100%" stopColor={COR_SERIE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={TICK_EIXO} dy={4} />
        <Tooltip
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          cursor={{ stroke: "var(--border-forte)", strokeWidth: 1 }}
          formatter={formatarMoedaTooltip}
        />
        <Area type="monotone" dataKey="vendas" stroke={COR_SERIE} strokeWidth={2} fill="url(#vendasGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

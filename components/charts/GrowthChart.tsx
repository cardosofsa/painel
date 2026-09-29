"use client";

import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import { COR_SERIE, ESTILO_TOOLTIP, ESTILO_ROTULO_TOOLTIP, TICK_EIXO } from "./tema";

/**
 * Mesmo esqueleto de `SalesChart.tsx`, mas para contagem (contas acumuladas), não dinheiro.
 * Não dá para reaproveitar o `SalesChart` aqui: o formatter do tooltip dele está fixo em
 * moeda, e "3 contas" formatado como "R$ 3,00" seria confuso.
 */
export function GrowthChart({ data }: { data: { dia: string; contas: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="crescimentoGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR_SERIE} stopOpacity={0.2} />
            <stop offset="100%" stopColor={COR_SERIE} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={TICK_EIXO} dy={4} />
        <Tooltip
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          cursor={{ stroke: "var(--border-forte)", strokeWidth: 1 }}
          formatter={(value) => [`${value} conta(s)`, "Total acumulado"]}
        />
        <Area type="monotone" dataKey="contas" stroke={COR_SERIE} strokeWidth={2} fill="url(#crescimentoGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { ALTURA_GRAFICO, COR_SERIE, ESTILO_TOOLTIP, ESTILO_ROTULO_TOOLTIP, TICK_EIXO, formatarMoedaTooltip } from "./tema";

export function PriceHistoryChart({ data }: { data: { data: string; preco: number }[] }) {
  const pontos = [...data]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((p) => ({ ...p, dataLabel: new Date(p.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }));

  if (pontos.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={ALTURA_GRAFICO.historicoPreco}>
      <LineChart data={pontos} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--grafico-grade)" vertical={false} />
        <XAxis dataKey="dataLabel" tick={TICK_EIXO} axisLine={false} tickLine={false} />
        <YAxis
          tick={TICK_EIXO}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
        />
        <Tooltip
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          cursor={{ stroke: "var(--border-forte)", strokeWidth: 1 }}
          formatter={formatarMoedaTooltip}
          labelFormatter={(label) => label}
        />
        {/* Ponto de 8px: abaixo disso o alvo de toque some no celular. */}
        <Line
          type="monotone"
          dataKey="preco"
          stroke={COR_SERIE}
          strokeWidth={2}
          dot={{ r: 4, fill: "var(--surface-1)", stroke: COR_SERIE, strokeWidth: 2 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

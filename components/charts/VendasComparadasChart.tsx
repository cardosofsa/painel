"use client";

import { Bar, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ALTURA_GRAFICO, COR_SERIE, CORES_CATEGORICAS, ESTILO_ROTULO_TOOLTIP, ESTILO_TOOLTIP, TICK_EIXO } from "./tema";
import { formatBRL } from "@/lib/format";

export interface PontoComparado {
  rotulo: string;
  valor: number;
  /** Mesmo ponto do período de comparação (ontem, ou o período anterior). */
  comparacao: number;
  pedidos: number;
}

/**
 * Valor de vendas (linha cheia) contra o período de comparação (tracejada) e a quantidade
 * de pedidos (barras, eixo da direita) — como no painel do ERP.
 */
export function VendasComparadasChart({ data, rotuloComparacao }: { data: PontoComparado[]; rotuloComparacao: string }) {
  return (
    <ResponsiveContainer width="100%" height={ALTURA_GRAFICO.vendasComparadas}>
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <XAxis dataKey="rotulo" axisLine={false} tickLine={false} tick={TICK_EIXO} dy={4} minTickGap={12} />
        <YAxis yAxisId="valor" hide />
        <YAxis yAxisId="pedidos" orientation="right" allowDecimals={false} axisLine={false} tickLine={false} tick={TICK_EIXO} width={28} />
        <Tooltip
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          cursor={{ fill: "var(--surface-2)" }}
          formatter={(v, nome) => (nome === "Pedidos" ? [String(v), nome] : [formatBRL(Number(v)), nome])}
        />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
        <Bar yAxisId="pedidos" dataKey="pedidos" name="Pedidos" fill={CORES_CATEGORICAS[1]} fillOpacity={0.35} radius={[3, 3, 0, 0]} maxBarSize={18} />
        <Line yAxisId="valor" type="monotone" dataKey="comparacao" name={rotuloComparacao} stroke={CORES_CATEGORICAS[2]} strokeDasharray="5 4" strokeWidth={1.5} dot={false} />
        <Line yAxisId="valor" type="monotone" dataKey="valor" name="Valor de vendas" stroke={COR_SERIE} strokeWidth={2.2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

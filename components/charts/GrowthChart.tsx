"use client";

import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";

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
            <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="dia" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} dy={4} />
        <Tooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
          labelStyle={{ color: "var(--text-primary)" }}
          formatter={(value) => [`${value} conta(s)`, "Total acumulado"]}
        />
        <Area type="monotone" dataKey="contas" stroke="#4f46e5" strokeWidth={2} fill="url(#crescimentoGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

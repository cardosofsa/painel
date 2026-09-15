"use client";

import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from "recharts";

export function CashFlowChart({ data }: { data: { dia: string; entradas: number; saidas: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="entradasGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="saidasGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dc2626" stopOpacity={0.12} />
            <stop offset="100%" stopColor="#dc2626" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="dia"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
          dy={4}
        />
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
          formatter={(value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        />
        <Area type="monotone" dataKey="entradas" stroke="#4f46e5" strokeWidth={2} fill="url(#entradasGrad)" />
        <Area type="monotone" dataKey="saidas" stroke="#dc2626" strokeWidth={1.5} fill="url(#saidasGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

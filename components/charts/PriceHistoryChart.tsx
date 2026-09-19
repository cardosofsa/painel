"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export function PriceHistoryChart({ data }: { data: { data: string; preco: number }[] }) {
  const pontos = [...data]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((p) => ({ ...p, dataLabel: new Date(p.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) }));

  if (pontos.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={pontos} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="dataLabel" tick={{ fontSize: 11, fill: "var(--text-tertiary)" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--text-tertiary)" }}
          axisLine={false}
          tickLine={false}
          width={56}
          tickFormatter={(v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
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
          formatter={(value) => Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          labelFormatter={(label) => label}
        />
        <Line type="monotone" dataKey="preco" stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

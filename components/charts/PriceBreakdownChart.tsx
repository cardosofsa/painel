"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const CORES = ["#64748b", "#f59e0b", "#ef4444", "#4f46e5"];

export function PriceBreakdownChart({
  data,
}: {
  data: { nome: string; valor: number }[];
}) {
  const dados = data.filter((d) => d.valor > 0);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius={55} outerRadius={80} paddingAngle={2}>
          {dados.map((_, i) => (
            <Cell key={i} fill={CORES[i % CORES.length]} />
          ))}
        </Pie>
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
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

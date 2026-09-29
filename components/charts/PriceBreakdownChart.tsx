"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { CORES_CATEGORICAS, ESTILO_TOOLTIP, ESTILO_ROTULO_TOOLTIP, formatarMoedaTooltip } from "./tema";

/**
 * Composição do preço: para onde vai cada real cobrado (custo, imposto, comissão, lucro).
 *
 * Única escala categórica do sistema. As quatro cores são atribuídas **em ordem fixa** e
 * nunca cicladas — uma quinta fatia receberia uma cor repetida, e duas fatias da mesma
 * cor num donut é leitura errada garantida. Como hoje a composição tem no máximo quatro
 * partes, o `slice(0, 4)` é uma trava, não um limite arbitrário.
 *
 * A legenda é obrigatória: sem ela a identidade da fatia dependeria só da cor.
 */
export function PriceBreakdownChart({ data }: { data: { nome: string; valor: number }[] }) {
  const dados = data.filter((d) => d.valor > 0).slice(0, CORES_CATEGORICAS.length);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius={55} outerRadius={80} paddingAngle={2}>
          {dados.map((d, i) => (
            // `stroke` na cor da superfície: é o respiro de 2px que separa fatias
            // vizinhas sem depender de elas terem cores diferentes o bastante.
            <Cell key={d.nome} fill={CORES_CATEGORICAS[i]} stroke="var(--surface-1)" strokeWidth={2} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          formatter={formatarMoedaTooltip}
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

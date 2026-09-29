"use client";

import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  COR_SERIE,
  ESTILO_TOOLTIP,
  ESTILO_ROTULO_TOOLTIP,
  TICK_EIXO,
  CURSOR_BARRA,
  formatarMoedaTooltip,
} from "./tema";

/**
 * Uma série só: todas as barras usam a mesma cor.
 *
 * Antes havia um `<Cell>` por barra, todos com o mesmo `fill` — um laço que dava trabalho
 * e não produzia diferença nenhuma. Pintar cada barra de uma cor gastaria o canal de
 * identidade para recodificar o que o comprimento da barra já mostra.
 */
export function CategoryBarChart({ data }: { data: { categoria: string; valor: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <XAxis
          dataKey="categoria"
          axisLine={false}
          tickLine={false}
          tick={TICK_EIXO}
          interval={0}
          angle={-10}
          dy={8}
          height={40}
        />
        <Tooltip
          cursor={CURSOR_BARRA}
          contentStyle={ESTILO_TOOLTIP}
          labelStyle={ESTILO_ROTULO_TOOLTIP}
          formatter={formatarMoedaTooltip}
        />
        <Bar dataKey="valor" radius={[4, 4, 0, 0]} fill={COR_SERIE} fillOpacity={0.9} />
      </BarChart>
    </ResponsiveContainer>
  );
}

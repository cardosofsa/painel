import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { formatBRL } from "@/lib/format";

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

interface Ind {
  pedidos: number;
  valor: number;
  lucro: number;
  margem: number;
  ticket: number;
}

/** Valor de vendas válidas, pedidos válidos, lucro e ticket, com a variação ao período anterior. */
export function KpisVendas({ atual, anterior, rotuloAnterior }: { atual: Ind; anterior: Ind; rotuloAnterior: string }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      <Kpi rotulo="Valor de vendas válidas" valor={formatBRL(atual.valor)} delta={variacao(atual.valor, anterior.valor)} comparado={`${rotuloAnterior}: ${formatBRL(anterior.valor)}`} />
      <Kpi rotulo="Pedidos válidos" valor={String(atual.pedidos)} delta={variacao(atual.pedidos, anterior.pedidos)} comparado={`${rotuloAnterior}: ${anterior.pedidos}`} />
      <Kpi rotulo="Lucro" valor={formatBRL(atual.lucro)} delta={variacao(atual.lucro, anterior.lucro)} comparado={`margem ${pct(atual.margem)}`} tom={atual.lucro < 0 ? "negativo" : "positivo"} />
      <Kpi rotulo="Ticket médio" valor={formatBRL(atual.ticket)} delta={variacao(atual.ticket, anterior.ticket)} comparado={`${rotuloAnterior}: ${formatBRL(anterior.ticket)}`} />
    </div>
  );
}

function variacao(a: number, b: number): number | null {
  if (!b) return null;
  return (a - b) / Math.abs(b);
}

function Kpi({ rotulo, valor, delta, comparado, tom }: { rotulo: string; valor: string; delta: number | null; comparado: string; tom?: "positivo" | "negativo" }) {
  const Icone = delta != null && delta < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <Card padding="compacto">
      <CardEyebrow>{rotulo}</CardEyebrow>
      <div className={`text-xl font-semibold font-mono tabular ${tom === "negativo" ? "text-negative" : tom === "positivo" ? "text-positive" : "text-text-primary"}`}>{valor}</div>
      <div className="flex flex-wrap items-center justify-between gap-x-2 text-[11px] text-text-tertiary mt-0.5">
        <span className="truncate">{comparado}</span>
        {delta != null && (
          <span className={`inline-flex items-center ${delta >= 0 ? "text-positive" : "text-negative"}`}>
            <Icone size={11} /> {delta > 0 ? "+" : ""}
            {pct(delta)}
          </span>
        )}
      </div>
    </Card>
  );
}

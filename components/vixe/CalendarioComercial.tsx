import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { proximasDatas } from "@/lib/calendario-comercial";

/** Próximas datas que vendem (11.6), com quanto falta e o que preparar. */
export function CalendarioComercial({ hoje, janela = 60 }: { hoje: Date; janela?: number }) {
  const datas = proximasDatas(hoje, janela);
  if (!datas.length) return null;
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={16} className="text-accent" />
        <h3 className="text-sm font-medium text-text-primary">Próximas datas comerciais</h3>
      </div>
      <ul className="space-y-2">
        {datas.map((d) => (
          <li key={d.id} className="flex items-start gap-3 text-sm">
            <span className={`shrink-0 w-16 text-center rounded-md px-1.5 py-1 text-[11px] font-mono ${d.preparar ? "bg-accent-soft text-accent font-semibold" : "bg-surface-2 text-text-secondary"}`}>
              {d.faltam === 0 ? "hoje" : `${d.faltam} dia${d.faltam > 1 ? "s" : ""}`}
            </span>
            <div className="min-w-0">
              <div className="text-text-primary font-medium">
                {d.nome}{" "}
                <span className="text-xs font-normal text-text-tertiary">{new Date(`${d.data}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
              </div>
              <div className="text-xs text-text-secondary">
                {d.preparar ? "Hora de preparar: " : ""}
                {d.dica}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

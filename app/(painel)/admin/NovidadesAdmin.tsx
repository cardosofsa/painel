import { Sparkles } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { NOVIDADES } from "@/lib/novidades";
import { formatarDataIso } from "@/lib/format";

/** O que entrou no sistema, mais novo primeiro (`lib/novidades.ts`). */
export function NovidadesAdmin() {
  return (
    <div className="space-y-3 max-w-3xl">
      {NOVIDADES.map((n) => (
        <Card key={`${n.data}-${n.titulo}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent" aria-hidden /> {n.titulo}
            </CardTitle>
            <span className="text-xs text-text-tertiary font-mono">{formatarDataIso(n.data)}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm text-text-secondary list-disc pl-5">
            {n.itens.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
          {(n.migracao || n.pr) && (
            <p className="mt-3 text-xs text-text-tertiary">
              {n.migracao && <>Migração {n.migracao}</>}
              {n.migracao && n.pr && " · "}
              {n.pr && <>PR #{n.pr}</>}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

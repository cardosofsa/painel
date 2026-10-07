import Link from "next/link";
import { formatarData } from "@/lib/format";
import { Card, CardEyebrow } from "@/components/ui/Card";

export interface PedidoPlano {
  user_id: string;
  email: string;
  plano: string;
  solicitado_em: string | null;
}

/** Admin: contas que pediram troca de plano e esperam a ativação (10.9). */
export function PedidosPlano({ pedidos }: { pedidos: PedidoPlano[] }) {
  if (!pedidos.length) return null;
  return (
    <Card className="mb-4">
      <CardEyebrow>Pedidos de plano ({pedidos.length})</CardEyebrow>
      <ul className="divide-y divide-border mt-2">
        {pedidos.map((p) => (
          <li key={p.user_id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="text-text-primary truncate">{p.email}</span>
            <span className="text-text-secondary shrink-0">
              {p.plano}
              {p.solicitado_em ? ` · ${formatarData(p.solicitado_em)}` : ""}
            </span>
            <Link href={`/admin/${p.user_id}`} className="text-xs text-accent hover:underline shrink-0">
              Abrir
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

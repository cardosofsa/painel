import Link from "next/link";
import { ArrowRight, Clock, Sparkles } from "lucide-react";
import type { AvisoAtivacao } from "@/lib/ativacao-teste";

/**
 * Uma linha discreta no topo do Dashboard durante o teste grátis (`lib/ativacao-teste.ts`).
 * Não repete o checklist dos Primeiros passos: diz só o próximo passo do dia, ou o prazo.
 */
export function AvisoTeste({ aviso }: { aviso: AvisoAtivacao }) {
  const Icone = aviso.tipo === "fim" ? Clock : Sparkles;
  const cor = aviso.tom === "negative" ? "text-negative" : "text-accent";
  return (
    <p role="status" className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text-secondary">
      <span className="inline-flex items-center gap-2">
        <Icone size={15} className={`shrink-0 ${cor}`} aria-hidden />
        {aviso.texto}
      </span>
      <Link href={aviso.href} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
        {aviso.acao} <ArrowRight size={14} aria-hidden />
      </Link>
    </p>
  );
}

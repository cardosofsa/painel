import Link from "next/link";
import type { AcaoData } from "@/lib/calendario-acoes";

/** Atalhos de uma data do comércio (lib/calendario-acoes.ts), em linha, discretos. */
export function AcoesData({ acoes }: { acoes: AcaoData[] }) {
  if (!acoes.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {acoes.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="inline-flex items-center rounded-full border border-border bg-surface-1 px-2 py-0.5 text-xs text-accent hover:border-accent hover:bg-accent-soft"
        >
          {a.rotulo} ›
        </Link>
      ))}
    </div>
  );
}

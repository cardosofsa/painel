import type { ReactNode } from "react";
import Link from "next/link";
import { LogoSertao } from "@/components/ui/LogoSertao";
import { ATUALIZADO_EM } from "@/lib/legal";

/** Casca das páginas legais: marca no topo, texto legível e atalho para a outra página. */
export function PaginaLegal({
  titulo,
  outra,
  children,
}: {
  titulo: string;
  outra: { href: string; texto: string };
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/login" className="flex items-center gap-2 mb-6 w-fit">
          <LogoSertao tamanho={34} />
          <span className="font-semibold tracking-tight text-text-primary text-lg">Sertão</span>
        </Link>
        <article className="bg-surface-1 border border-border rounded-lg shadow-elev-1 p-6 sm:p-8 text-sm text-text-secondary leading-relaxed [&_h2]:text-text-primary [&_h2]:font-semibold [&_h2]:text-base [&_h2]:mt-6 [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_p]:mb-2 [&_a]:text-accent [&_a:hover]:underline">
          <h1 className="text-xl font-semibold text-text-primary">{titulo}</h1>
          <p className="text-xs text-text-tertiary mt-1">Atualizado em {ATUALIZADO_EM}</p>
          {children}
        </article>
        <p className="text-xs text-text-tertiary text-center mt-4">
          <Link href={outra.href} className="hover:underline">
            {outra.texto}
          </Link>
          {" · "}
          <Link href="/login" className="hover:underline">
            Voltar ao sistema
          </Link>
        </p>
      </div>
    </div>
  );
}

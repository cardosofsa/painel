"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Segmentos da Vixe. O menu lateral tem uma entrada só ("Vixe"); daqui a pessoa escolhe o
 * que quer. Segmento ainda não construído aparece como "em breve", sem link.
 */
const SEGMENTOS: { href: string; rotulo: string; pronto: boolean }[] = [
  { href: "/vixe", rotulo: "Alertas", pronto: true },
  { href: "/vixe/preco", rotulo: "Preço", pronto: true },
  { href: "/vixe/textos", rotulo: "Textos", pronto: true },
  { href: "/vixe/insights", rotulo: "Insights", pronto: false },
  { href: "/vixe/vitrine", rotulo: "Vitrine", pronto: false },
];

export function SegmentosVixe() {
  const pathname = usePathname();
  return (
    <nav aria-label="Segmentos da Vixe" className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
      {SEGMENTOS.map((s) => {
        const ativo = s.href === "/vixe" ? pathname === "/vixe" : pathname.startsWith(s.href);
        const base = "shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors";
        if (!s.pronto) {
          return (
            <span key={s.href} className={`${base} border-transparent text-text-tertiary cursor-default`} title="Em construção">
              {s.rotulo} <span className="text-[10px] uppercase tracking-wide">em breve</span>
            </span>
          );
        }
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={ativo ? "page" : undefined}
            className={`${base} ${
              ativo ? "border-accent text-accent font-medium" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {s.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

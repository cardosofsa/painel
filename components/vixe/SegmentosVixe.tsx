"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Segmentos da Vixe. O menu lateral tem uma entrada só ("Vixe"); daqui a pessoa escolhe o que quer. */
const SEGMENTOS: { href: string; rotulo: string }[] = [
  { href: "/vixe", rotulo: "Alertas" },
  { href: "/vixe/preco", rotulo: "Preço" },
  { href: "/vixe/textos", rotulo: "Textos" },
  { href: "/vixe/insights", rotulo: "Insights" },
  { href: "/vixe/radar", rotulo: "Radar" },
  { href: "/vixe/mensagens", rotulo: "Mensagens" },
  { href: "/vixe/avaliacoes", rotulo: "Avaliações" },
];

export function SegmentosVixe() {
  const pathname = usePathname();
  return (
    <nav aria-label="Segmentos da Vixe" className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
      {SEGMENTOS.map((s) => {
        const ativo = s.href === "/vixe" ? pathname === "/vixe" : pathname.startsWith(s.href);
        const base = "shrink-0 px-3 py-2 text-sm border-b-2 -mb-px transition-colors";
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

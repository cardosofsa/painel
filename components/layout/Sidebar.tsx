"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { NAV_ITEMS } from "./navigation";

export function Sidebar() {
  const pathname = usePathname();
  const [recolhida, setRecolhida] = useState(false);

  // Lido do localStorage após montar (evita mismatch de hidratação SSR vs cliente).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("painel:sidebar-recolhida");
      if (saved === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com localStorage no mount, padrão aceito para evitar mismatch de SSR
        setRecolhida(true);
      }
    } catch {
      // localStorage indisponível — mantém padrão
    }
  }, []);

  function alternar() {
    setRecolhida((prev) => {
      const proximo = !prev;
      try {
        localStorage.setItem("painel:sidebar-recolhida", proximo ? "1" : "0");
      } catch {
        // ignora falha de escrita
      }
      return proximo;
    });
  }

  return (
    <aside
      className={`shrink-0 bg-surface-1 border-r border-border flex flex-col h-screen sticky top-0 transition-[width] duration-150 ${
        recolhida ? "w-16" : "w-[232px]"
      }`}
    >
      <div className={`h-14 flex items-center gap-2 ${recolhida ? "justify-center px-2" : "px-5"}`}>
        <span className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-accent-on text-xs font-bold shrink-0">
          P
        </span>
        {!recolhida && <span className="font-semibold tracking-tight text-text-primary">Painel</span>}
      </div>

      <nav className="flex-1 py-2 px-3 overflow-y-auto space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={recolhida ? item.label : undefined}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                recolhida ? "justify-center px-0" : ""
              } ${
                active
                  ? "bg-accent-soft text-accent font-medium"
                  : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
              }`}
            >
              <Icon size={16} strokeWidth={2} className="shrink-0" />
              {!recolhida && item.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={alternar}
        className={`flex items-center gap-2 px-5 py-3 border-t border-border text-text-tertiary hover:text-text-primary text-xs ${
          recolhida ? "justify-center px-0" : ""
        }`}
      >
        {recolhida ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
        {!recolhida && "Recolher"}
      </button>
    </aside>
  );
}

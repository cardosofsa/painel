"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, ChevronsLeft, ChevronsRight, ShieldCheck } from "lucide-react";
import { NAV_ITEMS } from "./navigation";
import { normalizarAbas } from "@/lib/acesso";
import { useSidebarMobile } from "./SidebarMobileContext";

export function Sidebar({ abas, ehMaster }: { abas: string[]; ehMaster: boolean }) {
  const pathname = usePathname();
  const [recolhida, setRecolhida] = useState(false);
  const { aberta, fechar } = useSidebarMobile();

  // Master administra o sistema, não roda a própria loja por esta conta — as abas de
  // operação de negócio (PDV, Vendas, Produtos...) não aparecem aqui NUNCA, por papel, não
  // pelo array `abas` salvo no banco. Só "Configurações" aparece (versão enxuta, só
  // conta/senha — ver MasterConfiguracoesClient.tsx), porque toda conta precisa de um jeito
  // de trocar a própria senha. Quem barra de verdade rota por URL é o middleware.
  const liberadas = normalizarAbas(abas);
  const itens = ehMaster
    ? NAV_ITEMS.filter((item) => item.id === "configuracoes")
    : NAV_ITEMS.filter((item) => liberadas.includes(item.id));

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
    <>
      {aberta && <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={fechar} />}
      <aside
        className={`shrink-0 bg-surface-1 border-r border-border flex flex-col h-screen fixed md:sticky top-0 left-0 z-40 md:z-auto transition-transform md:transition-[width] duration-200 w-[232px] ${
          recolhida ? "md:w-16" : "md:w-[232px]"
        } ${aberta ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
      <div className={`h-14 flex items-center gap-2 min-w-0 ${recolhida ? "justify-center px-2" : "px-5"}`}>
        <span className="w-6 h-6 rounded-md bg-accent flex items-center justify-center text-accent-on shrink-0">
          <Brain size={14} strokeWidth={2.25} />
        </span>
        {!recolhida && <span className="font-semibold tracking-tight text-text-primary text-sm truncate">Segundo Cérebro</span>}
      </div>

      <nav className="flex-1 py-2 px-3 overflow-y-auto space-y-0.5">
        {itens.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={fechar}
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

        {ehMaster && (
          <Link
            href="/admin"
            onClick={fechar}
            title={recolhida ? "Administração" : undefined}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
              // A borda de separação só faz sentido depois de uma lista de itens. Para
              // master, `itens` está sempre vazio (ver acima), então este é o único item
              // do menu — sem borda solta no topo.
              itens.length > 0 ? "mt-2 border-t border-border pt-3" : ""
            } ${recolhida ? "justify-center px-0" : ""} ${
              pathname.startsWith("/admin")
                ? "bg-accent-soft text-accent font-medium"
                : "text-text-secondary hover:bg-surface-2 hover:text-text-primary"
            }`}
          >
            <ShieldCheck size={16} strokeWidth={2} className="shrink-0" />
            {!recolhida && "Administração"}
          </Link>
        )}
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
    </>
  );
}

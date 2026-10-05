"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, LogOut, Settings, Menu, UserRound, BadgeCheck, ArrowUpCircle } from "lucide-react";
import Link from "next/link";
import { sairOperador } from "@/app/(painel)/operador/actions";
import { useTheme } from "./ThemeContext";
import { useSidebarMobile } from "./SidebarMobileContext";
import { createClient } from "@/lib/supabase/client";
import { AlertasSino, type AlertaSino } from "./AlertasSino";
import type { MensagemPendente } from "@/lib/whatsapp";

export function TopBar({
  nomeNegocio,
  alertas,
  mensagens = [],
  verVixe = false,
  plano = null,
  operador = null,
  exigeOperador = false,
}: {
  nomeNegocio: string | null;
  alertas: AlertaSino[];
  /** Avisos de WhatsApp pendentes (Vixe → Mensagens), cada um uma notificação no sino. */
  mensagens?: MensagemPendente[];
  /** A aba Vixe está liberada: o sino ganha o link para a central de alertas. */
  verVixe?: boolean;
  /** Selo do plano ("Plano Pro" / "Teste · Pro") e se há plano acima; null = sem plano (master ou sem 0057). */
  plano?: { rotulo: string; upgrade: boolean } | null;
  /** 11.8: quem está operando (turno). */
  operador?: string | null;
  exigeOperador?: boolean;
}) {
  const { theme, toggleTheme } = useTheme();
  const { alternar: alternarSidebar } = useSidebarMobile();
  const router = useRouter();
  const [menuAberto, setMenuAberto] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFora(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false);
    }
    document.addEventListener("mousedown", onClickFora);
    return () => document.removeEventListener("mousedown", onClickFora);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  async function sair() {
    const supabase = createClient();
    // A página do PDV guardada para uso sem internet tem dados da loja (11.4).
    navigator.serviceWorker?.controller?.postMessage({ tipo: "limpar" });
    // Encerra o turno do operador junto (11.8).
    await sairOperador().catch(() => undefined);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const inicial = email ? email[0].toUpperCase() : "U";

  return (
    <header className="print:hidden h-14 shrink-0 border-b border-border bg-surface-1/80 backdrop-blur-sm flex items-center gap-4 px-4 sm:px-6 sticky top-0 z-10">
      <button
        onClick={alternarSidebar}
        aria-label="Abrir menu"
        className="w-8 h-8 -ml-1 rounded-md flex items-center justify-center text-text-secondary hover:bg-surface-2 hover:text-text-primary md:hidden shrink-0"
      >
        <Menu size={18} />
      </button>

      {/* Esquerda e direita com a mesma base (flex-1 basis-0): o nome fica no centro de verdade. */}
      <div className="flex-1 basis-0 min-w-0 flex items-center gap-2">
        {plano && (
          <>
            <Link
              href="/configuracoes?aba=plano"
              title="Ver o plano"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-surface-2 hover:text-text-primary whitespace-nowrap"
            >
              <BadgeCheck size={13} className="text-accent" /> {plano.rotulo}
            </Link>
            {plano.upgrade && (
              <Link
                href="/configuracoes?aba=plano"
                aria-label="Fazer upgrade"
                className="inline-flex items-center gap-1 rounded-full bg-accent px-2 sm:px-2.5 py-1 text-xs font-medium text-accent-on hover:bg-accent-hover whitespace-nowrap"
              >
                {/* No celular só o ícone: o selo + o texto não cabem na metade da barra. */}
                <ArrowUpCircle size={13} /> <span className="hidden sm:inline">Fazer upgrade</span>
              </Link>
            )}
          </>
        )}
      </div>

      {/* Sem nome de negócio cadastrado, nada aparece — "SERTÃO" no lugar soava como se o
          sistema estivesse falando o próprio nome de volta pro dono. */}
      {nomeNegocio && <div className="hidden md:block max-w-[30%] truncate text-sm font-semibold text-text-primary text-center">{nomeNegocio}</div>}

      <div className="flex-1 basis-0 min-w-0 flex items-center justify-end gap-4">
      {(operador || exigeOperador) && (
        <Link href="/operador" className="hidden sm:inline-flex items-center gap-1.5 mr-1 rounded-full border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-2" title="Trocar quem está operando">
          <UserRound size={13} className="text-accent" /> {operador ?? "Ninguém operando"} · trocar
        </Link>
      )}

      <AlertasSino alertas={alertas} mensagens={mensagens} verVixe={verVixe} />

      <button
        onClick={toggleTheme}
        aria-label={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
        title={theme === "light" ? "Ativar tema escuro" : "Ativar tema claro"}
        className="w-8 h-8 rounded-md flex items-center justify-center text-text-secondary hover:bg-surface-2 hover:text-text-primary"
      >
        {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
      </button>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuAberto((v) => !v)}
          className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-accent-on text-xs font-semibold"
        >
          {inicial}
        </button>
        {menuAberto && (
          <div className="absolute right-0 mt-2 w-56 bg-surface-1 border border-border rounded-md shadow-elev-2 py-1 text-sm">
            <div className="px-3 py-2 border-b border-border">
              <div className="text-text-primary font-medium truncate">{email ?? "Usuário"}</div>
              <div className="text-text-tertiary text-xs">Conta Supabase</div>
            </div>
            <Link href="/configuracoes" onClick={() => setMenuAberto(false)} className="flex items-center gap-2 px-3 py-2 text-text-secondary hover:bg-surface-2 hover:text-text-primary">
              <Settings size={14} /> Configurações
            </Link>
            <button onClick={sair} className="w-full flex items-center gap-2 px-3 py-2 text-negative hover:bg-negative-soft text-left">
              <LogOut size={14} /> Sair
            </button>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}

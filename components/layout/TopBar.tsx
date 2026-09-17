"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sun, Moon, User, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useTheme } from "./ThemeContext";
import { createClient } from "@/lib/supabase/client";

function todayLabel() {
  return new Date().toLocaleDateString("pt-BR");
}

export function TopBar() {
  const { theme, toggleTheme } = useTheme();
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
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const inicial = email ? email[0].toUpperCase() : "U";

  return (
    <header className="h-14 shrink-0 border-b border-border bg-surface-1/80 backdrop-blur-sm flex items-center gap-4 px-6 sticky top-0 z-10">
      <div className="flex items-center gap-1.5 text-sm text-text-secondary">
        <span className="w-1.5 h-1.5 rounded-full bg-positive" />
        Sincronizado
      </div>

      <span className="text-sm text-text-tertiary">{todayLabel()}</span>

      <div className="flex-1" />

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
          <div className="absolute right-0 mt-2 w-56 bg-surface-1 border border-border rounded-md shadow-lg py-1 text-sm">
            <div className="px-3 py-2 border-b border-border">
              <div className="text-text-primary font-medium truncate">{email ?? "Usuário"}</div>
              <div className="text-text-tertiary text-xs">Conta Supabase</div>
            </div>
            <Link href="/configuracoes" onClick={() => setMenuAberto(false)} className="flex items-center gap-2 px-3 py-2 text-text-secondary hover:bg-surface-2 hover:text-text-primary">
              <Settings size={14} /> Configurações
            </Link>
            <button className="w-full flex items-center gap-2 px-3 py-2 text-text-secondary hover:bg-surface-2 hover:text-text-primary text-left">
              <User size={14} /> Perfil
            </button>
            <button onClick={sair} className="w-full flex items-center gap-2 px-3 py-2 text-negative hover:bg-negative-soft text-left">
              <LogOut size={14} /> Sair
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeContext";

/** Alterna claro/escuro. Usado no topo do painel, na página inicial e nas telas de login. */
export function BotaoTema({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const rotulo = theme === "light" ? "Ativar tema escuro" : "Ativar tema claro";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={rotulo}
      title={rotulo}
      className={`w-8 h-8 rounded-md flex items-center justify-center text-text-secondary hover:bg-surface-2 hover:text-text-primary ${className}`}
    >
      {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  );
}

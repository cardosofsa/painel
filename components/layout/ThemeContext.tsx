"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "light" | "dark";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: "light",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // Lido do localStorage após montar (evita mismatch de hidratação SSR vs cliente).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("painel:tema");
      if (saved === "light" || saved === "dark") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com localStorage no mount, padrão aceito para evitar mismatch de SSR
        setThemeState(saved);
        document.documentElement.setAttribute("data-theme", saved);
      }
    } catch {
      // localStorage indisponível — mantém padrão
    }
  }, []);

  function toggleTheme() {
    const proximo: Theme = theme === "light" ? "dark" : "light";
    setThemeState(proximo);
    document.documentElement.setAttribute("data-theme", proximo);
    try {
      localStorage.setItem("painel:tema", proximo);
    } catch {
      // ignora falha de escrita
    }
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

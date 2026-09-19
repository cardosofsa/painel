"use client";

import { createContext, useContext, useState, ReactNode } from "react";

const SidebarMobileContext = createContext<{ aberta: boolean; abrir: () => void; fechar: () => void; alternar: () => void }>({
  aberta: false,
  abrir: () => {},
  fechar: () => {},
  alternar: () => {},
});

export function SidebarMobileProvider({ children }: { children: ReactNode }) {
  const [aberta, setAberta] = useState(false);

  return (
    <SidebarMobileContext.Provider
      value={{
        aberta,
        abrir: () => setAberta(true),
        fechar: () => setAberta(false),
        alternar: () => setAberta((v) => !v),
      }}
    >
      {children}
    </SidebarMobileContext.Provider>
  );
}

export function useSidebarMobile() {
  return useContext(SidebarMobileContext);
}

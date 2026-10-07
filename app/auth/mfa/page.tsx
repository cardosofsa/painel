import type { Metadata } from "next";
import { destinoSeguro } from "@/lib/rotas-auth";
import { MfaClient } from "./MfaClient";

export const metadata: Metadata = {
  title: "Verificação em duas etapas",
};

/**
 * Segunda etapa da entrada. Só chega aqui quem tem sessão `aal1` e fator verificado: o
 * middleware manda para cá a partir de qualquer tela do painel e devolve ao destino quem já
 * passou pelo código (ou não tem fator).
 */
export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  // O `next` vem da URL: só caminho interno, nunca outro domínio (ver `destinoSeguro`).
  return <MfaClient destino={destinoSeguro(typeof next === "string" ? next : null)} />;
}

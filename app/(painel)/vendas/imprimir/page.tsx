import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarComprovante } from "@/lib/comprovante-servidor";
import type { DadosComprovante } from "@/lib/comprovante";
import { ImprimirLote } from "./ImprimirLote";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Imprimir pedidos" };

/**
 * Impressão de um ou vários pedidos (Para Imprimir): um comprovante por página, e a janela
 * de impressão abre sozinha. Quem marca como impresso é a tela de Vendas, depois de
 * perguntar — imprimir não muda a etapa.
 */
export default async function ImprimirPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const lista = (ids ?? "")
    .split(",")
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 50);
  if (!lista.length) notFound();

  const supabase = await createClient();
  const dados = (await Promise.all(lista.map((id) => carregarComprovante(supabase, id)))).filter((d): d is DadosComprovante => !!d);
  if (!dados.length) notFound();
  return <ImprimirLote dados={dados} />;
}

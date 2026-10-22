import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { carregarGruposSku } from "@/lib/anuncio-grupo-servidor";
import { GrupoClient } from "./GrupoClient";

export const metadata: Metadata = { title: "Reprecificar em grupo" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Os anúncios de uma loja agrupados pelo produto (SKU), para espalhar os preços dentro da faixa. */
export default async function GrupoPage({ searchParams }: { searchParams: Promise<{ loja?: string; produto?: string }> }) {
  const { loja, produto } = await searchParams;
  const supabase = await createClient();
  const dados = await carregarGruposSku(supabase, loja && UUID.test(loja) ? loja : null);
  return <GrupoClient key={dados.loja?.id ?? "sem-loja"} dados={dados} produtoInicial={produto && UUID.test(produto) ? produto : null} />;
}

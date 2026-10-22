import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { carregarItemAnuncio } from "@/lib/anuncio-item-servidor";
import { ItemAnuncioClient } from "./ItemAnuncioClient";

export const metadata: Metadata = { title: "Anúncio na loja" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Um anúncio sincronizado como aparece na Shopee, com as variações e a reprecificação de todas. */
export default async function ItemAnuncioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const item = await carregarItemAnuncio(supabase, id);
  if (!item) notFound();
  return <ItemAnuncioClient key={id} item={item} anuncioId={id} />;
}

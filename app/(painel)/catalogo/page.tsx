import { createClient } from "@/lib/supabase/server";
import { CatalogoClient, type Catalogo } from "./CatalogoClient";

export default async function CatalogoPage() {
  const supabase = await createClient();

  const [catalogosRes, produtosRes] = await Promise.all([
    supabase.from("catalogos").select("id, nome, slug, tipo_preco, ativo, criado_em").order("criado_em"),
    supabase.from("produtos").select("id", { count: "exact", head: true }).eq("ativo", true).gt("estoque", 0),
  ]);

  if (catalogosRes.error) throw new Error(catalogosRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);

  return (
    <CatalogoClient
      catalogos={(catalogosRes.data ?? []) as Catalogo[]}
      totalProdutosElegiveis={produtosRes.count ?? 0}
    />
  );
}

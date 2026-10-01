import { createClient } from "@/lib/supabase/server";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { CatalogoClient, type Catalogo } from "./CatalogoClient";

export default async function CatalogoPage() {
  const supabase = await createClient();

  const [catalogosRes, produtosRes, pendentesRes] = await Promise.all([
    supabase.from("catalogos").select("id, nome, slug, ativo, tipo_preco, criado_em").order("criado_em"),
    supabase.from("produtos").select("id", { count: "exact", head: true }).eq("ativo", true).gt("estoque", 0),
    // Os pedidos moram em Vendas desde a 8.6; aqui só o aviso de quantos esperam.
    supabase.from("pedidos_vitrine").select("id", { count: "exact", head: true }).in("status", ["pendente", "aceito"]),
  ]);

  if (catalogosRes.error) throw new Error(catalogosRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);

  return (
    <CatalogoClient
      catalogos={(catalogosRes.data ?? []) as Catalogo[]}
      totalProdutosElegiveis={produtosRes.count ?? 0}
      pedidosPendentes={pendentesRes.error ? 0 : (pendentesRes.count ?? 0)}
      // Lido no servidor de propósito: `GEMINI_API_KEY` não é `NEXT_PUBLIC_`.
      iaDisponivel={await iaDisponivelParaConta(supabase)}
    />
  );
}

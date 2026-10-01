import { createClient } from "@/lib/supabase/server";
import { CatalogoClient, type Catalogo } from "./CatalogoClient";

export default async function CatalogoPage() {
  const supabase = await createClient();

  const desde = new Date();
  desde.setDate(desde.getDate() - 30);
  const desdeIso = desde.toISOString();
  const [catalogosRes, produtosRes, pendentesRes, visitasRes, pedidosRes] = await Promise.all([
    // `*`: formas_pagamento só existe a partir da 0051.
    supabase.from("catalogos").select("*").order("criado_em"),
    supabase.from("produtos").select("id", { count: "exact", head: true }).eq("ativo", true).gt("estoque", 0),
    // Os pedidos moram em Vendas desde a 8.6; aqui só o aviso de quantos esperam.
    supabase.from("pedidos_vitrine").select("id", { count: "exact", head: true }).in("status", ["pendente", "aceito"]),
    // Sem a 0044 a tabela de visitas não existe: os cartões mostram 0, sem erro.
    supabase.from("catalogo_visitas").select("catalogo_id, visitas").gte("dia", desdeIso.slice(0, 10)),
    supabase.from("pedidos_vitrine").select("catalogo_id, status").gte("criado_em", desdeIso),
  ]);

  const estatisticas: Record<string, { visitas: number; pedidos: number; convertidos: number }> = {};
  const de = (id: string) => (estatisticas[id] ??= { visitas: 0, pedidos: 0, convertidos: 0 });
  for (const v of visitasRes.error ? [] : (visitasRes.data ?? [])) de(v.catalogo_id).visitas += v.visitas;
  for (const p of pedidosRes.error ? [] : (pedidosRes.data ?? [])) {
    de(p.catalogo_id).pedidos++;
    if (p.status === "convertido") de(p.catalogo_id).convertidos++;
  }

  if (catalogosRes.error) throw new Error(catalogosRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);

  return (
    <CatalogoClient
      catalogos={(catalogosRes.data ?? []) as Catalogo[]}
      totalProdutosElegiveis={produtosRes.count ?? 0}
      pedidosPendentes={pendentesRes.error ? 0 : (pendentesRes.count ?? 0)}
      estatisticas={estatisticas}
    />
  );
}

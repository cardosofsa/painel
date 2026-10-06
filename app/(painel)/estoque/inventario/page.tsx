import { createClient } from "@/lib/supabase/server";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import { InventarioClient, type HistoricoInventario, type ProdutoContagem } from "./InventarioClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Inventário" };

export default async function InventarioPage() {
  const supabase = await createClient();

  const [produtosRes, gruposRes, armazensRes, saldosRes, historicoRes] = await Promise.all([
    // `*`: `e_kit` só existe a partir da 0058.
    supabase.from("produtos").select("*").eq("ativo", true).order("nome"),
    supabase.from("produto_grupos").select("id, nome"),
    supabase.from("armazens").select("id, nome").order("criado_em"),
    supabase.from("estoque_armazem").select("produto_id, armazem_id, quantidade"),
    // Sem a 0074 a tabela não existe: a tela avisa e não deixa aplicar.
    supabase.from("inventarios").select("id, armazem_id, observacao, itens, ajustes, criado_em").order("criado_em", { ascending: false }).limit(20),
  ]);
  if (produtosRes.error) throw new Error(produtosRes.error.message);

  const grupos = mapaGrupos(gruposRes.data ?? []);
  const produtos: ProdutoContagem[] = (produtosRes.data ?? [])
    .filter((p) => !p.e_kit)
    .map((p) => comRotulo(p, grupos))
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      sku: p.sku,
      codigo_barras: p.codigo_barras ?? null,
      custo: Number(p.custo) || 0,
      estoque: p.estoque,
      armazem_id: p.armazem_id ?? null,
    }));

  // Sem a 0041: o saldo inteiro conta no armazém padrão do produto.
  const saldos = saldosRes.error
    ? produtos.filter((p) => p.armazem_id && p.estoque > 0).map((p) => ({ produto_id: p.id, armazem_id: p.armazem_id!, quantidade: p.estoque }))
    : (saldosRes.data ?? []);

  return (
    <InventarioClient
      produtos={produtos}
      armazens={armazensRes.data ?? []}
      saldos={saldos}
      historico={(historicoRes.data ?? []) as HistoricoInventario[]}
      migracaoOk={!historicoRes.error}
    />
  );
}

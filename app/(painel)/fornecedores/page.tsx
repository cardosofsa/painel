import { createClient } from "@/lib/supabase/server";
import { hojeIsoLocal } from "@/lib/format";
import { FornecedoresClient, type Fornecedor } from "./FornecedoresClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Fornecedores" };

export default async function FornecedoresPage() {
  const supabase = await createClient();

  const tresMesesAtras = new Date();
  tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);

  const [fornecedoresRes, comprasRes, abertoRes, contasRes] = await Promise.all([
    supabase.from("fornecedores").select("id, nome, cnpj, contato, telefone, cidade, prazo, status").order("nome"),
    supabase
      .from("pedidos_compra")
      .select("valor_total")
      .gte("data_pedido", hojeIsoLocal(tresMesesAtras)),
    // Quanto falta pagar a cada um (0064). Sem a migração, a coluna fica com "—".
    supabase.rpc("em_aberto_por_fornecedor"),
    // Contas de onde sai o pagamento da conta em aberto (0095).
    supabase.from("contas").select("id, nome").order("nome"),
  ]);

  if (fornecedoresRes.error) throw new Error(fornecedoresRes.error.message);
  if (comprasRes.error) throw new Error(comprasRes.error.message);

  const emAberto: Record<string, { valor: number; atrasado: number; proximo: string | null }> = {};
  for (const r of (abertoRes.error ? [] : (abertoRes.data ?? [])) as { fornecedor_id: string; em_aberto: number; atrasado: number; proximo_vencimento: string | null }[]) {
    emAberto[r.fornecedor_id] = { valor: Number(r.em_aberto), atrasado: Number(r.atrasado), proximo: r.proximo_vencimento };
  }

  const comprasNoTrimestre = (comprasRes.data ?? []).reduce((acc, p) => acc + p.valor_total, 0);

  return (
    <FornecedoresClient fornecedores={(fornecedoresRes.data ?? []) as Fornecedor[]} comprasNoTrimestre={comprasNoTrimestre} emAberto={abertoRes.error ? null : emAberto} contas={(contasRes.data ?? []) as { id: string; nome: string }[]} />
  );
}

import { createClient } from "@/lib/supabase/server";
import { EstoqueClient } from "./EstoqueClient";

export default async function EstoquePage() {
  const supabase = await createClient();

  const [produtosRes, armazensRes, movimentacoesRes] = await Promise.all([
    supabase.from("produtos").select("id, sku, nome, custo, estoque, estoque_minimo, armazem_id").order("nome"),
    supabase.from("armazens").select("id, nome, endereco, lojas_abastecidas").order("nome"),
    supabase
      .from("estoque_movimentacoes")
      .select("produto_nome, tipo, quantidade, motivo, data_movimentacao")
      .order("data_movimentacao", { ascending: false })
      .limit(50),
  ]);

  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);
  if (movimentacoesRes.error) throw new Error(movimentacoesRes.error.message);

  return (
    <EstoqueClient
      produtos={produtosRes.data ?? []}
      armazens={armazensRes.data ?? []}
      movimentacoes={movimentacoesRes.data ?? []}
    />
  );
}

import { createClient } from "@/lib/supabase/server";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import { EstoqueClient } from "./EstoqueClient";

export default async function EstoquePage() {
  const supabase = await createClient();

  const [produtosRes, armazensRes, movimentacoesRes, gruposRes] = await Promise.all([
    supabase
      .from("produtos")
      .select("id, sku, nome, custo, estoque, estoque_minimo, armazem_id, grupo_id, variante_nome")
      .order("nome"),
    supabase.from("armazens").select("id, nome, endereco, lojas_abastecidas").order("nome"),
    supabase
      .from("estoque_movimentacoes")
      .select("produto_nome, tipo, quantidade, motivo, data_movimentacao")
      .order("data_movimentacao", { ascending: false })
      .limit(50),
    supabase.from("produto_grupos").select("id, nome"),
  ]);

  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);
  if (movimentacoesRes.error) throw new Error(movimentacoesRes.error.message);
  if (gruposRes.error) throw new Error(gruposRes.error.message);

  const grupos = mapaGrupos(gruposRes.data ?? []);
  const produtos = (produtosRes.data ?? []).map((p) => comRotulo(p, grupos));

  return (
    <EstoqueClient
      produtos={produtos}
      armazens={armazensRes.data ?? []}
      movimentacoes={movimentacoesRes.data ?? []}
    />
  );
}

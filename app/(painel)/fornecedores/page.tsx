import { createClient } from "@/lib/supabase/server";
import { FornecedoresClient, type Fornecedor } from "./FornecedoresClient";

export default async function FornecedoresPage() {
  const supabase = await createClient();

  const tresMesesAtras = new Date();
  tresMesesAtras.setMonth(tresMesesAtras.getMonth() - 3);

  const [fornecedoresRes, comprasRes] = await Promise.all([
    supabase.from("fornecedores").select("id, nome, cnpj, contato, telefone, cidade, prazo, status").order("nome"),
    supabase
      .from("pedidos_compra")
      .select("valor_total")
      .gte("data_pedido", tresMesesAtras.toISOString().slice(0, 10)),
  ]);

  if (fornecedoresRes.error) throw new Error(fornecedoresRes.error.message);
  if (comprasRes.error) throw new Error(comprasRes.error.message);

  const comprasNoTrimestre = (comprasRes.data ?? []).reduce((acc, p) => acc + p.valor_total, 0);

  return (
    <FornecedoresClient fornecedores={(fornecedoresRes.data ?? []) as Fornecedor[]} comprasNoTrimestre={comprasNoTrimestre} />
  );
}

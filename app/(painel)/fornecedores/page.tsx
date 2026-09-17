import { createClient } from "@/lib/supabase/server";
import { FornecedoresClient, type Fornecedor } from "./FornecedoresClient";

export default async function FornecedoresPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornecedores")
    .select("id, nome, cnpj, contato, telefone, cidade, prazo, status")
    .order("nome");

  if (error) throw new Error(error.message);

  return <FornecedoresClient fornecedores={(data ?? []) as Fornecedor[]} />;
}

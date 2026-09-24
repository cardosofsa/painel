import { createClient } from "@/lib/supabase/server";
import { ClientesClient, type Cliente } from "./ClientesClient";

export default async function ClientesPage() {
  const supabase = await createClient();

  const [clientesRes, vendasRes] = await Promise.all([
    supabase
      .from("clientes")
      .select(
        "id, nome, whatsapp, email, documento, data_nascimento, cep, endereco, cidade, uf, observacao, permite_fiado, status",
      )
      .order("nome"),
    supabase.from("vendas").select("cliente_id, total").neq("status", "cancelada"),
  ]);

  if (clientesRes.error) throw new Error(clientesRes.error.message);
  if (vendasRes.error) throw new Error(vendasRes.error.message);

  const resumoPorCliente = new Map<string, { compras: number; total: number }>();
  for (const v of vendasRes.data ?? []) {
    if (!v.cliente_id) continue;
    const atual = resumoPorCliente.get(v.cliente_id) ?? { compras: 0, total: 0 };
    resumoPorCliente.set(v.cliente_id, { compras: atual.compras + 1, total: atual.total + v.total });
  }

  const clientes: Cliente[] = (clientesRes.data ?? []).map((c) => ({
    ...c,
    compras: resumoPorCliente.get(c.id)?.compras ?? 0,
    total_comprado: resumoPorCliente.get(c.id)?.total ?? 0,
  }));

  return <ClientesClient clientes={clientes} />;
}

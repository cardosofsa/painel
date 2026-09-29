import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { ClientesClient, type Cliente } from "./ClientesClient";

interface ResumoCliente {
  cliente_id: string;
  compras: number;
  total_comprado: number;
}

export default async function ClientesPage() {
  const supabase = await createClient();

  // A soma por cliente é feita no banco. Antes esta página baixava a tabela `vendas`
  // INTEIRA — sem limite e sem filtro de data — só para contar e somar em memória: num PDV
  // com 30 vendas/dia são ~11 mil linhas por ano trafegando para preencher uma coluna.
  const [clientesRes, resumoRes] = await Promise.all([
    supabase
      .from("clientes")
      .select(
        "id, nome, whatsapp, email, documento, data_nascimento, cep, endereco, numero, bairro, complemento, cidade, uf, observacao, permite_fiado, limite_fiado, status",
      )
      .order("nome"),
    supabase.rpc("resumo_vendas_por_cliente"),
  ]);

  if (clientesRes.error) lancarErroSupabase(clientesRes.error);

  // O resumo é secundário: se ele falhar, a lista de clientes ainda serve — só fica sem as
  // colunas de compras. Derrubar a tela inteira por causa disso seria desproporcional.
  const resumoPorCliente = new Map<string, { compras: number; total: number }>();
  for (const r of (resumoRes.data ?? []) as ResumoCliente[]) {
    resumoPorCliente.set(r.cliente_id, { compras: Number(r.compras), total: Number(r.total_comprado) });
  }

  const clientes: Cliente[] = (clientesRes.data ?? []).map((c) => ({
    ...c,
    compras: resumoPorCliente.get(c.id)?.compras ?? 0,
    total_comprado: resumoPorCliente.get(c.id)?.total ?? 0,
  }));

  return <ClientesClient clientes={clientes} />;
}

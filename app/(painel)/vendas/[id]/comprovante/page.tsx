import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarComprovante } from "@/lib/comprovante-servidor";
import { ComprovanteImpressao } from "@/components/comprovante/ComprovanteImpressao";

/**
 * Página do comprovante para imprimir / salvar como PDF (o "Salvar como PDF" do próprio
 * navegador: sem dependência nova). Mora sob /vendas, então herda o controle de acesso da
 * aba Vendas; o menu lateral e a barra do topo somem na impressão (`print:hidden`).
 */
export default async function ComprovantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const dados = await carregarComprovante(supabase, id);
  if (!dados) notFound();

  return <ComprovanteImpressao dados={dados} />;
}

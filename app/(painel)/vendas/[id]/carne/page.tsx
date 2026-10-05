import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarComprovante } from "@/lib/comprovante-servidor";
import { CarneImpressao } from "@/components/comprovante/CarneImpressao";
import { carregarCrediario } from "@/lib/crediario-servidor";

/**
 * Carnê do crediário para imprimir / salvar como PDF: uma lâmina por parcela. Mesmos dados
 * do comprovante (`carregarComprovante` já traz as parcelas da venda no crediário) e mesmo
 * controle de acesso (mora sob /vendas).
 */
export default async function CarnePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [dados, crediario] = await Promise.all([carregarComprovante(supabase, id), carregarCrediario(supabase)]);
  if (!dados) notFound();

  return <CarneImpressao dados={dados} pix={crediario.pix} />;
}

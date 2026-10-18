import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { carregarAnalise } from "@/lib/analise-servidor";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { saldoIAParaTela } from "@/lib/ia/gerar";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { classesBotao } from "@/components/ui/Button";
import { AnaliseClient } from "./AnaliseClient";

export const metadata: Metadata = { title: "Análise do anúncio" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Análise completa de um anúncio sincronizado da loja (`marketplace_anuncios`). */
export default async function AnalisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [dados, iaDisponivel, saldo] = await Promise.all([carregarAnalise(supabase, id), iaDisponivelParaConta(supabase), saldoIAParaTela(supabase)]);
  if (dados === null) notFound();
  if (dados === "sem_produto") {
    return (
      <Card>
        <EmptyState icon={Link2} title="Este anúncio ainda não está ligado a um produto" description="Sem o produto não há custo nem vendas por produto para analisar. Ligue o anúncio no mapeamento e volte aqui." />
        <div className="flex justify-center pb-4">
          <Link href="/produtos/mapeamento" className={classesBotao({ variant: "primary" })}>
            Ligar ao produto
          </Link>
        </div>
      </Card>
    );
  }
  return <AnaliseClient dados={dados} iaDisponivel={iaDisponivel} saldo={saldo} />;
}

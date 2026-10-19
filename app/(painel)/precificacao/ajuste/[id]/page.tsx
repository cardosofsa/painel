import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { carregarDadosAjuste } from "@/lib/ajuste-servidor";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { classesBotao } from "@/components/ui/Button";
import { AjusteClient } from "./AjusteClient";

export const metadata: Metadata = { title: "Ajuste de Preço" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ajuste de Preço. `[id]` é um anúncio sincronizado da Shopee (`marketplace_anuncios`), ou
 * `novo` com `?produto=&loja=` para quem ainda não tem anúncio.
 */
export default async function AjustePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ produto?: string; loja?: string }> }) {
  const { id } = await params;
  const { produto, loja } = await searchParams;
  const supabase = await createClient();
  let alvo: { anuncioId: string } | { produtoId: string; lojaId: string | null };
  if (id === "novo") {
    if (!produto || !UUID.test(produto)) notFound();
    alvo = { produtoId: produto, lojaId: loja && UUID.test(loja) ? loja : null };
  } else if (UUID.test(id)) {
    alvo = { anuncioId: id };
  } else notFound();

  const [dados, iaDisponivel] = await Promise.all([carregarDadosAjuste(supabase, alvo), iaDisponivelParaConta(supabase)]);
  if (dados === null) notFound();
  if (dados === "sem_produto") {
    return (
      <Card>
        <EmptyState
          icon={Link2}
          title="Este anúncio ainda não está ligado a um produto"
          description="Sem o produto não há custo, e sem custo não há lucro para calcular. Ligue o anúncio ao produto no mapeamento e volte aqui."
        />
        <div className="flex justify-center pb-4">
          <Link href="/produtos/mapeamento" className={classesBotao({ variant: "primary" })}>
            Ligar ao produto
          </Link>
        </div>
      </Card>
    );
  }
  return <AjusteClient key={`${dados.produto.id}-${dados.loja?.id}`} dados={dados} alvo={alvo} iaDisponivel={iaDisponivel} />;
}

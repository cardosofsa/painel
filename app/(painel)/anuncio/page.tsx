import Link from "next/link";
import { ArrowRight, BarChart3, Palette, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AberturaMarca } from "@/components/anuncio/AberturaMarca";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/Badge";
import { formatarDataHora } from "@/lib/format";
import { calcularEtapas } from "@/lib/anuncio/etapas";
import { lerEstado } from "@/lib/estudio/servidor";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Anúncio" };

interface LinhaRascunho {
  id: string;
  produto_id: string;
  titulo: string | null;
  descricao: string | null;
  status: string;
  estado: unknown;
  atualizado_em: string;
  produtos: { nome: string } | null;
}

const estadoTemItem = (estado: unknown) => !!lerEstado(estado).itemShopee;

export default async function AnuncioPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("anuncio_rascunhos")
    .select("id, produto_id, titulo, descricao, status, estado, atualizado_em, produtos(nome)")
    .order("atualizado_em", { ascending: false })
    .limit(6);
  const rascunhos = ((data ?? []) as unknown as LinhaRascunho[]).map((r) => {
    const estado = lerEstado(r.estado);
    const etapas = calcularEtapas({
      lojaDecidida: true,
      produtoId: r.produto_id,
      rascunhoAberto: true,
      titulo: r.titulo,
      descricao: r.descricao,
      capaAprovada: (estado.capas ?? []).some((c) => c.veredito === "aprovada"),
      itemCriadoNaShopee: !!estado.itemShopee,
      publicado: r.status === "publicado",
    });
    return { ...r, etapas };
  });

  return (
    <>
      <AberturaMarca eyebrow="Anúncio" titulo="Do produto ao anúncio pronto" texto="Título, capa e descrição no padrão da sua loja, passo a passo. A IA propõe, você aprova, e o anúncio vai para a Shopee como não listado.">
        <Link
          href="/anuncio/infinito"
          className="inline-flex items-center gap-2 rounded-lg bg-marca-sol px-6 py-3.5 text-base font-semibold text-background shadow-elev-2 transition-transform hover:-translate-y-0.5 focus-visible:outline-offset-4"
        >
          <Sparkles size={18} aria-hidden /> Anúncio Infinito <ArrowRight size={18} aria-hidden />
        </Link>
      </AberturaMarca>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Link href="/anuncio/infinito?config=perfil" className="group">
          <Card className="h-full transition-colors group-hover:border-border-forte">
            <Palette size={20} className="text-accent mb-2" aria-hidden />
            <CardTitle>Meu padrão</CardTitle>
            <CardSubtitle>Loja, plataforma, visual e termos proibidos. Fica dentro do Anúncio Infinito, em Configurações.</CardSubtitle>
          </Card>
        </Link>
        <Link href="/vendas/insights" className="group">
          <Card className="h-full transition-colors group-hover:border-border-forte">
            <BarChart3 size={20} className="text-accent mb-2" aria-hidden />
            <CardTitle>O que replicar e evitar</CardTitle>
            <CardSubtitle>Insights dos anúncios que mais vendem, com os números por trás.</CardSubtitle>
          </Card>
        </Link>
      </div>

      <Card>
        <CardTitle>Anúncios em andamento</CardTitle>
        <CardSubtitle>Continue de onde parou.</CardSubtitle>
        {rascunhos.length === 0 ? (
          <EmptyState icon={Sparkles} title="Nenhum anúncio começado" description="Clique em Anúncio Infinito para criar o primeiro." />
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {rascunhos.map((r) => {
              const proxima = r.etapas.etapas.find((e) => e.id === r.etapas.atual)!;
              return (
                <li key={r.id}>
                  <Link href={`/anuncio/infinito?rascunho=${r.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-surface-2 -mx-2 px-2 rounded-md">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text-primary truncate">{r.titulo || r.produtos?.nome || "Anúncio sem título"}</span>
                      <span className="block text-xs text-text-secondary">
                        {r.etapas.feitas} de 6 etapas · próxima: {proxima.rotulo} · {formatarDataHora(r.atualizado_em)}
                      </span>
                    </span>
                    <StatusChip
                      tone={r.status === "publicado" || r.status === "pronto" ? "positive" : "neutral"}
                      label={r.status === "publicado" ? (estadoTemItem(r.estado) ? "Na Shopee" : "Publicado") : r.status === "pronto" ? "Pronto" : "Em andamento"}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

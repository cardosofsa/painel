import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BarChart3, Palette, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AberturaMarca } from "@/components/anuncio/AberturaMarca";
import { AnunciosNaLoja, RascunhosAnuncio, type AnuncioDaLoja, type RascunhoDaLista } from "@/components/anuncio/ListasAnuncio";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
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
  produtos: { nome: string; imagem_url: string | null } | null;
}

const STATUS = ["rascunho", "pronto", "publicado"] as const;

export default async function AnuncioPage() {
  const supabase = await createClient();
  const [{ data }, anunciosRes] = await Promise.all([
    // A12: a lista inteira (antes eram só os 6 últimos); o filtro e a busca rodam na tela.
    supabase.from("anuncio_rascunhos").select("id, produto_id, titulo, descricao, status, estado, atualizado_em, produtos(nome, imagem_url)").order("atualizado_em", { ascending: false }).limit(500),
    // `*`: nome_item, imagem_url e preco_atual dependem de migrações (0071/0093).
    supabase.from("marketplace_anuncios").select("*").order("atualizado_em", { ascending: false }).limit(400),
  ]);
  // Um por item (as variações de um anúncio são o mesmo anúncio na loja).
  const vistos = new Set<string>();
  const meus: AnuncioDaLoja[] = ((anunciosRes.data ?? []) as { id: string; loja_id: string; item_id: number; nome?: string | null; nome_item?: string | null; imagem_url?: string | null; preco_atual?: number | null; produto_id: string | null }[])
    .filter((a) => {
      const k = `${a.loja_id}:${a.item_id}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .map((a) => ({ id: a.id, titulo: a.nome_item ?? a.nome ?? `Anúncio ${a.item_id}`, imagem: a.imagem_url ?? null, preco: a.preco_atual ? Number(a.preco_atual) : null, semProduto: !a.produto_id }));
  const rascunhos: RascunhoDaLista[] = ((data ?? []) as unknown as LinhaRascunho[]).map((r) => {
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
    return {
      id: r.id,
      titulo: r.titulo || r.produtos?.nome || "Anúncio sem título",
      imagem: r.produtos?.imagem_url ?? null,
      status: STATUS.find((s) => s === r.status) ?? "rascunho",
      naShopee: !!estado.itemShopee,
      feitas: etapas.feitas,
      total: etapas.etapas.length,
      proxima: etapas.etapas.find((e) => e.id === etapas.atual)?.rotulo ?? null,
      atualizadoEm: r.atualizado_em,
    };
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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_18rem] gap-6 items-start mb-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Seus anúncios</CardTitle>
              <CardSubtitle>Continue de onde parou. Cada anúncio guarda a etapa em que você estava.</CardSubtitle>
            </div>
          </CardHeader>
          <RascunhosAnuncio rascunhos={rascunhos} />
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
          <Atalho href="/anuncio/infinito?config=perfil" icone={<Palette size={18} aria-hidden />} titulo="Meu padrão" texto="Loja, plataforma, visual e os termos que bloqueiam ou pedem revisão." />
          <Atalho href="/vendas/insights" icone={<BarChart3 size={18} aria-hidden />} titulo="O que replicar e evitar" texto="Insights dos anúncios que mais vendem, com os números por trás." />
        </div>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Meus anúncios na loja</CardTitle>
            <CardSubtitle>Os anúncios sincronizados das lojas conectadas: análise completa e ajuste de preço.</CardSubtitle>
          </div>
        </CardHeader>
        <AnunciosNaLoja anuncios={meus} />
      </Card>
    </>
  );
}

function Atalho({ href, icone, titulo, texto }: { href: string; icone: ReactNode; titulo: string; texto: string }) {
  return (
    <Link href={href} className="group block rounded-lg border border-border bg-surface-1 p-4 shadow-elev-1 transition-colors hover:border-border-forte">
      <span className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent">{icone}</span>
        <span className="text-sm font-semibold text-text-primary">{titulo}</span>
        <ArrowRight size={14} className="ml-auto text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
      <span className="mt-2 block text-xs text-text-secondary">{texto}</span>
    </Link>
  );
}

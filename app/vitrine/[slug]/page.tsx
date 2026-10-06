import type { Metadata } from "next";
import { buscarCatalogoPublico } from "./dados";
import { VitrinePublica } from "@/components/catalogo/VitrinePublica";

/**
 * Metadata própria da vitrine.
 *
 * Sem isso a página herdava o metadata raiz, e colar o link no WhatsApp mostrava a prévia
 * "Sertão — Sistema local de gestão: precificação, produtos, estoque…" para o
 * cliente final. Como o WhatsApp *é* o canal de distribuição desta página, a prévia é
 * parte do produto.
 *
 * `robots: noindex` é intencional: o link é para enviar a clientes, não para ranquear no
 * Google — e o catálogo muda de preço e de estoque o tempo todo.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const linhas = await buscarCatalogoPublico(slug);
  const nome = linhas[0]?.catalogo_nome;
  if (!nome) {
    return { title: "Catálogo não encontrado", robots: { index: false, follow: false } };
  }

  const comProduto = linhas.filter((l) => l.produto_id !== null);
  const capa = comProduto.find((l) => l.imagem_url)?.imagem_url ?? undefined;
  const descricao =
    comProduto.length > 0
      ? `${comProduto.length} ${comProduto.length === 1 ? "produto disponível" : "produtos disponíveis"} no catálogo de ${nome}.`
      : `Catálogo de ${nome}.`;

  return {
    title: `${nome} — Catálogo`,
    description: descricao,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title: `${nome} — Catálogo`,
      description: descricao,
      images: capa ? [{ url: capa }] : undefined,
    },
    twitter: {
      card: capa ? "summary_large_image" : "summary",
      title: `${nome} — Catálogo`,
      description: descricao,
      images: capa ? [capa] : undefined,
    },
  };
}

export default async function VitrinePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string; produto?: string }>;
}) {
  const { slug } = await params;
  const { c, produto } = await searchParams;
  return <VitrinePublica slug={slug} carrinho={c} produtoInicial={produto ?? null} />;
}

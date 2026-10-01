import type { Metadata } from "next";
import { formatBRL } from "@/lib/format";
import { buscarCatalogoPublico } from "../../dados";
import { VitrinePublica } from "@/components/catalogo/VitrinePublica";

/**
 * Link de UM produto (/vitrine/loja/p/<id>): a prévia do WhatsApp mostra a foto, o nome e o
 * preço daquele produto, e a página abre a vitrine com ele em destaque. É o link que o
 * botão "Compartilhar" do produto gera.
 */
export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }): Promise<Metadata> {
  const { slug, id } = await params;
  const linhas = await buscarCatalogoPublico(slug);
  const linha = linhas.find((l) => l.produto_id === id);
  const catalogo = linhas[0]?.catalogo_nome;
  if (!linha || !catalogo) return { title: "Produto não encontrado", robots: { index: false, follow: false } };
  const titulo = `${linha.produto_nome}${linha.variante_nome ? ` — ${linha.variante_nome}` : ""}`;
  const preco = linha.preco != null && Number(linha.preco) > 0 ? formatBRL(Number(linha.preco)) : "Consulte o preço";
  const descricao = `${preco} · ${catalogo}`;
  return {
    title: `${titulo} — ${catalogo}`,
    description: descricao,
    robots: { index: false, follow: false },
    openGraph: { type: "website", title: titulo, description: descricao, images: linha.imagem_url ? [{ url: linha.imagem_url }] : undefined },
    twitter: { card: linha.imagem_url ? "summary_large_image" : "summary", title: titulo, description: descricao, images: linha.imagem_url ? [linha.imagem_url] : undefined },
  };
}

export default async function ProdutoVitrinePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  return <VitrinePublica slug={slug} produtoInicial={id} />;
}

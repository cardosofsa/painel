import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { VitrineInterativa } from "@/components/catalogo/VitrineInterativa";
import { agruparLinhas, decodificarCarrinho, montarCarrinho } from "@/lib/vitrine-catalogo";
import { buscarCatalogoPublico, buscarAparenciaPublica } from "./dados";

/**
 * Metadata própria da vitrine.
 *
 * Sem isso a página herdava o metadata raiz, e colar o link no WhatsApp mostrava a prévia
 * "SERTÃO — Sistema local de gestão: precificação, produtos, estoque…" para o
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
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const { c } = await searchParams;
  const [linhas, aparencia] = await Promise.all([buscarCatalogoPublico(slug), buscarAparenciaPublica(slug)]);

  const nome = linhas[0]?.catalogo_nome;
  const negocioWhatsapp = linhas[0]?.negocio_whatsapp ?? null;
  // Título e mensagem personalizados substituem o nome cru do catálogo; sem eles, o
  // comportamento é o de sempre.
  const tituloExibido = aparencia?.titulo || nome;

  // Quando o catálogo existe mas não tem produto elegível, a função ainda devolve uma
  // linha (pra distinguir de "slug inválido"), só que com produto_id nulo. Produto sem
  // preço (preço nulo ou zero) NÃO é filtrado: vira "Consultar" na tela, e a RPC de pedido
  // recusa esse item no banco.
  const itens = agruparLinhas(linhas);

  // Carrinho vindo do link "Compartilhar": só ids e quantidades; nome e preço são os de hoje.
  const carrinhoInicial = montarCarrinho(decodificarCarrinho(c), itens);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {!nome ? (
          <div className="bg-surface-1 border border-border rounded-lg">
            <EmptyState
              icon={BookOpen}
              title="Catálogo não encontrado"
              description="Esse link não existe mais ou o catálogo está indisponível no momento."
            />
          </div>
        ) : (
          <>
            <div className={aparencia?.mensagem_boas_vindas ? "mb-2" : "mb-6"}>
              <div className="flex items-center gap-3">
                {aparencia?.logo_url && (
                  <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 border border-border">
                    <ImagemStorage src={aparencia.logo_url} alt="" prioridade className="w-full h-full object-cover" />
                  </div>
                )}
                <h1 className="text-2xl font-semibold text-text-primary">{tituloExibido}</h1>
              </div>
              {aparencia?.mensagem_boas_vindas && (
                <p className="text-sm text-text-secondary mt-2">{aparencia.mensagem_boas_vindas}</p>
              )}
            </div>
            {itens.length === 0 ? (
              <div className="bg-surface-1 border border-border rounded-lg">
                <EmptyState icon={BookOpen} title="Nenhum produto disponível no momento" />
              </div>
            ) : (
              <VitrineInterativa
                nome={nome}
                slug={slug}
                itens={itens}
                negocioWhatsapp={negocioWhatsapp}
                carrinhoInicial={carrinhoInicial}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

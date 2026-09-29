import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { VitrineInterativa } from "@/components/catalogo/VitrineInterativa";
import type { ItemVitrine } from "@/components/catalogo/VitrineView";
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

  const comProduto = linhas.filter((l) => l.produto_id !== null && l.preco !== null && l.preco > 0);
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

export default async function VitrinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [linhas, aparencia] = await Promise.all([buscarCatalogoPublico(slug), buscarAparenciaPublica(slug)]);

  const nome = linhas[0]?.catalogo_nome;
  const negocioWhatsapp = linhas[0]?.negocio_whatsapp ?? null;
  // Título e mensagem personalizados substituem o nome cru do catálogo; sem eles, o
  // comportamento é o de sempre.
  const tituloExibido = aparencia?.titulo || nome;

  // Quando o catálogo existe mas não tem produto elegível, a função ainda devolve uma
  // linha (pra distinguir de "slug inválido"), só que com produto_id/preco nulos.
  //
  // `preco > 0` também é exigido: um produto sem preço definido no catálogo cai no
  // `coalesce(cp.preco, p.preco_venda)` da RPC e, se `preco_venda` nunca foi preenchido,
  // vem como 0 — sem esse filtro ele aparecia vendável por R$ 0,00 (ver
  // `catalogo_precos`/`obter_catalogo_publico` — não há como distinguir "de graça" de
  // "esqueceu de precificar" no banco, então tratamos preço zerado como "ainda não
  // configurado", igual ao catálogo já faz com estoque zerado).
  const validas = linhas.filter((i) => i.produto_id !== null && i.produto_nome !== null && i.preco !== null && i.preco > 0);

  // A RPC devolve uma linha por SKU (pra variante esgotada sumir sozinha pelo filtro
  // de estoque). Aqui as variantes do mesmo grupo viram UM item, com o menor preço.
  const porChave = new Map<string, ItemVitrine>();
  for (const linha of validas) {
    const chave = linha.grupo_id ?? linha.produto_id!;
    const variante = {
      produto_id: linha.produto_id!,
      variante_nome: linha.variante_nome,
      preco: linha.preco!,
      imagem_url: linha.imagem_url,
      imagens_extra: linha.imagens_extra ?? [],
    };

    const existente = porChave.get(chave);
    if (existente) {
      existente.variantes.push(variante);
      if (variante.preco < existente.preco) existente.preco = variante.preco;
      existente.imagem_url = existente.imagem_url ?? variante.imagem_url;
      continue;
    }

    porChave.set(chave, {
      produto_id: chave,
      produto_nome: linha.produto_nome!,
      descricao: linha.descricao,
      imagem_url: linha.imagem_url,
      categoria_nome: linha.categoria_nome,
      preco: linha.preco!,
      imagens_extra: linha.imagens_extra ?? [],
      variantes: [variante],
    });
  }

  const itens: ItemVitrine[] = Array.from(porChave.values());

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
              <VitrineInterativa nome={nome} slug={slug} itens={itens} negocioWhatsapp={negocioWhatsapp} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { VitrineInterativa } from "@/components/catalogo/VitrineInterativa";
import type { LinhaCatalogoPublico, ItemVitrine } from "@/components/catalogo/VitrineView";

export default async function VitrinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("obter_catalogo_publico", { p_slug: slug });

  if (error) throw new Error(error.message);

  const linhas = (data ?? []) as LinhaCatalogoPublico[];
  const nome = linhas[0]?.catalogo_nome;
  const negocioWhatsapp = linhas[0]?.negocio_whatsapp ?? null;

  // Quando o catálogo existe mas não tem produto elegível, a função ainda devolve uma
  // linha (pra distinguir de "slug inválido"), só que com produto_id/preco nulos.
  const validas = linhas.filter((i) => i.produto_id !== null && i.produto_nome !== null && i.preco !== null);

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
            <h1 className="text-2xl font-semibold text-text-primary mb-6">{nome}</h1>
            {itens.length === 0 ? (
              <div className="bg-surface-1 border border-border rounded-lg">
                <EmptyState icon={BookOpen} title="Nenhum produto disponível no momento" />
              </div>
            ) : (
              <VitrineInterativa nome={nome} itens={itens} negocioWhatsapp={negocioWhatsapp} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

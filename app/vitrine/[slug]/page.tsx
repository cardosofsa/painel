import { BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { VitrineExportBar } from "@/components/catalogo/VitrineExportBar";
import type { LinhaCatalogoPublico, ItemVitrine } from "@/components/catalogo/VitrineView";

export default async function VitrinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("obter_catalogo_publico", { p_slug: slug });

  if (error) throw new Error(error.message);

  const linhas = (data ?? []) as LinhaCatalogoPublico[];
  const nome = linhas[0]?.catalogo_nome;
  // Quando o catálogo existe mas não tem produto elegível, a função ainda devolve uma
  // linha (pra distinguir de "slug inválido"), só que com produto_nome/preco nulos.
  const itens: ItemVitrine[] = linhas.filter(
    (i): i is LinhaCatalogoPublico & { produto_nome: string; preco: number } => i.produto_nome !== null && i.preco !== null,
  );

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
              <VitrineExportBar nome={nome} itens={itens} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

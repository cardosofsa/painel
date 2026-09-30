import { createClient } from "@/lib/supabase/server";
import { normalizarAbas } from "@/lib/acesso";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { normalizarSecoes } from "@/lib/vixe/vitrine";
import { Card } from "@/components/ui/Card";
import { VixeVitrine, type CatalogoVitrine } from "@/components/vixe/VixeVitrine";

export default async function VixeVitrinePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfilAcesso } = await supabase.from("perfis_acesso").select("abas").eq("user_id", user?.id ?? "").maybeSingle();
  if (!normalizarAbas(perfilAcesso?.abas ?? []).includes("catalogo")) {
    return (
      <Card>
        <p className="text-sm text-text-secondary">A Vixe monta a vitrine do Catálogo. Peça ao administrador para liberar a aba Catálogo.</p>
      </Card>
    );
  }

  const [catalogosRes, aparenciasRes, perfilRes] = await Promise.all([
    supabase.from("catalogos").select("id, nome, slug, ativo").order("criado_em"),
    // `*`: antes da 0040 a coluna `secoes` não existe e pedir por nome derrubaria a página.
    supabase.from("catalogo_aparencia").select("*"),
    supabase.from("perfil_negocio").select("nome_negocio, cidade, whatsapp").maybeSingle(),
  ]);
  if (catalogosRes.error) throw new Error(catalogosRes.error.message);

  const aparencias = new Map(
    ((aparenciasRes.data ?? []) as { catalogo_id: string; secoes?: unknown; logo_url: string | null }[]).map((a) => [a.catalogo_id, a]),
  );
  const catalogos: CatalogoVitrine[] = (catalogosRes.data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    slug: c.slug,
    ativo: c.ativo,
    logoUrl: aparencias.get(c.id)?.logo_url ?? null,
    temSecoes: Object.keys(normalizarSecoes(aparencias.get(c.id)?.secoes)).length > 0,
  }));

  return (
    <VixeVitrine
      catalogos={catalogos}
      nomeNegocio={perfilRes.data?.nome_negocio?.trim() || null}
      cidade={perfilRes.data?.cidade?.trim() || null}
      whatsapp={perfilRes.data?.whatsapp ?? null}
      iaDisponivel={await iaDisponivelParaConta(supabase)}
    />
  );
}

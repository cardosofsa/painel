import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { normalizarSecoes } from "@/lib/vixe/vitrine";
import { PersonalizarCatalogo } from "@/components/catalogo/personalizar/PersonalizarCatalogo";
import type { AparenciaCatalogo } from "../../aparencia-actions";

const PADRAO: AparenciaCatalogo = {
  cor_primaria: "#3b4d1f",
  cor_fundo: "#fafafa",
  cor_superficie: "#ffffff",
  cor_texto: "#18181b",
  fonte: "geist",
  logo_url: null,
  titulo: null,
  mensagem_boas_vindas: null,
};

export default async function PersonalizarCatalogoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const [catalogoRes, aparenciaRes, perfilRes] = await Promise.all([
    supabase.from("catalogos").select("id, nome, slug").eq("id", id).maybeSingle(),
    // `*`: `secoes` só existe a partir da 0040.
    supabase.from("catalogo_aparencia").select("*").eq("catalogo_id", id).maybeSingle(),
    supabase.from("perfil_negocio").select("nome_negocio, cidade, whatsapp, logo_url").maybeSingle(),
  ]);
  if (!catalogoRes.data) notFound();
  const a = aparenciaRes.data as (AparenciaCatalogo & { secoes?: unknown }) | null;
  const aparencia: AparenciaCatalogo = a
    ? {
        cor_primaria: a.cor_primaria,
        cor_fundo: a.cor_fundo,
        cor_superficie: a.cor_superficie,
        cor_texto: a.cor_texto,
        fonte: a.fonte,
        logo_url: a.logo_url,
        titulo: a.titulo,
        mensagem_boas_vindas: a.mensagem_boas_vindas,
      }
    : PADRAO;

  return (
    <PersonalizarCatalogo
      catalogo={catalogoRes.data}
      aparenciaInicial={aparencia}
      secoesIniciais={normalizarSecoes(a?.secoes)}
      empresa={{
        nome: perfilRes.data?.nome_negocio?.trim() || null,
        cidade: perfilRes.data?.cidade?.trim() || null,
        whatsapp: perfilRes.data?.whatsapp ?? null,
        logoUrl: perfilRes.data?.logo_url ?? null,
      }}
      iaDisponivel={await iaDisponivelParaConta(supabase)}
    />
  );
}

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import type { LinhaCatalogoPublico } from "@/components/catalogo/VitrineView";

/**
 * Busca compartilhada entre `layout.tsx`, `page.tsx` e `generateMetadata` — os três
 * precisam do mesmo dado para o mesmo `slug` dentro de uma única requisição.
 *
 * `cache()` do React deduplica chamadas com os mesmos argumentos dentro do mesmo
 * request/render — sem isso, `obter_catalogo_publico` já rodava duas vezes por
 * carregamento (uma em `generateMetadata`, outra no corpo da página); com `layout.tsx`
 * chamando a aparência também, sem memoização viraria três a quatro idas ao banco por
 * visita, todas com o mesmo resultado.
 */
export const buscarCatalogoPublico = cache(async (slug: string): Promise<LinhaCatalogoPublico[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("obter_catalogo_publico", { p_slug: slug });
  if (error) lancarErroSupabase(error);
  return (data ?? []) as LinhaCatalogoPublico[];
});

export interface AparenciaPublica {
  cor_primaria: string;
  cor_fundo: string;
  cor_superficie: string;
  cor_texto: string;
  fonte: "geist" | "inter" | "lora" | "poppins";
  logo_url: string | null;
  titulo: string | null;
  mensagem_boas_vindas: string | null;
  /** Seções da Vixe (0040). Cru do banco: passe por `normalizarSecoes` antes de usar. */
  secoes?: unknown;
}

/** `null` quando o dono nunca personalizou — a vitrine usa os tokens padrão do sistema. */
export const buscarAparenciaPublica = cache(async (slug: string): Promise<AparenciaPublica | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("obter_aparencia_catalogo", { p_slug: slug }).maybeSingle<AparenciaPublica>();
  // Falha ao buscar aparência não pode derrubar a vitrine — ela funciona sem personalização.
  if (error) {
    console.error("[vitrine] obter_aparencia_catalogo:", error.message);
    return null;
  }
  return data ?? null;
});

export interface EmpresaPublica {
  nome_negocio: string | null;
  logo_url: string | null;
  cidade: string | null;
  uf: string | null;
  instagram: string | null;
  whatsapp: string | null;
}

/** Dados públicos da loja (0044). Sem a migração ou sem cadastro: `null`, e a vitrine segue. */
export const buscarEmpresaPublica = cache(async (slug: string): Promise<EmpresaPublica | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("obter_empresa_catalogo", { p_slug: slug }).maybeSingle<EmpresaPublica>();
  if (error) return null;
  return data ?? null;
});

/** Formas de pagamento que o checkout deste catálogo oferece (0051). Sem a migração, nenhuma. */
export const buscarFormasPagamentoPublicas = cache(async (slug: string): Promise<string[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("formas_pagamento_catalogo", { p_slug: slug });
  if (error || !Array.isArray(data)) return [];
  return (data as unknown[]).filter((f): f is string => typeof f === "string" && f.trim().length > 0).slice(0, 8);
});

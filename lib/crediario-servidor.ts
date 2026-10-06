import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegraEncargos } from "@/lib/crediario";

/** Pix da loja (o que o BR Code precisa) e a regra de encargos do crediário (0065). */
export interface ConfigCrediario {
  pix: { chave: string; nome: string; cidade: string } | null;
  regra: RegraEncargos;
}

export const CREDIARIO_VAZIO: ConfigCrediario = { pix: null, regra: { multaPct: 0, jurosMesPct: 0 } };

/**
 * SERVIDOR. Sem a 0065 as colunas não existem: volta a configuração vazia (sem Pix, sem
 * encargos) em vez de derrubar a tela que pediu.
 */
export async function carregarCrediario(supabase: SupabaseClient): Promise<ConfigCrediario> {
  const { data, error } = await supabase
    .from("perfil_negocio")
    .select("nome_negocio, cidade, pix_chave, pix_nome, pix_cidade, multa_atraso_pct, juros_mes_pct")
    .maybeSingle();
  if (error || !data) return CREDIARIO_VAZIO;
  return crediarioDoPerfil(data as Record<string, unknown>);
}

/** A mesma leitura a partir de uma linha de `perfil_negocio` já carregada (`select("*")`). */
export function crediarioDoPerfil(d: Record<string, unknown> | null | undefined): ConfigCrediario {
  if (!d) return CREDIARIO_VAZIO;
  const chave = String(d.pix_chave ?? "").trim();
  const nome = String(d.pix_nome ?? d.nome_negocio ?? "").trim();
  return {
    pix: chave && nome ? { chave, nome, cidade: String(d.pix_cidade ?? d.cidade ?? "").trim() } : null,
    regra: { multaPct: Number(d.multa_atraso_pct ?? 0), jurosMesPct: Number(d.juros_mes_pct ?? 0) },
  };
}

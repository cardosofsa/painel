import type { SupabaseClient } from "@supabase/supabase-js";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";

/**
 * Grava quem vendeu (11.8). `operadorId` explícito (venda feita sem internet, com o turno
 * daquela hora) ou o turno atual; o dono não conta como operador. Falha aqui não derruba a
 * venda (sem a 0063 a função não existe).
 */
export async function marcarOperador(supabase: SupabaseClient, vendaId: string, operadorId?: string | null) {
  const id = operadorId ?? (await acessoAtual())?.operador?.id ?? null;
  if (!id || id === "dono") return;
  const { error } = await supabase.rpc("marcar_operador_venda", { p_venda_id: vendaId, p_operador_id: id });
  if (error && error.code !== "PGRST202") console.error("[operador] venda:", error.message);
}

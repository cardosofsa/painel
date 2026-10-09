import type { SupabaseClient } from "@supabase/supabase-js";

export interface CamposCartao {
  tipo: "conta" | "cartao_credito";
  limite_total: number | null;
  dia_fechamento: number | null;
  dia_vencimento: number | null;
}

/**
 * Campos de cartão das contas (0092), em consulta à parte: sem a migração a coluna não existe,
 * a consulta falha e todas as contas seguem como contas comuns, sem derrubar a tela.
 */
export async function carregarCamposCartao(supabase: SupabaseClient): Promise<Map<string, CamposCartao>> {
  const { data, error } = await supabase.from("contas").select("id, tipo, limite_total, dia_fechamento, dia_vencimento");
  const mapa = new Map<string, CamposCartao>();
  if (error) return mapa;
  for (const c of (data ?? []) as { id: string; tipo: string | null; limite_total: number | string | null; dia_fechamento: number | null; dia_vencimento: number | null }[]) {
    mapa.set(c.id, {
      tipo: c.tipo === "cartao_credito" ? "cartao_credito" : "conta",
      limite_total: c.limite_total === null ? null : Number(c.limite_total),
      dia_fechamento: c.dia_fechamento,
      dia_vencimento: c.dia_vencimento,
    });
  }
  return mapa;
}

/** Junta os campos de cartão às contas já carregadas. */
export function comCamposCartao<T extends { id: string }>(contas: T[], campos: Map<string, CamposCartao>): (T & CamposCartao)[] {
  return contas.map((c) => ({ ...c, ...(campos.get(c.id) ?? { tipo: "conta" as const, limite_total: null, dia_fechamento: null, dia_vencimento: null }) }));
}

/** Só as contas de dinheiro de verdade: onde se RECEBE (PDV, crediário, devolução) cartão não entra. */
export function semCartoes<T extends { id: string }>(contas: T[], campos: Map<string, CamposCartao>): T[] {
  return contas.filter((c) => campos.get(c.id)?.tipo !== "cartao_credito");
}

/** Para escolher de onde SAI o dinheiro: o cartão aparece com o limite disponível ao lado do nome. */
export function contasParaSaida<T extends { id: string; nome: string }>(contas: T[], campos: Map<string, CamposCartao>, saldos: Map<string, number>): T[] {
  return contas.map((c) => {
    const k = campos.get(c.id);
    if (k?.tipo !== "cartao_credito") return c;
    const disponivel = Math.max(0, (k.limite_total ?? 0) + (saldos.get(c.id) ?? 0));
    return { ...c, nome: `${c.nome} (cartão · disponível ${disponivel.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})` };
  });
}

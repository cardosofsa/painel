"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, gastosAnunciosSchema, repassesSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

const SEM_MIGRACAO = "Anúncios e repasses precisam da migração 0066. Aplique no Supabase e recarregue.";
const faltaMigracao = (code?: string) => code === "PGRST205" || code === "42P01" || code === "PGRST202" || code === "PGRST204" || code === "42703";

function revalidateTudo() {
  revalidatePath("/financeiro");
  revalidatePath("/dashboard");
  revalidatePath("/vixe/radar");
}

export interface GastosAnunciosInput {
  periodo_inicio: string;
  periodo_fim: string;
  loja_id: string | null;
  canal: string;
  origem: "shopee_ads" | "manual";
  linhas: { campanha: string; sku: string | null; valor: number; pedidos: number | null; vendas: number | null }[];
}

/**
 * Grava o gasto com anúncios de um período (0066). Importar o mesmo relatório de novo
 * SUBSTITUI o que veio dele (mesmo período, canal e loja), em vez de somar em dobro.
 * O SKU liga o gasto ao produto quando bate com o cadastro (Radar usa isso).
 */
export async function salvarGastosAnuncios(dados: GastosAnunciosInput) {
  return comResultado(async () => {
    const v = validar(gastosAnunciosSchema, dados);
    const supabase = await createClient();

    if (v.origem === "shopee_ads") {
      let apagar = supabase
        .from("gastos_anuncios")
        .delete()
        .eq("origem", "shopee_ads")
        .eq("periodo_inicio", v.periodo_inicio)
        .eq("periodo_fim", v.periodo_fim)
        .eq("canal", v.canal);
      apagar = v.loja_id ? apagar.eq("loja_id", v.loja_id) : apagar.is("loja_id", null);
      const { error } = await apagar;
      if (faltaMigracao(error?.code)) throw new Error(SEM_MIGRACAO);
      if (error) lancarErroSupabase(error);
    }

    const skus = [...new Set(v.linhas.map((l) => l.sku).filter((s): s is string => !!s))];
    const produtoPorSku = new Map<string, string>();
    if (skus.length) {
      const { data } = await supabase.from("produtos").select("id, sku").in("sku", skus.slice(0, 1000));
      for (const p of data ?? []) produtoPorSku.set(p.sku, p.id);
    }

    const { error } = await supabase.from("gastos_anuncios").insert(
      v.linhas.map((l) => ({
        periodo_inicio: v.periodo_inicio,
        periodo_fim: v.periodo_fim,
        loja_id: v.loja_id,
        canal: v.canal,
        origem: v.origem,
        campanha: l.campanha || (v.origem === "manual" ? "Lançamento manual" : ""),
        sku: l.sku,
        produto_id: (l.sku && produtoPorSku.get(l.sku)) || null,
        valor: l.valor,
        pedidos: l.pedidos,
        vendas: l.vendas,
      })),
    );
    if (faltaMigracao(error?.code)) throw new Error(SEM_MIGRACAO);
    if (error?.code === "23505") throw new Error("Já existe um gasto com esse nome nesse período e canal. Mude o nome ou apague o anterior.");
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

export async function removerGastoAnuncio(id: string) {
  return comResultado(async () => {
    const gastoId = validar(z.string().uuid("Gasto inválido"), id);
    const supabase = await createClient();
    const { error } = await supabase.from("gastos_anuncios").delete().eq("id", gastoId);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

export interface ResultadoConciliacao {
  numero: string;
  status: "conciliado" | "divergente" | "nao_encontrado" | "ja_conciliado";
  esperado: number | null;
  recebido: number;
}

/** Concilia os repasses lidos do relatório da plataforma (0066) e dá baixa no Financeiro. */
export async function conciliarRepasses(dados: { conta_id: string; itens: { numero: string; valor: number; data: string | null }[] }) {
  return comResultado(async (): Promise<ResultadoConciliacao[]> => {
    const v = validar(repassesSchema, dados);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("conciliar_repasses", { p_itens: v.itens, p_conta_id: v.conta_id });
    if (faltaMigracao(error?.code)) throw new Error(SEM_MIGRACAO);
    if (error) lancarErroSupabase(error);
    revalidateTudo();
    revalidatePath("/vendas");
    return ((data ?? []) as ResultadoConciliacao[]).map((r) => ({ ...r, esperado: r.esperado === null ? null : Number(r.esperado), recebido: Number(r.recebido) }));
  });
}

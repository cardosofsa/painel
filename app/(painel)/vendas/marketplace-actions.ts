"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { pedidosMarketplaceSchema, vinculosMarketplaceSchema } from "@/lib/marketplace/validacao";
import type { PedidoParaGravar, VinculoSku } from "@/lib/marketplace/margem";
import { sincronizarConexao, type ConexaoShopee } from "@/lib/marketplace/sincronizar";

const SEM_MIGRACAO = "Os pedidos da Shopee precisam da migração 0046. Aplique no Supabase e tente de novo.";
const faltaMigracao = (code?: string) => code === "PGRST202" || code === "PGRST205" || code === "42P01" || code === "42883";

function revalidar() {
  revalidatePath("/vendas");
  revalidatePath("/vendas/relatorios");
  revalidatePath("/estoque");
  revalidatePath("/financeiro");
}

/** Logística e prazo de envio (0047). Sem a migração, a função não existe e isso é ignorado. */
async function gravarEnvios(supabase: Awaited<ReturnType<typeof createClient>>, lojaId: string, pedidos: { numero: string; logistica?: string | null; prazo_envio?: string | null }[]) {
  const envios = pedidos.filter((p) => p.logistica || p.prazo_envio).map((p) => ({ numero: p.numero, logistica: p.logistica ?? null, prazo_envio: p.prazo_envio ?? null }));
  if (!envios.length) return;
  await supabase.rpc("atualizar_envio_marketplace", { p_loja_id: lojaId, p_envios: envios });
}

export interface ResultadoImportacaoMarketplace {
  novos: number;
  atualizados: number;
  baixas: number;
  estornos: number;
}

export async function importarPedidosMarketplace(lojaId: string, pedidos: PedidoParaGravar[]) {
  return comResultado(async (): Promise<ResultadoImportacaoMarketplace> => {
    const loja = validar(z.string().uuid("Escolha a loja"), lojaId);
    const dados = validar(pedidosMarketplaceSchema, pedidos);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("importar_pedidos_marketplace", { p_loja_id: loja, p_pedidos: dados });
    if (error) {
      if (faltaMigracao(error.code)) throw new Error(SEM_MIGRACAO);
      lancarErroSupabase(error);
    }
    await gravarEnvios(supabase, loja, dados);
    revalidar();
    const r = (data ?? {}) as Partial<ResultadoImportacaoMarketplace>;
    return { novos: r.novos ?? 0, atualizados: r.atualizados ?? 0, baixas: r.baixas ?? 0, estornos: r.estornos ?? 0 };
  });
}

/**
 * Grava os vínculos SKU da Shopee → produto feitos na importação. O índice único é por
 * `lower(sku_externo)`, então compara sem diferenciar maiúscula e atualiza o que já existe.
 */
export async function salvarVinculosMarketplace(lojaId: string, vinculos: VinculoSku[]) {
  return comResultado(async () => {
    const loja = validar(z.string().uuid(), lojaId);
    const lista = validar(vinculosMarketplaceSchema, vinculos);
    if (lista.length === 0) return;
    const supabase = await createClient();
    const { data: atuais, error: e1 } = await supabase.from("marketplace_vinculos").select("id, sku_externo").eq("loja_id", loja);
    if (e1) {
      if (faltaMigracao(e1.code)) throw new Error(SEM_MIGRACAO);
      lancarErroSupabase(e1);
    }
    const porSku = new Map((atuais ?? []).map((a) => [String(a.sku_externo).toLowerCase(), a.id as string]));
    const novos: { loja_id: string; sku_externo: string; produto_id: string }[] = [];
    for (const v of lista) {
      const id = porSku.get(v.sku_externo.toLowerCase());
      if (id) {
        const { error } = await supabase.from("marketplace_vinculos").update({ produto_id: v.produto_id }).eq("id", id);
        if (error) lancarErroSupabase(error);
      } else novos.push({ loja_id: loja, sku_externo: v.sku_externo, produto_id: v.produto_id });
    }
    if (novos.length) {
      const { error } = await supabase.from("marketplace_vinculos").insert(novos);
      if (error) lancarErroSupabase(error);
    }
  });
}

export async function removerPedidoMarketplace(pedidoId: string) {
  return comResultado(async () => {
    const id = validar(z.string().uuid(), pedidoId);
    const supabase = await createClient();
    const { error } = await supabase.rpc("remover_pedido_marketplace", { p_pedido_id: id });
    if (error) {
      if (faltaMigracao(error.code)) throw new Error(SEM_MIGRACAO);
      lancarErroSupabase(error);
    }
    revalidar();
  });
}

/** "Sincronizar agora": puxa da API oficial os pedidos da loja conectada (sessão do dono). */
export async function sincronizarShopee(lojaId: string) {
  return comResultado(async () => {
    const loja = validar(z.string().uuid(), lojaId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("marketplace_conexoes")
      .select("id, user_id, loja_id, shop_id, access_token_cifrado, refresh_token_cifrado, expira_em, ultima_sincronizacao")
      .eq("loja_id", loja)
      .maybeSingle();
    if (error) {
      if (faltaMigracao(error.code)) throw new Error(SEM_MIGRACAO);
      lancarErroSupabase(error);
    }
    if (!data) throw new Error("Esta loja ainda não está conectada à API da Shopee.");
    const r = await sincronizarConexao(supabase, data as ConexaoShopee, "dono");
    revalidar();
    return { pedidos: r.pedidos, novos: r.resultado.novos ?? 0, atualizados: r.resultado.atualizados ?? 0 };
  });
}

/** Desliga a API da loja (apaga os tokens). Os pedidos já importados ficam. */
export async function desconectarShopee(lojaId: string) {
  return comResultado(async () => {
    const loja = validar(z.string().uuid(), lojaId);
    const supabase = await createClient();
    const { error } = await supabase.from("marketplace_conexoes").delete().eq("loja_id", loja);
    if (error) lancarErroSupabase(error);
    revalidar();
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { sincronizarConexao, type ConexaoShopee } from "@/lib/marketplace/sincronizar";
import { credenciaisShopee } from "@/lib/marketplace/shopee-api";

const ETAPAS_VENDA = ["emitir", "imprimir", "enviar", "enviado", "concluido"] as const;
/** Sem a 0047 a coluna `etapa` não existe: grava o equivalente em `status_envio`. */
const ENVIO_DA_ETAPA: Record<(typeof ETAPAS_VENDA)[number], "separacao" | "enviado" | "concluido"> = {
  emitir: "separacao",
  imprimir: "separacao",
  enviar: "separacao",
  enviado: "enviado",
  concluido: "concluido",
};

function revalidar() {
  revalidatePath("/vendas");
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
}

/** Avança (ou volta) a etapa de uma ou várias vendas do sistema. */
export async function definirEtapaVendas(ids: string[], etapa: (typeof ETAPAS_VENDA)[number]) {
  return comResultado(async () => {
    const v = validar(z.object({ ids: z.array(z.string().uuid()).min(1).max(500), etapa: z.enum(ETAPAS_VENDA) }), { ids, etapa });
    const supabase = await createClient();
    let { error } = await supabase.from("vendas").update({ etapa: v.etapa }).in("id", v.ids).neq("status", "cancelada");
    if (error?.code === "PGRST204") ({ error } = await supabase.from("vendas").update({ status_envio: ENVIO_DA_ETAPA[v.etapa] }).in("id", v.ids).neq("status", "cancelada"));
    if (error) lancarErroSupabase(error);
    revalidar();
    return v.ids.length;
  });
}

/** Logística de uma venda do sistema (marketplace é da plataforma e não muda aqui). */
export async function definirLogisticaVenda(id: string, logistica: string | null) {
  return comResultado(async () => {
    const v = validar(z.object({ id: z.string().uuid(), logistica: z.string().trim().max(80).nullable() }), { id, logistica });
    const supabase = await createClient();
    const { error } = await supabase.from("vendas").update({ logistica: v.logistica || null }).eq("id", v.id);
    if (error?.code === "PGRST204") throw new Error("A logística por venda precisa da migração 0047.");
    if (error) lancarErroSupabase(error);
    revalidar();
  });
}

/** "Sincronizar pedidos": todas as lojas conectadas à API, uma por vez. */
export async function sincronizarTodasShopee() {
  return comResultado(async () => {
    if (!credenciaisShopee()) throw new Error("A API da Shopee não está ligada neste servidor. Use Importar planilha ou configure em Canais de venda.");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("marketplace_conexoes")
      .select("id, user_id, loja_id, shop_id, access_token_cifrado, refresh_token_cifrado, expira_em, ultima_sincronizacao");
    if (error) throw new Error("Nenhuma loja conectada (falta a migração 0046?).");
    const conexoes = (data ?? []) as ConexaoShopee[];
    if (!conexoes.length) throw new Error("Nenhuma loja conectada à API. Conecte em Configurações → Canais de venda.");
    let pedidos = 0;
    let novos = 0;
    const erros: string[] = [];
    for (const c of conexoes) {
      try {
        const r = await sincronizarConexao(supabase, c, "dono");
        pedidos += r.pedidos;
        novos += r.resultado.novos ?? 0;
      } catch (e) {
        erros.push(e instanceof Error ? e.message : "erro");
      }
    }
    revalidar();
    revalidatePath("/estoque");
    revalidatePath("/financeiro");
    return { lojas: conexoes.length, pedidos, novos, erros };
  });
}

/**
 * Liga um anúncio (SKU da Shopee) a um produto DEPOIS que o pedido entrou: grava o vínculo,
 * recalcula custo e lucro e baixa o estoque se o pedido já tinha baixado (0047).
 */
export async function vincularAnuncioPedidos(lojaId: string, sku: string, produtoId: string) {
  return comResultado(async () => {
    const v = validar(z.object({ lojaId: z.string().uuid(), sku: z.string().trim().min(1).max(300), produtoId: z.string().uuid() }), { lojaId, sku, produtoId });
    const supabase = await createClient();
    const { data: perfil } = await supabase.from("perfil_negocio").select("aliquota_das").maybeSingle();
    const { data, error } = await supabase.rpc("revincular_itens_marketplace", {
      p_loja_id: v.lojaId,
      p_sku: v.sku,
      p_produto_id: v.produtoId,
      p_imposto_pct: Number(perfil?.aliquota_das ?? 0) / 100,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") throw new Error("Vincular anúncio depois do pedido precisa da migração 0047.");
      lancarErroSupabase(error);
    }
    revalidar();
    revalidatePath("/estoque");
    return (data ?? { pedidos: 0, baixas: 0 }) as { pedidos: number; baixas: number };
  });
}

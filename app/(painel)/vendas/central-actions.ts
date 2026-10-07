"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

const ETAPAS_VENDA = ["reservar", "emitir", "enviar", "imprimir", "retirada", "enviado", "concluido"] as const;
type EtapaVendaAcao = (typeof ETAPAS_VENDA)[number];
/** Sem a 0047 a coluna `etapa` não existe: grava o equivalente em `status_envio`. */
const ENVIO_DA_ETAPA: Record<EtapaVendaAcao, "separacao" | "enviado" | "concluido"> = {
  reservar: "separacao",
  emitir: "separacao",
  enviar: "separacao",
  imprimir: "separacao",
  retirada: "separacao",
  enviado: "enviado",
  concluido: "concluido",
};
/** Banco com 0047 mas sem 0052: só conhece emitir/imprimir/enviar/enviado/concluido (ordem antiga). */
const ETAPA_0047: Record<EtapaVendaAcao, string> = {
  reservar: "emitir",
  emitir: "emitir",
  enviar: "imprimir",
  imprimir: "enviar",
  retirada: "enviar",
  enviado: "enviado",
  concluido: "concluido",
};

function revalidar() {
  revalidatePath("/vendas");
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
}

/**
 * Avança (ou volta) a etapa de uma ou várias vendas do sistema. Com a 0052, pela RPC
 * `avancar_etapa_vendas`: passar para Imprimir transforma a reserva em baixa, e sair de
 * Para Reservar só acontece se houver disponível.
 */
export async function definirEtapaVendas(ids: string[], etapa: EtapaVendaAcao) {
  return comResultado(async () => {
    const v = validar(z.object({ ids: z.array(z.string().uuid()).min(1).max(500), etapa: z.enum(ETAPAS_VENDA) }), { ids, etapa });
    const supabase = await createClient();
    let { error } = await supabase.rpc("avancar_etapa_vendas", { p_ids: v.ids, p_etapa: v.etapa });
    if (error?.code === "PGRST202" || error?.code === "42883") {
      // Sem a 0052: grava direto, na grafia que o banco conhece.
      ({ error } = await supabase.from("vendas").update({ etapa: ETAPA_0047[v.etapa] }).in("id", v.ids).neq("status", "cancelada"));
      if (error?.code === "PGRST204") ({ error } = await supabase.from("vendas").update({ status_envio: ENVIO_DA_ETAPA[v.etapa] }).in("id", v.ids).neq("status", "cancelada"));
    }
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

/**
 * Observação interna, tags e ocultar (0053), em vendas e pedidos de marketplace de uma vez.
 * `chaves` são as da central ("venda:<id>", "mkt:<id>"); campos ausentes não mudam.
 */
export async function anotarPedidos(chaves: string[], dados: { observacao?: string | null; tags?: string[]; ocultar?: boolean }) {
  return comResultado(async () => {
    const v = validar(
      z.object({
        chaves: z.array(z.string().regex(/^(venda|mkt):[0-9a-f-]{36}$/)).min(1).max(500),
        observacao: z.string().max(1000).nullable().optional(),
        tags: z.array(z.string().trim().min(1).max(24)).max(8).optional(),
        ocultar: z.boolean().optional(),
      }),
      { chaves, ...dados },
    );
    const vendas = v.chaves.filter((c) => c.startsWith("venda:")).map((c) => c.slice(6));
    const mkt = v.chaves.filter((c) => c.startsWith("mkt:")).map((c) => c.slice(4));
    const supabase = await createClient();
    if (vendas.length) {
      const campos: Record<string, unknown> = {};
      if (v.observacao !== undefined) campos.observacao_interna = v.observacao?.trim() || null;
      if (v.tags !== undefined) campos.tags = v.tags;
      if (v.ocultar !== undefined) campos.ocultado_em = v.ocultar ? new Date().toISOString() : null;
      const { error } = await supabase.from("vendas").update(campos).in("id", vendas);
      if (error?.code === "PGRST204") throw new Error("Observação, tags e ocultar precisam da migração 0053.");
      if (error) lancarErroSupabase(error);
    }
    if (mkt.length) {
      const { error } = await supabase.rpc("anotar_pedidos_marketplace", {
        p_ids: mkt,
        p_observacao: v.observacao === undefined ? null : (v.observacao ?? ""),
        p_tags: v.tags ?? null,
        p_ocultar: v.ocultar ?? null,
      });
      if (error?.code === "PGRST202") throw new Error("Observação, tags e ocultar precisam da migração 0053.");
      if (error) lancarErroSupabase(error);
    }
    revalidar();
    return v.chaves.length;
  });
}

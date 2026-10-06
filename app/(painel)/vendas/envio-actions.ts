"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { sincronizarConexao, tokenDaConexao, tokenML, type ConexaoShopee } from "@/lib/marketplace/sincronizar";
import { plataformaDa } from "@/lib/marketplace/conexao-api";
import { envioDoPedidoML, etiquetasML } from "@/lib/marketplace/mercadolivre-api";
import { baixarEtiquetas, montarShipOrder, parametroEnvio, programarEnvio, rastreio, type ModoEnvio } from "@/lib/marketplace/shopee-envio";

/**
 * Envio da Shopee pelo Sertão (Fase 10.5): programar envio e imprimir etiquetas, um ou em
 * massa. O estado fica em pedidos_marketplace (0054, `registrar_envio_marketplace`); a
 * etapa avança sozinha: ship_order → a Shopee marca PROCESSED (Para Imprimir, com baixa do
 * estoque pela importação) → etiqueta baixada → Para Retirada.
 */

const idsSchema = z.array(z.string().uuid()).min(1).max(50);

interface PedidoEnvio {
  id: string;
  loja_id: string;
  numero: string;
  rastreio: string | null;
}

interface Falha {
  numero: string;
  erro: string;
}

/** Pedidos (do dono, pela RLS) agrupados pela conexão da loja. */
async function porConexao(ids: string[]) {
  const supabase = await createClient();
  const { data: pedidos, error } = await supabase.from("pedidos_marketplace").select("id, loja_id, numero, rastreio").in("id", ids);
  if (error) throw new Error(error.message);
  const lojas = [...new Set((pedidos ?? []).map((p) => p.loja_id as string))];
  const { data: conexoes } = lojas.length ? await supabase.from("marketplace_conexoes").select("*").in("loja_id", lojas) : { data: [] };
  const conexaoDa = new Map(((conexoes ?? []) as ConexaoShopee[]).map((c) => [c.loja_id, c]));
  const grupos = new Map<string, { conexao: ConexaoShopee | null; pedidos: PedidoEnvio[] }>();
  for (const p of (pedidos ?? []) as PedidoEnvio[]) {
    const g = grupos.get(p.loja_id) ?? { conexao: conexaoDa.get(p.loja_id) ?? null, pedidos: [] };
    g.pedidos.push(p);
    grupos.set(p.loja_id, g);
  }
  return { supabase, grupos: [...grupos.values()] };
}

async function registrar(supabase: Awaited<ReturnType<typeof createClient>>, envios: Record<string, unknown>[]) {
  if (!envios.length) return;
  const { error } = await supabase.rpc("registrar_envio_marketplace", { p_envios: envios });
  // Sem a 0054 o estado não fica guardado, mas o envio já foi feito na Shopee: segue (a
  // sincronização traz o PROCESSED; só "Para Retirada" depende da migração).
  if (error?.code === "PGRST202") return;
  if (error) throw new Error(error.message);
}

function revalidar() {
  revalidatePath("/vendas");
  revalidatePath("/estoque");
}

const SEM_API = "Loja sem conexão com a API: use a central da plataforma ou conecte em Configurações → Canais de venda.";

export async function programarEnvioShopee(ids: string[], modo: ModoEnvio) {
  return comResultado(async () => {
    const lista = validar(idsSchema, ids);
    const preferencia = validar(z.enum(["pickup", "dropoff"]), modo);
    const { supabase, grupos } = await porConexao(lista);
    const { data: perfil } = await supabase.from("perfil_negocio").select("nome_negocio").maybeSingle();
    const remetente = (perfil?.nome_negocio as string | null) ?? "";

    const falhas: Falha[] = [];
    const resumos: string[] = [];
    let programados = 0;
    for (const g of grupos) {
      if (!g.conexao) {
        falhas.push(...g.pedidos.map((p) => ({ numero: p.numero, erro: SEM_API })));
        continue;
      }
      if (plataformaDa(g.conexao) === "mercadolivre") {
        falhas.push(...g.pedidos.map((p) => ({ numero: p.numero, erro: "No Mercado Livre o envio não precisa ser programado: a etiqueta sai em Para Imprimir." })));
        continue;
      }
      const { c, token, shopId } = await tokenDaConexao(supabase, g.conexao);
      const envios: Record<string, unknown>[] = [];
      for (const p of g.pedidos) {
        try {
          const corpo = montarShipOrder(p.numero, await parametroEnvio(c, token, shopId, p.numero), preferencia, remetente);
          if (!corpo.ok) throw new Error(corpo.erro);
          await programarEnvio(c, token, shopId, corpo.corpo);
          const codigo = await rastreio(c, token, shopId, p.numero);
          envios.push({ id: p.id, programado: true, erro: null, ...(codigo ? { rastreio: codigo } : {}) });
          resumos.push(corpo.resumo);
          programados++;
        } catch (e) {
          const erro = (e instanceof Error ? e.message : "Erro ao programar").replace(/^Shopee: /, "");
          envios.push({ id: p.id, erro });
          falhas.push({ numero: p.numero, erro });
        }
      }
      await registrar(supabase, envios);
      // Traz o PROCESSED da Shopee na hora (baixa do estoque e etapa Para Imprimir).
      if (programados) await sincronizarConexao(supabase, g.conexao, "dono").catch(() => null);
    }
    revalidar();
    return { programados, falhas, resumo: [...new Set(resumos)].join(" · ") };
  });
}

/** Etiquetas em PDF (base64), uma por loja; os pedidos baixados vão para Para Retirada. */
export async function etiquetasShopee(ids: string[]) {
  return comResultado(async () => {
    const lista = validar(idsSchema, ids);
    const { supabase, grupos } = await porConexao(lista);
    const arquivos: { nome: string; base64: string }[] = [];
    const falhas: Falha[] = [];
    let impressas = 0;
    for (const g of grupos) {
      if (!g.conexao) {
        falhas.push(...g.pedidos.map((p) => ({ numero: p.numero, erro: SEM_API })));
        continue;
      }
      if (plataformaDa(g.conexao) === "mercadolivre") {
        // Mercado Livre: etiqueta por envio (shipment), todas num PDF.
        const { token } = await tokenML(supabase, g.conexao);
        const envios: { pedido: PedidoEnvio; envio: number }[] = [];
        for (const p of g.pedidos) {
          const envio = await envioDoPedidoML(token, p.numero).catch(() => null);
          if (envio) envios.push({ pedido: p, envio });
          else falhas.push({ numero: p.numero, erro: "Pedido sem envio pelo Mercado Envios (envio próprio)." });
        }
        if (!envios.length) continue;
        try {
          const pdf = await etiquetasML(token, [...new Set(envios.map((e) => e.envio))]);
          arquivos.push({ nome: `etiquetas-ml-${new Date().toISOString().slice(0, 10)}-${arquivos.length + 1}.pdf`, base64: Buffer.from(pdf).toString("base64") });
          await registrar(supabase, envios.map((e) => ({ id: e.pedido.id, impressa: true })));
          impressas += envios.length;
        } catch (e) {
          const erro = (e instanceof Error ? e.message : "Erro na etiqueta").replace(/^Mercado Livre: /, "");
          falhas.push(...envios.map((x) => ({ numero: x.pedido.numero, erro })));
        }
        continue;
      }
      const { c, token, shopId } = await tokenDaConexao(supabase, g.conexao);
      const r = await baixarEtiquetas(
        c,
        token,
        shopId,
        g.pedidos.map((p) => ({ orderSn: p.numero, rastreio: p.rastreio })),
      );
      falhas.push(...r.falhas.map((f) => ({ numero: f.orderSn, erro: f.erro.replace(/^Shopee: /, "") })));
      if (r.pdf) {
        arquivos.push({ nome: `etiquetas-${new Date().toISOString().slice(0, 10)}-${arquivos.length + 1}.pdf`, base64: Buffer.from(r.pdf).toString("base64") });
        const prontos = new Set(r.prontos);
        await registrar(
          supabase,
          g.pedidos.filter((p) => prontos.has(p.numero)).map((p) => ({ id: p.id, impressa: true })),
        );
        impressas += prontos.size;
      }
    }
    revalidar();
    return { arquivos, impressas, falhas };
  });
}

/** Volta um pedido para Para Imprimir (etiqueta perdida, reimprimir). */
export async function desmarcarEtiqueta(ids: string[]) {
  return comResultado(async () => {
    const lista = validar(idsSchema, ids);
    const supabase = await createClient();
    await registrar(
      supabase,
      lista.map((id) => ({ id, impressa: false })),
    );
    revalidar();
    return lista.length;
  });
}

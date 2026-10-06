"use server";

import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";
import { imagemIASchema, validar, type ImagemIAInput } from "@/lib/validacao";
import { montarPromptImagem } from "@/lib/ia/prompts-imagem";
import { gerarImagemGemini } from "@/lib/ia/imagem";
import { ErroIA } from "@/lib/ia/erro";

const MAX_FOTO_BYTES = 5 * 1024 * 1024;
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
const SEM_0072 = "As imagens com IA precisam da migração 0072.";
const faltaFuncao = (code?: string) => code === "PGRST202" || code === "42883" || code === "PGRST205" || code === "42P01";

/**
 * Estúdio de IA (Fase 2): gera uma imagem do produto (fundo branco, ambiente, capa com selo,
 * outra cor, medidas ou pedido livre). Ordem obrigatória, como na IA de texto:
 *   reservar a vaga NO BANCO (conta ativa, produto do dono, cota do mês) → chamar a IA →
 *   guardar no Storage → concluir. Erro no meio devolve a vaga.
 * A foto de base só pode vir do Storage da PRÓPRIA conta (o servidor baixa: URL de fora
 * seria SSRF, e foto de outra conta não é dela para editar).
 * Não grava no produto: a tela mostra e a pessoa decide adicionar.
 */
export async function gerarImagemProdutoIA(input: ImagemIAInput) {
  return comResultado(async () => {
    const v = validar(imagemIASchema, input);
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) throw new Error("Sessão expirada. Entre de novo.");

    const { data: produto, error: erroProduto } = await supabase.from("produtos").select("id, nome").eq("id", v.produtoId).maybeSingle();
    if (erroProduto) lancarErroSupabase(erroProduto);
    if (!produto) throw new Error("Produto não encontrado.");

    const montado = montarPromptImagem(v.tipo, { produtoNome: produto.nome as string, extra: v.extra, temFoto: !!v.fotoUrl });
    if ("erro" in montado) throw new Error(montado.erro);

    let foto: { base64: string; mime: string } | null = null;
    if (v.fotoUrl) {
      const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produtos/${uid}/`;
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !v.fotoUrl.startsWith(base)) throw new Error("Use uma foto enviada para este produto.");
      const r = await fetch(v.fotoUrl, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => null);
      const mime = (r?.headers.get("content-type") ?? "").split(";")[0].trim();
      if (!r?.ok || !TIPOS_FOTO.includes(mime)) throw new Error("Não consegui abrir a foto (use JPG, PNG ou WebP).");
      const bytes = Buffer.from(await r.arrayBuffer());
      if (bytes.length > MAX_FOTO_BYTES) throw new Error("Foto grande demais (máx. 5 MB).");
      foto = { base64: bytes.toString("base64"), mime };
    }

    const { data: reserva, error: erroReserva } = await supabase.rpc("ia_reservar_imagem", { p_tipo: v.tipo, p_produto_id: v.produtoId }).maybeSingle<{ id: string; usadas: number; limite: number | null }>();
    if (erroReserva && faltaFuncao(erroReserva.code)) throw new Error(SEM_0072);
    if (erroReserva) lancarErroSupabase(erroReserva);
    if (!reserva) throw new Error("Não foi possível reservar a geração. Tente de novo.");

    let caminho: string | null = null;
    try {
      const img = await gerarImagemGemini(montado.prompt, foto);
      const ext = img.mime.includes("jpeg") ? "jpg" : img.mime.includes("webp") ? "webp" : "png";
      caminho = `${uid}/ia-${v.tipo}-${Date.now()}.${ext}`;
      const { error: erroUpload } = await supabase.storage.from("produtos").upload(caminho, Buffer.from(img.base64, "base64"), { contentType: img.mime, upsert: false });
      if (erroUpload) throw new Error("Não consegui guardar a imagem gerada. Tente de novo.");
      const { data: ok, error: erroConcluir } = await supabase.rpc("ia_concluir_imagem", { p_id: reserva.id, p_caminho: caminho });
      if (erroConcluir || !ok) throw new Error("A geração foi cancelada. Tente de novo.");
      const { data } = supabase.storage.from("produtos").getPublicUrl(caminho);
      return { url: data.publicUrl, usadas: reserva.usadas, limite: reserva.limite };
    } catch (e) {
      await supabase.rpc("ia_cancelar_imagem", { p_id: reserva.id });
      if (caminho) await supabase.storage.from("produtos").remove([caminho]);
      if (e instanceof ErroIA && e.codigo === "sem_chave") throw new Error("As imagens com IA ainda não estão ligadas neste sistema (falta a chave do Gemini).");
      throw e;
    }
  });
}

/** Quantas imagens o plano permite no mês e quantas já foram usadas (para o rótulo do botão). */
export async function saldoImagensIA() {
  return comResultado(async () => {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const inicio = new Date();
    const mesBr = inicio.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
    const { count, error } = await supabase
      .from("ia_imagens")
      .select("id", { count: "exact", head: true })
      .eq("status", "ok")
      .gte("criado_em", new Date(`${mesBr}-01T00:00:00-03:00`).toISOString());
    if (error) return null;
    return { usadas: count ?? 0 };
  });
}


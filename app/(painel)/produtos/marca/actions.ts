"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, perfilMarcaSchema, memoriaMarcaSchema, salvarFichaSchema, PLATAFORMAS_MARCA_IDS } from "@/lib/validacao";
import { gerarFichaPelasCapasIA } from "@/lib/ia/gerar";
import { regrasDaPlataforma } from "@/lib/marca/plataformas";

const PATH = "/anuncio/infinito";
const SEM_MIGRACAO = "O padrão da loja precisa da migração 0098. Aplique no Supabase e recarregue.";
const faltaMigracao = (code?: string) => code === "PGRST205" || code === "42P01" || code === "PGRST202" || code === "42883";

async function sessao() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sua sessão expirou. Entre de novo para continuar.");
  return { supabase, userId: data.user.id };
}

/** Logo e capas só valem se estiverem na pasta do próprio usuário no Storage (o bucket é público, o caminho vem do cliente). */
function caminhoDoUsuario(userId: string, caminho: string): boolean {
  return caminho.startsWith(`${userId}/`) && !caminho.includes("..");
}

function checar(erro: { message: string; code?: string } | null) {
  if (!erro) return;
  if (faltaMigracao(erro.code)) throw new Error(SEM_MIGRACAO);
  lancarErroSupabase(erro);
}

// ---------- Perfil ----------

export async function salvarPerfilMarca(entrada: unknown) {
  return comResultado(async (): Promise<{ id: string }> => {
    const v = validar(perfilMarcaSchema, entrada);
    const { supabase, userId } = await sessao();
    for (const c of [v.logo_path, ...v.referencias]) {
      if (c && !caminhoDoUsuario(userId, c)) throw new Error("Envie as imagens por esta tela (só arquivos da sua conta).");
    }
    const dados = {
      nome: v.nome,
      plataforma: v.plataforma,
      loja_id: v.loja_id,
      nicho: v.nicho?.trim() || null,
      link_loja: v.link_loja?.trim() || null,
      logo_path: v.logo_path || null,
      referencias: v.referencias,
      // Sem repetidos, ignorando caixa.
      termos_proibidos: [...new Map(v.termos_proibidos.map((t) => [t.toLowerCase(), t])).values()],
      atualizado_em: new Date().toISOString(),
    };
    if (v.id) {
      const { error } = await supabase.from("perfis_marca").update(dados).eq("id", v.id);
      checar(error);
      revalidatePath(PATH);
      return { id: v.id };
    }
    const { data, error } = await supabase.from("perfis_marca").insert(dados).select("id").single();
    checar(error);
    revalidatePath(PATH);
    return { id: data!.id as string };
  });
}

export async function removerPerfilMarca(id: string) {
  return comResultado(async () => {
    const v = validar(z.string().uuid(), id);
    const { supabase } = await sessao();
    const { error } = await supabase.from("perfis_marca").delete().eq("id", v);
    checar(error);
    revalidatePath(PATH);
  });
}

// ---------- Memória ----------

export async function adicionarMemoriaMarca(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(memoriaMarcaSchema, entrada);
    const { supabase } = await sessao();
    const { error } = await supabase.from("marca_memoria").insert(v);
    checar(error);
    revalidatePath(PATH);
  });
}

export async function alternarMemoriaMarca(id: string, ativo: boolean) {
  return comResultado(async () => {
    const v = validar(z.object({ id: z.string().uuid(), ativo: z.boolean() }), { id, ativo });
    const { supabase } = await sessao();
    const { error } = await supabase.from("marca_memoria").update({ ativo: v.ativo }).eq("id", v.id);
    checar(error);
    revalidatePath(PATH);
  });
}

export async function removerMemoriaMarca(id: string) {
  return comResultado(async () => {
    const v = validar(z.string().uuid(), id);
    const { supabase } = await sessao();
    const { error } = await supabase.from("marca_memoria").delete().eq("id", v);
    checar(error);
    revalidatePath(PATH);
  });
}

// ---------- Ficha de Direção de Arte ----------

export async function salvarFichaMarca(entrada: unknown) {
  return comResultado(async (): Promise<{ id: string; versao: number }> => {
    const v = validar(salvarFichaSchema, entrada);
    const { supabase } = await sessao();
    const { data, error } = await supabase.rpc("salvar_ficha_marca", {
      p_perfil_id: v.perfil_id,
      p_tipo_imagem: v.tipo_imagem,
      p_dados: v.dados,
      p_origem: v.origem,
      p_nota: v.nota,
    });
    checar(error);
    const linha = (Array.isArray(data) ? data[0] : data) as { id: string; versao: number } | null;
    if (!linha) throw new Error("Não foi possível salvar a ficha.");
    revalidatePath(PATH);
    return { id: linha.id, versao: Number(linha.versao) };
  });
}

export async function ativarVersaoFichaMarca(id: string) {
  return comResultado(async () => {
    const v = validar(z.string().uuid(), id);
    const { supabase } = await sessao();
    const { error } = await supabase.rpc("ativar_ficha_marca", { p_ficha_id: v });
    checar(error);
    revalidatePath(PATH);
  });
}

// ---------- Aprender das capas ----------

const MAX_MONTAGEM_BYTES = 4 * 1024 * 1024;
const TIPOS_IMAGEM_IA = ["image/jpeg", "image/png", "image/webp"];

const aprenderSchema = z.object({
  url: z.string().url().max(500),
  plataforma: z.enum(PLATAFORMAS_MARCA_IDS),
  nicho: z.string().trim().max(120).nullable(),
  capas: z.number().int().min(1).max(8),
});

/**
 * A IA olha a montagem das capas (enviada pelo navegador ao Storage) e PROPÕE a ficha. NÃO grava
 * nada: a tela mostra a proposta e o usuário aprova campo a campo. Só baixa imagem do Storage
 * do próprio projeto, na pasta do usuário.
 */
export async function aprenderDasCapas(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(aprenderSchema, entrada);
    const { supabase, userId } = await sessao();
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produtos/${userId}/`;
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !v.url.startsWith(base) || v.url.includes("..")) throw new Error("Envie as capas por esta tela primeiro (só imagens da sua conta).");

    const r = await fetch(v.url, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const mime = (r?.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!r?.ok || !TIPOS_IMAGEM_IA.includes(mime)) throw new Error("Não consegui abrir a imagem (use JPG, PNG ou WebP).");
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > MAX_MONTAGEM_BYTES) throw new Error("Imagem grande demais para a IA (máx. 4 MB).");

    const g = await gerarFichaPelasCapasIA(
      supabase,
      { plataforma: regrasDaPlataforma(v.plataforma).nome, nicho: v.nicho || null, capas: v.capas },
      { base64: bytes.toString("base64"), mime, hash: createHash("sha256").update(bytes).digest("hex") },
    );
    if (!g.ok) throw new Error(g.erro);
    return g.dado;
  });
}

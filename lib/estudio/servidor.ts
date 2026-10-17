import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarFicha, mesclarFicha, type FichaMarca } from "@/lib/marca/ficha";
import { regrasDaPlataforma, type PlataformaMarcaId, type RegrasPlataforma } from "@/lib/marca/plataformas";
import { estadoRascunhoSchema, type EstadoRascunho } from "@/lib/validacao";

/**
 * Tudo que o estúdio precisa saber para agir, lido do banco com a sessão do usuário (RLS). É a
 * ÚNICA fonte do que vai à IA: as actions recebem só ids e texto digitado, nunca ficha, título
 * ou concorrente vindos do navegador.
 */
export interface ContextoRascunho {
  userId: string;
  rascunho: { id: string; produto_id: string; perfil_id: string | null; titulo: string | null; descricao: string | null; estado: EstadoRascunho };
  produto: { id: string; nome: string; variante: string | null; categoria: string | null; imagemUrl: string | null; palavrasChave: string[]; precoVenda: number | null; sku: string | null; estoque: number; pesoG: number | null; alturaCm: number | null; larguraCm: number | null; comprimentoCm: number | null };
  perfil: { id: string; nome: string; plataforma: PlataformaMarcaId; lojaId: string | null; nicho: string | null; termosProibidos: string[]; logoPath: string | null } | null;
  plataforma: RegrasPlataforma;
  memoria: string[];
  fichaCapa1: FichaMarca;
}

const erro = (msg: string) => new Error(msg);

export async function usuarioDaSessao(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw erro("Sua sessão expirou. Entre de novo para continuar.");
  return data.user.id;
}

/** Lê o estado guardado; o que não passar no schema é ignorado em vez de quebrar a tela. */
export function lerEstado(bruto: unknown): EstadoRascunho {
  const r = estadoRascunhoSchema.safeParse(bruto ?? {});
  if (r.success) return r.data;
  // Campo a campo: um item ruim não derruba o rascunho inteiro.
  const saida: Record<string, unknown> = {};
  for (const [k, schema] of Object.entries(estadoRascunhoSchema.shape)) {
    const campo = schema.safeParse((bruto as Record<string, unknown> | null)?.[k]);
    if (campo.success && campo.data !== undefined) saida[k] = campo.data;
  }
  return saida as EstadoRascunho;
}

export async function carregarContextoRascunho(supabase: SupabaseClient, rascunhoId: string): Promise<ContextoRascunho> {
  const userId = await usuarioDaSessao(supabase);
  const { data: r, error } = await supabase.from("anuncio_rascunhos").select("id, produto_id, perfil_id, titulo, descricao, estado").eq("id", rascunhoId).maybeSingle();
  if (error) throw erro("Não foi possível abrir o rascunho.");
  if (!r) throw erro("Rascunho não encontrado.");

  const [produtoRes, perfilRes] = await Promise.all([
    supabase.from("produtos").select("id, nome, sku, estoque, variante_nome, imagem_url, palavras_chave, preco_venda, peso_g, altura_cm, largura_cm, comprimento_cm, categorias(nome)").eq("id", r.produto_id).maybeSingle(),
    r.perfil_id ? supabase.from("perfis_marca").select("id, nome, plataforma, loja_id, nicho, termos_proibidos, logo_path").eq("id", r.perfil_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const p = produtoRes.data as { id: string; nome: string; sku: string | null; estoque: number | null; variante_nome: string | null; imagem_url: string | null; palavras_chave: string[] | null; preco_venda: number | null; peso_g: number | null; altura_cm: number | null; largura_cm: number | null; comprimento_cm: number | null; categorias: { nome: string } | null } | null;
  if (!p) throw erro("Produto não encontrado.");
  const perfil = perfilRes.data as { id: string; nome: string; plataforma: PlataformaMarcaId; loja_id: string | null; nicho: string | null; termos_proibidos: string[] | null; logo_path: string | null } | null;

  const [memoriaRes, fichasRes] = await Promise.all([
    supabase.from("marca_memoria").select("texto, perfil_id").eq("ativo", true).or(perfil ? `perfil_id.is.null,perfil_id.eq.${perfil.id}` : "perfil_id.is.null").order("criado_em", { ascending: false }).limit(20),
    perfil ? supabase.from("marca_fichas").select("tipo_imagem, dados").eq("perfil_id", perfil.id).eq("ativa", true).in("tipo_imagem", ["geral", "capa_1"]) : Promise.resolve({ data: [] }),
  ]);
  const fichas = (fichasRes.data ?? []) as { tipo_imagem: string; dados: unknown }[];
  const geral = normalizarFicha(fichas.find((f) => f.tipo_imagem === "geral")?.dados);
  const capa1 = normalizarFicha(fichas.find((f) => f.tipo_imagem === "capa_1")?.dados);

  return {
    userId,
    rascunho: { id: r.id, produto_id: r.produto_id, perfil_id: r.perfil_id, titulo: r.titulo ?? null, descricao: r.descricao ?? null, estado: lerEstado(r.estado) },
    produto: { id: p.id, nome: p.nome, variante: p.variante_nome, categoria: p.categorias?.nome ?? null, imagemUrl: p.imagem_url, palavrasChave: p.palavras_chave ?? [], precoVenda: p.preco_venda != null ? Number(p.preco_venda) : null, sku: p.sku, estoque: Number(p.estoque ?? 0), pesoG: p.peso_g != null ? Number(p.peso_g) : null, alturaCm: p.altura_cm != null ? Number(p.altura_cm) : null, larguraCm: p.largura_cm != null ? Number(p.largura_cm) : null, comprimentoCm: p.comprimento_cm != null ? Number(p.comprimento_cm) : null },
    perfil: perfil ? { id: perfil.id, nome: perfil.nome, plataforma: perfil.plataforma, lojaId: perfil.loja_id, nicho: perfil.nicho, termosProibidos: perfil.termos_proibidos ?? [], logoPath: perfil.logo_path } : null,
    plataforma: regrasDaPlataforma(perfil?.plataforma ?? "shopee"),
    memoria: ((memoriaRes.data ?? []) as { texto: string }[]).map((m) => m.texto),
    fichaCapa1: mesclarFicha(geral, capa1),
  };
}

/** Junta `patch` ao estado guardado (nível de cima) e valida o resultado. */
export async function gravarEstado(supabase: SupabaseClient, rascunhoId: string, atual: EstadoRascunho, patch: Partial<EstadoRascunho>, extra: { titulo?: string | null } = {}): Promise<EstadoRascunho> {
  const novo = estadoRascunhoSchema.parse({ ...atual, ...patch });
  const { error } = await supabase
    .from("anuncio_rascunhos")
    .update({ estado: novo, ...(extra.titulo !== undefined ? { titulo: extra.titulo } : {}), atualizado_em: new Date().toISOString() })
    .eq("id", rascunhoId);
  if (error) throw erro("Não foi possível salvar o rascunho.");
  return novo;
}

/** Caminho de imagem só vale se estiver na pasta do próprio usuário (o bucket é público). */
export function caminhoDoUsuario(userId: string, caminho: string): boolean {
  return caminho.startsWith(`${userId}/`) && !caminho.includes("..");
}

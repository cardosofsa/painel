import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarFicha, mesclarFicha, type FichaMarca } from "@/lib/marca/ficha";
import { regrasDaPlataforma, type PlataformaMarcaId, type RegrasPlataforma } from "@/lib/marca/plataformas";
import { estadoRascunhoSchema, type EstadoRascunho } from "@/lib/validacao";
import type { AcaoProposta } from "@/lib/ia/prompts-assistente";
import { statusDoRascunho } from "@/lib/anuncio/etapas";
import { termosDoPerfil, type TermosDoPerfil } from "@/lib/conformidade/termos";
import { precosPorLoja, type SituacaoPrecoLoja } from "@/lib/precos-loja";
import { carregarLojaParaPreco } from "@/lib/precos-loja-servidor";

/**
 * O preço que o anúncio usa (0101): o da loja do perfil, com lucro e margem calculados com as
 * taxas dela. Perfil sem loja (ou banco sem a 0101) cai no preço do cadastro, como antes.
 */
export interface PrecoDoAnuncio {
  origem: "loja" | "cadastro";
  lojaId: string | null;
  lojaRotulo: string | null;
  /** `null` = a loja ainda não tem preço para este produto. */
  preco: number | null;
  lucro: number | null;
  margemPct: number | null;
  situacao: SituacaoPrecoLoja | null;
  /** Zona morta: o preço logo abaixo da virada de faixa, que rende mais. */
  precoMelhor: number | null;
}

/** O rascunho como a tela do Anúncio Infinito o recebe (aberto por produto ou por id). */
export interface RascunhoAberto {
  id: string;
  produtoId: string;
  perfilId: string | null;
  titulo: string | null;
  descricao: string | null;
  /** Dados do produto que a tela precisa (preço, palavras-chave, foto). */
  produto: { nome: string; precoVenda: number | null; palavrasChave: string[]; imagemUrl: string | null; pesoG: number | null; temMedidas: boolean; estoque: number };
  status: string;
  estado: EstadoRascunho;
  mensagens: { id: string; papel: "usuario" | "ia"; texto: string; acoes: AcaoProposta[]; criado_em: string }[];
  preco: PrecoDoAnuncio;
  /** Títulos já usados nas precificações deste produto (`precificacoes.titulo_anuncio`). */
  titulosUsados: string[];
  /** O anúncio sincronizado deste produto na loja (o criado por este rascunho, se houver), para a Análise. */
  anuncioLojaId: string | null;
}

/**
 * Tudo que o estúdio precisa saber para agir, lido do banco com a sessão do usuário (RLS). É a
 * ÚNICA fonte do que vai à IA: as actions recebem só ids e texto digitado, nunca ficha, título
 * ou concorrente vindos do navegador.
 */
export interface ContextoRascunho {
  userId: string;
  rascunho: { id: string; produto_id: string; perfil_id: string | null; titulo: string | null; descricao: string | null; status: string; estado: EstadoRascunho; atualizadoEm: string };
  produto: { id: string; nome: string; variante: string | null; categoria: string | null; imagemUrl: string | null; palavrasChave: string[]; precoVenda: number | null; sku: string | null; estoque: number; pesoG: number | null; alturaCm: number | null; larguraCm: number | null; comprimentoCm: number | null };
  perfil: { id: string; nome: string; plataforma: PlataformaMarcaId; lojaId: string | null; nicho: string | null; termos: TermosDoPerfil; logoPath: string | null } | null;
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
  const { data: r, error } = await supabase.from("anuncio_rascunhos").select("id, produto_id, perfil_id, titulo, descricao, status, estado, atualizado_em").eq("id", rascunhoId).maybeSingle();
  if (error) throw erro("Não foi possível abrir o rascunho.");
  if (!r) throw erro("Rascunho não encontrado.");

  const [produtoRes, perfilRes] = await Promise.all([
    supabase.from("produtos").select("id, nome, sku, estoque, variante_nome, imagem_url, palavras_chave, preco_venda, peso_g, altura_cm, largura_cm, comprimento_cm, categorias(nome)").eq("id", r.produto_id).maybeSingle(),
    r.perfil_id ? // "*": as colunas de termos da 0103 só vêm depois dela.
    supabase.from("perfis_marca").select("*").eq("id", r.perfil_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const p = produtoRes.data as { id: string; nome: string; sku: string | null; estoque: number | null; variante_nome: string | null; imagem_url: string | null; palavras_chave: string[] | null; preco_venda: number | null; peso_g: number | null; altura_cm: number | null; largura_cm: number | null; comprimento_cm: number | null; categorias: { nome: string } | null } | null;
  if (!p) throw erro("Produto não encontrado.");
  const perfil = perfilRes.data as { id: string; nome: string; plataforma: PlataformaMarcaId; loja_id: string | null; nicho: string | null; termos_proibidos: string[] | null; logo_path: string | null; presets?: unknown; presets_gravidade?: unknown; termos_bloqueados?: unknown } | null;

  const [memoriaRes, fichasRes] = await Promise.all([
    supabase.from("marca_memoria").select("texto, perfil_id").eq("ativo", true).or(perfil ? `perfil_id.is.null,perfil_id.eq.${perfil.id}` : "perfil_id.is.null").order("criado_em", { ascending: false }).limit(20),
    perfil ? supabase.from("marca_fichas").select("tipo_imagem, dados").eq("perfil_id", perfil.id).eq("ativa", true).in("tipo_imagem", ["geral", "capa_1"]) : Promise.resolve({ data: [] }),
  ]);
  const fichas = (fichasRes.data ?? []) as { tipo_imagem: string; dados: unknown }[];
  const geral = normalizarFicha(fichas.find((f) => f.tipo_imagem === "geral")?.dados);
  const capa1 = normalizarFicha(fichas.find((f) => f.tipo_imagem === "capa_1")?.dados);

  return {
    userId,
    rascunho: { id: r.id, produto_id: r.produto_id, perfil_id: r.perfil_id, titulo: r.titulo ?? null, descricao: r.descricao ?? null, status: r.status ?? "rascunho", estado: lerEstado(r.estado), atualizadoEm: r.atualizado_em },
    produto: { id: p.id, nome: p.nome, variante: p.variante_nome, categoria: p.categorias?.nome ?? null, imagemUrl: p.imagem_url, palavrasChave: p.palavras_chave ?? [], precoVenda: p.preco_venda != null ? Number(p.preco_venda) : null, sku: p.sku, estoque: Number(p.estoque ?? 0), pesoG: p.peso_g != null ? Number(p.peso_g) : null, alturaCm: p.altura_cm != null ? Number(p.altura_cm) : null, larguraCm: p.largura_cm != null ? Number(p.largura_cm) : null, comprimentoCm: p.comprimento_cm != null ? Number(p.comprimento_cm) : null },
    perfil: perfil ? { id: perfil.id, nome: perfil.nome, plataforma: perfil.plataforma, lojaId: perfil.loja_id, nicho: perfil.nicho, termos: termosDoPerfil(perfil), logoPath: perfil.logo_path } : null,
    plataforma: regrasDaPlataforma(perfil?.plataforma ?? "shopee"),
    memoria: ((memoriaRes.data ?? []) as { texto: string }[]).map((m) => m.texto),
    fichaCapa1: mesclarFicha(geral, capa1),
  };
}

export const ERRO_CONCORRENCIA = "Este anúncio mudou em outra aba ou janela. Recarregue a página e tente de novo.";

/**
 * Junta `patch` ao estado guardado (nível de cima) e valida o resultado.
 *
 * Com `versao` (o `atualizado_em` lido junto com `atual`), a gravação é condicional: se outra
 * requisição gravou no meio, nenhuma linha muda e a função lança `ERRO_CONCORRENCIA` em vez de
 * sobrescrever o que a outra fez. Devolve o estado novo e a versão nova.
 */
export async function gravarEstado(
  supabase: SupabaseClient,
  rascunhoId: string,
  atual: EstadoRascunho,
  patch: Partial<EstadoRascunho>,
  extra: { titulo?: string | null; versao?: string; status?: string } = {},
): Promise<EstadoRascunho> {
  return (await gravarEstadoVersionado(supabase, rascunhoId, atual, patch, extra)).estado;
}

export async function gravarEstadoVersionado(
  supabase: SupabaseClient,
  rascunhoId: string,
  atual: EstadoRascunho,
  patch: Partial<EstadoRascunho>,
  extra: { titulo?: string | null; versao?: string; status?: string } = {},
): Promise<{ estado: EstadoRascunho; versao: string }> {
  const novo = estadoRascunhoSchema.parse({ ...atual, ...patch });
  const versao = new Date().toISOString();
  let q = supabase
    .from("anuncio_rascunhos")
    .update({ estado: novo, ...(extra.titulo !== undefined ? { titulo: extra.titulo } : {}), ...(extra.status ? { status: extra.status } : {}), atualizado_em: versao })
    .eq("id", rascunhoId);
  if (extra.versao) q = q.eq("atualizado_em", extra.versao);
  const { data, error } = await q.select("id");
  if (error) throw erro("Não foi possível salvar o rascunho.");
  if (extra.versao && !(data ?? []).length) throw erro(ERRO_CONCORRENCIA);
  return { estado: novo, versao };
}

/** Estado gravado agora (relido), para juntar o resultado de algo demorado sem apagar o que mudou no meio. */
export async function lerEstadoAtual(supabase: SupabaseClient, rascunhoId: string): Promise<EstadoRascunho> {
  const { data, error } = await supabase.from("anuncio_rascunhos").select("estado").eq("id", rascunhoId).maybeSingle();
  if (error || !data) throw erro("Não foi possível abrir o rascunho.");
  return lerEstado(data.estado);
}

/** Uma geração de capa vale por até 3 min: depois disso a trava é considerada abandonada. */
const PRAZO_GERACAO_CAPA_MS = 3 * 60_000;

export function capaEmGeracao(estado: EstadoRascunho, agora = Date.now()): boolean {
  const inicio = estado.capaEmGeracao ? Date.parse(estado.capaEmGeracao) : NaN;
  return Number.isFinite(inicio) && agora - inicio >= 0 && agora - inicio < PRAZO_GERACAO_CAPA_MS;
}

/** Lê o rascunho inteiro como a tela usa. Com RLS: id de outra conta volta `null`. */
export async function lerRascunhoAberto(supabase: SupabaseClient, rascunhoId: string): Promise<RascunhoAberto | null> {
  const { data: r, error } = await supabase.from("anuncio_rascunhos").select("id, produto_id, perfil_id, titulo, descricao, status, estado").eq("id", rascunhoId).maybeSingle();
  if (error) throw erro("Não foi possível abrir o rascunho.");
  if (!r) return null;
  const [{ data: p }, { data: msgs }, preco, { data: titulosRes }] = await Promise.all([
    supabase.from("produtos").select("nome, preco_venda, palavras_chave, imagem_url, peso_g, altura_cm, largura_cm, comprimento_cm, estoque").eq("id", r.produto_id).maybeSingle(),
    supabase.from("anuncio_rascunho_mensagens").select("id, papel, texto, acoes, criado_em").eq("rascunho_id", r.id).order("criado_em", { ascending: true }).limit(60),
    precoDoAnuncio(supabase, r.produto_id, r.perfil_id ?? null),
    supabase.from("precificacoes").select("titulo_anuncio").eq("produto_id", r.produto_id).not("titulo_anuncio", "is", null).order("criado_em", { ascending: false }).limit(30),
  ]);
  const estadoLido = lerEstado(r.estado);
  const itemCriado = estadoLido.itemShopee?.itemId ?? null;
  const { data: noAr } = await (itemCriado
    ? supabase.from("marketplace_anuncios").select("id").eq("item_id", itemCriado).limit(1)
    : supabase.from("marketplace_anuncios").select("id").eq("produto_id", r.produto_id).limit(1));
  const titulosUsados = [...new Set(((titulosRes ?? []) as { titulo_anuncio: string | null }[]).map((t) => (t.titulo_anuncio ?? "").trim()).filter((t) => t.length >= 3))].slice(0, 5);
  return {
    id: r.id,
    produtoId: r.produto_id,
    perfilId: r.perfil_id ?? null,
    titulo: r.titulo ?? null,
    descricao: r.descricao ?? null,
    produto: {
      nome: (p?.nome as string | undefined) ?? "",
      precoVenda: p?.preco_venda != null ? Number(p.preco_venda) : null,
      palavrasChave: (p?.palavras_chave as string[] | null) ?? [],
      imagemUrl: (p?.imagem_url as string | null) ?? null,
      pesoG: p?.peso_g != null ? Number(p.peso_g) : null,
      temMedidas: !!(p?.altura_cm && p?.largura_cm && p?.comprimento_cm),
      estoque: Number(p?.estoque ?? 0),
    },
    status: r.status ?? "rascunho",
    estado: lerEstado(r.estado),
    mensagens: ((msgs ?? []) as RascunhoAberto["mensagens"]).map((m) => ({ ...m, acoes: Array.isArray(m.acoes) ? m.acoes : [] })),
    preco,
    titulosUsados,
    anuncioLojaId: ((noAr ?? []) as { id: string }[])[0]?.id ?? null,
  };
}

export async function precoDoAnuncio(supabase: SupabaseClient, produtoId: string, perfilId: string | null): Promise<PrecoDoAnuncio> {
  const { data: prod } = await supabase.from("produtos").select("preco_venda, custo").eq("id", produtoId).maybeSingle();
  const doCadastro: PrecoDoAnuncio = {
    origem: "cadastro",
    lojaId: null,
    lojaRotulo: null,
    preco: prod?.preco_venda != null && Number(prod.preco_venda) > 0 ? Number(prod.preco_venda) : null,
    lucro: null,
    margemPct: null,
    situacao: null,
    precoMelhor: null,
  };
  if (!perfilId) return doCadastro;
  const { data: perfil } = await supabase.from("perfis_marca").select("loja_id").eq("id", perfilId).maybeSingle();
  const lojaId = (perfil?.loja_id as string | null) ?? null;
  if (!lojaId) return doCadastro;

  const [loja, precoRes, negocioRes] = await Promise.all([
    carregarLojaParaPreco(supabase, lojaId),
    supabase.from("produto_lojas").select("loja_id, preco, preco_atualizado_em").eq("produto_id", produtoId).eq("loja_id", lojaId).maybeSingle(),
    supabase.from("perfil_negocio").select("aliquota_das").maybeSingle(),
  ]);
  // Sem a 0101 a coluna `preco` não existe: segue com o preço do cadastro.
  if (precoRes.error || !loja) return doCadastro;
  const aliquota = Number(negocioRes.data?.aliquota_das ?? 6) / 100;
  const [linha] = precosPorLoja([loja], precoRes.data ? [precoRes.data as { loja_id: string; preco: number | null }] : [], Number(prod?.custo ?? 0), aliquota);
  return {
    origem: "loja",
    lojaId: loja.id,
    lojaRotulo: linha.rotulo,
    preco: linha.preco,
    lucro: linha.resultado?.lucroLiquido ?? null,
    margemPct: linha.resultado?.margemEfetivaPct ?? null,
    situacao: linha.situacao,
    precoMelhor: linha.zonaMorta?.precoMelhor ?? null,
  };
}

/** Caminho de imagem só vale se estiver na pasta do próprio usuário (o bucket é público). */
export function caminhoDoUsuario(userId: string, caminho: string): boolean {
  return caminho.startsWith(`${userId}/`) && !caminho.includes("..");
}

/**
 * Recalcula `status` (rascunho → pronto → publicado) a partir do que está gravado. Antes ele
 * nunca saía de "rascunho". Falha aqui não derruba a ação que já gravou: é um rótulo.
 */
export async function sincronizarStatus(supabase: SupabaseClient, rascunhoId: string, publicado = false) {
  const { data: r } = await supabase.from("anuncio_rascunhos").select("titulo, descricao, status, estado").eq("id", rascunhoId).maybeSingle();
  if (!r) return;
  const capaAprovada = (lerEstado(r.estado).capas ?? []).some((c) => c.veredito === "aprovada");
  const status = statusDoRascunho({ atual: r.status, titulo: r.titulo, descricao: r.descricao, capaAprovada, publicado });
  if (status !== r.status) await supabase.from("anuncio_rascunhos").update({ status }).eq("id", rascunhoId);
}

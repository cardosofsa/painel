import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarFicha, mesclarFicha, type FichaMarca } from "@/lib/marca/ficha";
import { regrasDaPlataforma, type PlataformaMarcaId, type RegrasPlataforma } from "@/lib/marca/plataformas";
import { estadoRascunhoSchema, type EstadoRascunho } from "@/lib/validacao";
import { lerAnexos, type AcaoProposta, type AnexoMensagem } from "@/lib/ia/prompts-assistente";
import { statusDoRascunho } from "@/lib/anuncio/etapas";
import { termosDoPerfil, type TermosDoPerfil } from "@/lib/conformidade/termos";
import { precosPorLoja, type SituacaoPrecoLoja } from "@/lib/precos-loja";
import { carregarLojaParaPreco } from "@/lib/precos-loja-servidor";
import type { EstiloDaLoja, OrigemExemplo, TipoExemplo } from "@/lib/ia/estilo-loja";

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
  /**
   * O perfil tem loja, mas não deu para ler o preço dela (erro de banco, loja apagada). Antes
   * isso caía em silêncio no preço do cadastro (o do PDV), que podia ir para a Shopee.
   */
  erro?: string | null;
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
  mensagens: MensagemDoChat[];
  preco: PrecoDoAnuncio;
  /** Títulos já usados nas precificações deste produto (`precificacoes.titulo_anuncio`). */
  titulosUsados: string[];
  /** O anúncio sincronizado deste produto na loja (o criado por este rascunho, se houver), para a Análise. */
  anuncioLojaId: string | null;
}

/** Uma mensagem do chat do anúncio como a tela recebe. */
export interface MensagemDoChat {
  id: string;
  papel: "usuario" | "ia";
  texto: string;
  acoes: AcaoProposta[];
  /** Índices das ações já aplicadas (0110). Sem a migração vem vazio: a tela marca só na memória. */
  acoesFeitas: number[];
  /** Referência colada e imagens (0110). */
  anexos: AnexoMensagem[];
  criado_em: string;
}

/** Linha crua de `anuncio_rascunho_mensagens` (lida com `*`: as colunas da 0110 podem não existir). */
export function lerMensagem(m: Record<string, unknown>): MensagemDoChat {
  const feitas = Array.isArray(m.acoes_feitas) ? (m.acoes_feitas as unknown[]).filter((n): n is number => Number.isInteger(n)) : [];
  return {
    id: String(m.id),
    papel: m.papel === "ia" ? "ia" : "usuario",
    texto: typeof m.texto === "string" ? m.texto : "",
    acoes: Array.isArray(m.acoes) ? (m.acoes as AcaoProposta[]) : [],
    acoesFeitas: feitas,
    anexos: lerAnexos(m.anexos),
    criado_em: String(m.criado_em ?? ""),
  };
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
  /** Instruções de base e exemplos da loja (0109), por tipo de texto. Vazio sem a migração. */
  estilo: Record<TipoExemplo, EstiloDaLoja>;
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
  const perfil = perfilRes.data as { id: string; nome: string; plataforma: PlataformaMarcaId; loja_id: string | null; nicho: string | null; termos_proibidos: string[] | null; logo_path: string | null; presets?: unknown; presets_gravidade?: unknown; termos_bloqueados?: unknown; instrucoes_titulo?: string | null; instrucoes_descricao?: string | null } | null;
  const doPerfil = perfil ? `perfil_id.is.null,perfil_id.eq.${perfil.id}` : "perfil_id.is.null";

  const [memoriaRes, fichasRes, exemplosRes] = await Promise.all([
    supabase.from("marca_memoria").select("texto, perfil_id").eq("ativo", true).or(doPerfil).order("criado_em", { ascending: false }).limit(20),
    perfil ? supabase.from("marca_fichas").select("tipo_imagem, dados").eq("perfil_id", perfil.id).eq("ativa", true).in("tipo_imagem", ["geral", "capa_1"]) : Promise.resolve({ data: [] }),
    // Sem a 0109 a tabela não existe: o erro vira lista vazia e a IA gera como antes.
    supabase.from("marca_exemplos").select("tipo, origem, texto").eq("ativo", true).or(doPerfil).order("criado_em", { ascending: false }).limit(60),
  ]);
  const exemplos = ((exemplosRes.error ? [] : exemplosRes.data) ?? []) as { tipo: TipoExemplo; origem: OrigemExemplo; texto: string }[];
  const estiloDo = (tipo: TipoExemplo, instrucoes: string | null | undefined): EstiloDaLoja => ({
    instrucoes: instrucoes?.trim() || null,
    exemplos: exemplos.filter((e) => e.tipo === tipo).map((e) => ({ texto: e.texto, origem: e.origem })),
  });
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
    estilo: { titulo: estiloDo("titulo", perfil?.instrucoes_titulo), descricao: estiloDo("descricao", perfil?.instrucoes_descricao) },
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
  const gravar = async (base: EstadoRascunho, condicao: string | null) => {
    const novo = estadoRascunhoSchema.parse({ ...base, ...patch });
    const versao = new Date().toISOString();
    let q = supabase
      .from("anuncio_rascunhos")
      .update({ estado: novo, ...(extra.titulo !== undefined ? { titulo: extra.titulo } : {}), ...(extra.status ? { status: extra.status } : {}), atualizado_em: versao })
      .eq("id", rascunhoId);
    if (condicao) q = q.eq("atualizado_em", condicao);
    const { data, error } = await q.select("id");
    if (error) throw erro("Não foi possível salvar o rascunho.");
    return { estado: novo, versao, gravou: (data ?? []).length > 0 };
  };

  // Trava explícita (geração de capa): quem leu uma versão velha PARA, sem tentar de novo.
  if (extra.versao) {
    const r = await gravar(atual, extra.versao);
    if (!r.gravou) throw erro(ERRO_CONCORRENCIA);
    return { estado: r.estado, versao: r.versao };
  }

  // Sem trava: a mudança desta ação vai por cima do estado GRAVADO AGORA (relido), com UPDATE
  // condicional na versão relida; se outra gravação entrou no meio, relê e tenta de novo.
  // Antes o objeto inteiro carregado no começo da ação era regravado: duas ações ao mesmo
  // tempo (duas abas, ou mudar algo enquanto uma geração demorava) apagavam o que a outra fez.
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const { data: agora, error } = await supabase.from("anuncio_rascunhos").select("estado, atualizado_em").eq("id", rascunhoId).maybeSingle();
    // Sem conseguir reler (ex.: cliente de teste sem SELECT), cai na gravação simples de antes.
    if (error || !agora) {
      const r = await gravar(atual, null);
      return { estado: r.estado, versao: r.versao };
    }
    const r = await gravar(lerEstado(agora.estado), agora.atualizado_em as string);
    if (r.gravou) return { estado: r.estado, versao: r.versao };
  }
  throw erro(ERRO_CONCORRENCIA);
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
    // "*": `acoes_feitas` e `anexos` só existem depois da 0110.
    supabase.from("anuncio_rascunho_mensagens").select("*").eq("rascunho_id", r.id).order("criado_em", { ascending: true }).limit(60),
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
    mensagens: ((msgs ?? []) as Record<string, unknown>[]).map(lerMensagem),
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
    supabase.from("produto_lojas").select("loja_id, preco, preco_atualizado_em, precificacoes(taxa_adicional_pct)").eq("produto_id", produtoId).eq("loja_id", lojaId).maybeSingle(),
    supabase.from("perfil_negocio").select("aliquota_das").maybeSingle(),
  ]);
  // O perfil é de uma loja: sem conseguir ler o preço DELA, não usa outro no lugar.
  if (precoRes.error || !loja) {
    return {
      ...doCadastro,
      origem: "loja",
      lojaId,
      lojaRotulo: loja ? `${loja.canalNome} · ${loja.nome}` : "a loja do perfil",
      preco: null,
      erro: loja ? "Não consegui ler o preço desta loja agora. Recarregue a página; se continuar, avise o suporte." : "A loja ligada a este perfil não foi encontrada. Confira o perfil em Configurações.",
    };
  }
  const aliquota = Number(negocioRes.data?.aliquota_das ?? 6) / 100;
  const gravado = precoRes.data as unknown as { loja_id: string; preco: number | null; preco_atualizado_em: string | null; precificacoes: { taxa_adicional_pct: number | null } | null } | null;
  const [linha] = precosPorLoja(
    [loja],
    gravado ? [{ loja_id: gravado.loja_id, preco: gravado.preco, preco_atualizado_em: gravado.preco_atualizado_em, taxa_adicional_pct: gravado.precificacoes?.taxa_adicional_pct ?? null }] : [],
    Number(prod?.custo ?? 0),
    aliquota,
  );
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

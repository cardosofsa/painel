"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";
import {
  validar,
  abrirRascunhoSchema,
  acaoConversaSchema,
  conversaSchema,
  escolherTituloSchema,
  rascunhoIdSchema,
  titulosEstudioSchema,
  vereditoCapaSchema,
} from "@/lib/validacao";
import { z } from "zod";
import { conversarIA, gerarDescricaoEstudioIA, gerarTitulosEstudioIA, pesquisarConcorrentesIA } from "@/lib/ia/gerar";
import { avaliarDescricao, LIMITE_DESCRICAO_ESTUDIO, MINIMO_DESCRICAO, type AvaliacaoDescricao } from "@/lib/ia/prompts-descricao-estudio";
import { avaliarVariantes, type VarianteAvaliada } from "@/lib/ia/prompts-titulos";
import { gerarImagemGemini } from "@/lib/ia/imagem";
import { edicaoRelevante, type TipoExemplo } from "@/lib/ia/estilo-loja";
import { ErroIA } from "@/lib/ia/erro";
import { regrasDoPerfil, temBloqueio, termosParaEvitar, verificarTextos, type Violacao } from "@/lib/conformidade/termos";
import { montarPromptCapaCena, montarPromptCapaCompleta, type ContextoCapa } from "@/lib/marca/prompt-capa";
import {
  baixarImagemDaConta,
  capaEmGeracao,
  carregarContextoRascunho,
  caminhoDoUsuario,
  gravarEstado,
  gravarEstadoVersionado,
  lerEstadoAtual,
  lerMensagem,
  lerRascunhoAberto,
  precoDoAnuncio,
  sincronizarStatus,
  usuarioDaSessao,
  type ContextoRascunho,
  type RascunhoAberto,
} from "@/lib/estudio/servidor";
import { caminhoValido, HISTORICO_MENSAGENS, lerAcaoGuardada, lerAnexos, ROTULO_REFERENCIA, type AcaoProposta, type AnexoMensagem, type AnexoTexto, type ContextoAssistente, type MensagemHistorico } from "@/lib/ia/prompts-assistente";
import { ETAPAS, type EtapaId } from "@/lib/anuncio/etapas";
import { resumoDaFicha } from "@/lib/marca/prompt-capa";
import { mesclarFicha, normalizarFicha } from "@/lib/marca/ficha";
import { adicionarMemoriaMarca, salvarFichaMarca } from "../marca/actions";

export type { RascunhoAberto } from "@/lib/estudio/servidor";

const PATH = "/anuncio/infinito";
const SEM_MIGRACAO = "O estúdio precisa da migração 0099. Aplique no Supabase e recarregue.";
const faltaMigracao = (code?: string) => code === "PGRST205" || code === "42P01" || code === "PGRST202" || code === "42883";
const MAX_TENTATIVAS_CAPA = 6;
/** Teto do `estado.capas` (o schema aceita 12): geradas + enviadas. */
const MAX_CAPAS = 12;
const MAX_FOTO_BYTES = 5 * 1024 * 1024;
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];

function checar(erro: { message: string; code?: string } | null) {
  if (!erro) return;
  if (faltaMigracao(erro.code)) throw new Error(SEM_MIGRACAO);
  lancarErroSupabase(erro);
}

/** Abre o rascunho mais recente do produto (e do perfil) ou cria um novo. */
export async function abrirRascunho(entrada: unknown) {
  return comResultado(async (): Promise<RascunhoAberto> => {
    const v = validar(abrirRascunhoSchema, entrada);
    const supabase = await createClient();
    await usuarioDaSessao(supabase);

    let consulta = supabase.from("anuncio_rascunhos").select("id, titulo, descricao, status, estado").eq("produto_id", v.produto_id).order("atualizado_em", { ascending: false }).limit(1);
    consulta = v.perfil_id ? consulta.eq("perfil_id", v.perfil_id) : consulta.is("perfil_id", null);
    const { data: achados, error } = await consulta;
    checar(error);

    let id = achados?.[0]?.id as string | undefined;
    if (!id) {
      const { data, error: erroNovo } = await supabase.from("anuncio_rascunhos").insert({ produto_id: v.produto_id, perfil_id: v.perfil_id }).select("id").single();
      checar(erroNovo);
      id = data!.id as string;
    }
    const aberto = await lerRascunhoAberto(supabase, id);
    if (!aberto) throw new Error("Rascunho não encontrado.");
    return aberto;
  });
}

const produtoParaAnuncioSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao produto").max(120, "Nome longo demais"),
  custo: z.number().finite().min(0).max(1_000_000).nullable(),
  perfil_id: z.string().uuid().nullable(),
});

/** SKU provisório de um produto criado pelo Anúncio (dá para trocar depois no cadastro). */
function skuDoAnuncio(): string {
  return `ANUN-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
}

/**
 * Anúncio de um produto que ainda não está cadastrado: cria o produto com o mínimo (nome, custo
 * se souber, SKU provisório, estoque zero) e já abre o rascunho dele. Antes, sem produto
 * cadastrado não havia como começar. O resto (foto, medidas, estoque, preço por loja) se
 * completa depois no cadastro; a criação na Shopee confere o que faltar.
 */
export async function criarProdutoParaAnuncio(entrada: unknown) {
  return comResultado(async (): Promise<RascunhoAberto> => {
    const v = validar(produtoParaAnuncioSchema, entrada);
    const supabase = await createClient();
    await usuarioDaSessao(supabase);
    const { data: produto, error } = await supabase
      .from("produtos")
      .insert({ sku: skuDoAnuncio(), nome: v.nome, custo_base: v.custo ?? 0, preco_venda: 0, estoque: 0, estoque_minimo: 0, saida_media_semanal: 0, ativo: true })
      .select("id")
      .single();
    if (error) lancarErroSupabase(error);
    const { data: rascunho, error: erroRascunho } = await supabase.from("anuncio_rascunhos").insert({ produto_id: produto!.id, perfil_id: v.perfil_id }).select("id").single();
    checar(erroRascunho);
    const aberto = await lerRascunhoAberto(supabase, rascunho!.id as string);
    if (!aberto) throw new Error("Rascunho não encontrado.");
    revalidatePath("/produtos");
    revalidatePath(PATH);
    return aberto;
  });
}

/** Reabre um rascunho pelo id (link "Continuar", recarregar a página). */
export async function abrirRascunhoPorId(entrada: unknown) {
  return comResultado(async (): Promise<RascunhoAberto> => {
    const v = validar(rascunhoIdSchema, entrada);
    const supabase = await createClient();
    await usuarioDaSessao(supabase);
    const aberto = await lerRascunhoAberto(supabase, v.rascunho_id);
    if (!aberto) throw new Error("Rascunho não encontrado.");
    return aberto;
  });
}

/** Apaga o rascunho (e a conversa dele). Não mexe em item já criado na Shopee. */
export async function descartarRascunho(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(rascunhoIdSchema, entrada);
    const supabase = await createClient();
    await usuarioDaSessao(supabase);
    const { error } = await supabase.from("anuncio_rascunhos").delete().eq("id", v.rascunho_id);
    checar(error);
    revalidatePath(PATH);
    revalidatePath("/anuncio");
  });
}

/** "Publiquei manualmente": fecha a última etapa sem a API da Shopee. */
export async function marcarPublicado(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(rascunhoIdSchema, entrada);
    const supabase = await createClient();
    await usuarioDaSessao(supabase);
    const { error } = await supabase.from("anuncio_rascunhos").update({ status: "publicado", atualizado_em: new Date().toISOString() }).eq("id", v.rascunho_id);
    checar(error);
    revalidatePath("/anuncio");
  });
}

export async function definirNumeroImagens(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(rascunhoIdSchema.extend({ n: z.number().int().min(1).max(12) }), entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    if (ctx.plataforma.maxImagens && v.n > ctx.plataforma.maxImagens) throw new Error(`${ctx.plataforma.nome} aceita até ${ctx.plataforma.maxImagens} imagens por anúncio.`);
    return gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { numeroImagens: v.n });
  });
}

// ---------- Aprendizado (0109) ----------

/** Quantas edições de cada tipo o perfil guarda; as mais antigas saem. */
const EDICOES_GUARDADAS = 8;

/**
 * O texto que o vendedor corrigiu vira exemplo para as próximas gerações do perfil. É um
 * extra: se falhar (banco sem a 0109, por exemplo), o que ele salvou continua salvo e a tela
 * só não diz que aprendeu.
 */
async function aprenderComEdicao(supabase: Awaited<ReturnType<typeof createClient>>, ctx: ContextoRascunho, tipo: TipoExemplo, texto: string, antes: string | null): Promise<boolean> {
  try {
    const perfilId = ctx.perfil?.id ?? null;
    const { error } = await supabase.from("marca_exemplos").insert({ perfil_id: perfilId, tipo, origem: "edicao", texto: texto.slice(0, 5000), texto_ia: antes?.slice(0, 5000) ?? null });
    if (error) return false;
    let antigas = supabase.from("marca_exemplos").select("id").eq("tipo", tipo).eq("origem", "edicao").order("criado_em", { ascending: false }).range(EDICOES_GUARDADAS, EDICOES_GUARDADAS + 50);
    antigas = perfilId ? antigas.eq("perfil_id", perfilId) : antigas.is("perfil_id", null);
    const { data } = await antigas;
    const ids = (data ?? []).map((x) => x.id as string);
    if (ids.length) await supabase.from("marca_exemplos").delete().in("id", ids);
    return true;
  } catch {
    return false;
  }
}

// ---------- Títulos ----------

export interface TitulosDoEstudio {
  variantes: VarianteAvaliada[];
  palavrasChave: string[];
  usadas: number;
  limite: number;
  doCache: boolean;
}

export async function gerarTitulosEstudio(entrada: unknown) {
  return comResultado(async (): Promise<TitulosDoEstudio> => {
    const v = validar(titulosEstudioSchema, entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const limite = ctx.plataforma.limiteTitulo ?? 120;

    const g = await gerarTitulosEstudioIA(supabase, {
      produto: { nome: ctx.produto.nome, categoria: ctx.produto.categoria, variante: ctx.produto.variante, componentes: [] },
      plataforma: ctx.plataforma.nome,
      limite,
      nicho: ctx.perfil?.nicho ?? null,
      palavrasChave: ctx.produto.palavrasChave,
      memoria: ctx.memoria,
      termosProibidos: termosParaEvitar(ctx.perfil?.termos),
      concorrentes: (ctx.rascunho.estado.concorrentes ?? []).map((c) => ({ titulo: c.titulo, faixaPreco: c.precoTexto })),
      pedido: v.pedido,
      estilo: ctx.estilo.titulo,
    });
    if (!g.ok) throw new Error(g.erro);

    const regras = regrasDoPerfil(ctx.perfil?.termos);
    const principal = g.dado.titulos.palavrasChave[0] ?? ctx.produto.nome;
    const variantes = avaliarVariantes(g.dado.titulos.variantes, { limite, termoPrincipal: principal, regras });
    await gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { variantes: variantes.map((x) => ({ titulo: x.titulo, angulo: x.angulo })) });
    return { variantes, palavrasChave: g.dado.titulos.palavrasChave, usadas: g.dado.usadas, limite: g.dado.limite, doCache: g.dado.doCache };
  });
}

/** O título escolhido (ou digitado) passa pela mesma conferência antes de virar o do anúncio. */
export async function escolherTitulo(entrada: unknown) {
  return comResultado(async (): Promise<{ violacoes: Violacao[]; aprendeu: boolean }> => {
    const v = validar(escolherTituloSchema, entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const limite = ctx.plataforma.limiteTitulo ?? 120;
    if (v.titulo.length > limite) throw new Error(`O título passa de ${limite} caracteres (limite de ${ctx.plataforma.nome}).`);
    const violacoes = verificarTextos([{ campo: "Título", texto: v.titulo, tipo: "texto" }], regrasDoPerfil(ctx.perfil?.termos));
    if (temBloqueio(violacoes)) throw new Error(`Este título tem “${violacoes[0].trecho}” (${violacoes[0].motivo.toLowerCase()}). Ajuste e tente de novo.`);
    await gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, {}, { titulo: v.titulo });
    await sincronizarStatus(supabase, v.rascunho_id);
    // Título que não é nenhuma das sugestões da IA: o vendedor escreveu ou mexeu. Vira exemplo.
    const sugestoes = (ctx.rascunho.estado.variantes ?? []).map((x) => x.titulo);
    const editado = sugestoes.length > 0 && !sugestoes.some((t) => !edicaoRelevante(t, v.titulo));
    const aprendeu = editado ? await aprenderComEdicao(supabase, ctx, "titulo", v.titulo, null) : false;
    revalidatePath(PATH);
    return { violacoes, aprendeu };
  });
}

// ---------- Descrição ----------

export interface DescricaoDoEstudio {
  descricao: string;
  palavrasChave: string[];
  avaliacao: AvaliacaoDescricao;
  usadas: number;
  limite: number;
  doCache: boolean;
}

/** Gera, mas NÃO grava: o texto vai para a tela, o usuário edita e só então salva. */
export async function gerarDescricaoEstudio(entrada: unknown) {
  return comResultado(async (): Promise<DescricaoDoEstudio> => {
    const v = validar(titulosEstudioSchema, entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const limite = Math.min(ctx.plataforma.limiteDescricao ?? LIMITE_DESCRICAO_ESTUDIO, LIMITE_DESCRICAO_ESTUDIO);
    const g = await gerarDescricaoEstudioIA(supabase, {
      produto: { nome: ctx.produto.nome, variante: ctx.produto.variante, categoria: ctx.produto.categoria, componentes: [] },
      titulo: ctx.rascunho.titulo,
      plataforma: ctx.plataforma.nome,
      limite,
      nicho: ctx.perfil?.nicho ?? null,
      palavrasChave: ctx.produto.palavrasChave,
      memoria: ctx.memoria,
      termosProibidos: termosParaEvitar(ctx.perfil?.termos),
      diferenciaisConcorrentes: (ctx.rascunho.estado.concorrentes ?? []).flatMap((c) => c.diferenciais),
      pedido: v.pedido,
      estilo: ctx.estilo.descricao,
    });
    if (!g.ok) throw new Error(g.erro);
    const avaliacao = avaliarDescricao(g.dado.descricao.descricao, { limite, regras: regrasDoPerfil(ctx.perfil?.termos) });
    return { descricao: g.dado.descricao.descricao, palavrasChave: g.dado.descricao.palavrasChave, avaliacao, usadas: g.dado.usadas, limite: g.dado.limite, doCache: g.dado.doCache };
  });
}

/** Salva a descrição que o usuário aprovou, depois de conferir tamanho e termos no servidor. */
export async function salvarDescricao(entrada: unknown) {
  return comResultado(async (): Promise<{ avaliacao: AvaliacaoDescricao; aprendeu: boolean }> => {
    // `original`: o texto com que o editor abriu (o da IA ou o salvo antes). Se mudou, vira exemplo.
    const v = validar(rascunhoIdSchema.extend({ descricao: z.string().max(5000), original: z.string().max(5000).nullish() }), entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const limite = Math.min(ctx.plataforma.limiteDescricao ?? LIMITE_DESCRICAO_ESTUDIO, LIMITE_DESCRICAO_ESTUDIO);
    const avaliacao = avaliarDescricao(v.descricao, { limite, regras: regrasDoPerfil(ctx.perfil?.termos) });
    if (avaliacao.curta) throw new Error("A descrição está curta demais: escreva pelo menos 100 caracteres.");
    if (avaliacao.longa) throw new Error(`A descrição passa de ${limite} caracteres.`);
    const barrado = avaliacao.violacoes.find((x) => x.gravidade === "bloquear");
    if (barrado) throw new Error(`A descrição tem “${barrado.trecho}” (${barrado.motivo.toLowerCase()}). Ajuste e tente de novo.`);
    const { error } = await supabase.from("anuncio_rascunhos").update({ descricao: v.descricao.trim(), atualizado_em: new Date().toISOString() }).eq("id", v.rascunho_id);
    checar(error);
    await sincronizarStatus(supabase, v.rascunho_id);
    const aprendeu = v.original !== undefined && edicaoRelevante(v.original, v.descricao, MINIMO_DESCRICAO) ? await aprenderComEdicao(supabase, ctx, "descricao", v.descricao.trim(), v.original ?? null) : false;
    return { avaliacao, aprendeu };
  });
}

// ---------- Concorrentes ----------

export async function pesquisarConcorrentesEstudio(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(rascunhoIdSchema, entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const g = await pesquisarConcorrentesIA(supabase, { produtoNome: [ctx.produto.nome, ctx.produto.variante].filter(Boolean).join(" "), plataforma: ctx.plataforma.nome, nicho: ctx.perfil?.nicho ?? null });
    if (!g.ok) throw new Error(g.erro);
    await gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { concorrentes: g.dado.pesquisa.concorrentes });
    return g.dado;
  });
}

// ---------- Capa ----------

function contextoDaCapa(ctx: ContextoRascunho, titulo: string, textoFaixa: string | null): ContextoCapa {
  return {
    produtoNome: ctx.produto.nome,
    variante: ctx.produto.variante,
    titulo,
    ficha: ctx.fichaCapa1,
    memoria: ctx.memoria,
    capaFundoBranco: ctx.plataforma.capaFundoBranco,
    temFotoReferencia: !!ctx.produto.imagemUrl,
    textoFaixa,
  };
}

/** Os textos que a capa vai mostrar passam pela conferência ANTES de gastar com a imagem. */
function conferirTextosDaCapa(ctx: ContextoRascunho, titulo: string, textoFaixa: string | null) {
  const itens = [
    { campo: "Título da capa", texto: titulo, tipo: "imagem" as const },
    ...(ctx.fichaCapa1.selos ?? []).map((s) => ({ campo: "Selo", texto: s, tipo: "imagem" as const })),
    ...(textoFaixa ? [{ campo: "Faixa", texto: textoFaixa, tipo: "imagem" as const }] : []),
  ];
  return verificarTextos(itens, regrasDoPerfil(ctx.perfil?.termos));
}

/** Modo A: o prompt, sem IA e sem custo. */
export async function promptDaCapa(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(rascunhoIdSchema.extend({ textoFaixa: z.string().trim().max(60).nullable() }), entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const titulo = ctx.rascunho.titulo;
    if (!titulo) throw new Error("Escolha o título primeiro: a capa leva o título aprovado.");
    const violacoes = conferirTextosDaCapa(ctx, titulo, v.textoFaixa);
    const c = contextoDaCapa(ctx, titulo, v.textoFaixa);
    return { cena: montarPromptCapaCena(c), completo: montarPromptCapaCompleta(c), violacoes };
  });
}

export interface CenaGerada {
  indice: number;
  cenaPath: string;
  url: string;
  usadas: number;
  limite: number | null;
  tentativas: number;
}

/**
 * Modo B: gera SÓ a cena (sem texto), reservando a vaga no banco antes de chamar a IA. Regras
 * de custo no servidor: o título precisa estar aprovado, os textos da capa sem bloqueio, a
 * capa anterior precisa ter veredito (uma de cada vez) e há um teto de tentativas por rascunho.
 * Erro no meio devolve a vaga.
 */
export async function gerarCenaCapa(entrada: unknown) {
  return comResultado(async (): Promise<CenaGerada> => {
    const v = validar(rascunhoIdSchema.extend({ textoFaixa: z.string().trim().max(60).nullable() }), entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const titulo = ctx.rascunho.titulo;
    if (!titulo) throw new Error("Escolha o título primeiro: a capa leva o título aprovado.");

    const capas = ctx.rascunho.estado.capas ?? [];
    if (capas.length >= MAX_CAPAS) throw new Error(`O anúncio já tem ${MAX_CAPAS} imagens. Remova uma antes de gerar outra.`);
    if (capas.filter((c) => !c.propria).length >= MAX_TENTATIVAS_CAPA) throw new Error(`Você já gerou ${MAX_TENTATIVAS_CAPA} capas neste rascunho. Ajuste a ficha ou o pedido antes de gerar outra.`);
    if (capas.length > 0 && !capas[capas.length - 1].veredito) throw new Error("Dê um veredito à capa anterior (aprovar, ajustar ou rejeitar) antes de gerar outra: assim a ficha melhora e você não gasta à toa.");

    const violacoes = conferirTextosDaCapa(ctx, titulo, v.textoFaixa);
    if (temBloqueio(violacoes)) throw new Error(`Há texto que as plataformas costumam barrar na capa: “${violacoes[0].trecho}”. Corrija antes de gerar.`);

    // Trava ANTES de gastar: duas requisições ao mesmo tempo (clique duplo, duas abas) liam o
    // mesmo estado, passavam nas regras acima e gastavam duas imagens. A trava é gravada só se
    // ninguém gravou desde a leitura (`versao`); a que perde a corrida para aqui, sem custo.
    if (capaEmGeracao(ctx.rascunho.estado)) throw new Error("Já tem uma capa sendo gerada para este anúncio. Espere ela terminar.");
    await gravarEstadoVersionado(supabase, v.rascunho_id, ctx.rascunho.estado, { capaEmGeracao: new Date().toISOString() }, { versao: ctx.rascunho.atualizadoEm });
    const soltarTrava = async () => {
      try {
        await gravarEstado(supabase, v.rascunho_id, await lerEstadoAtual(supabase, v.rascunho_id), { capaEmGeracao: undefined });
      } catch {
        // A trava expira sozinha em 3 minutos.
      }
    };

    // A foto de referência só pode vir do Storage da PRÓPRIA conta.
    let foto: { base64: string; mime: string } | null = null;
    const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produtos/${ctx.userId}/`;
    if (ctx.produto.imagemUrl && process.env.NEXT_PUBLIC_SUPABASE_URL && ctx.produto.imagemUrl.startsWith(base)) {
      const r = await fetch(ctx.produto.imagemUrl, { cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => null);
      const mime = (r?.headers.get("content-type") ?? "").split(";")[0].trim();
      if (r?.ok && TIPOS_FOTO.includes(mime)) {
        const bytes = Buffer.from(await r.arrayBuffer());
        if (bytes.length <= MAX_FOTO_BYTES) foto = { base64: bytes.toString("base64"), mime };
      }
    }

    const prompt = montarPromptCapaCena({ ...contextoDaCapa(ctx, titulo, v.textoFaixa), temFotoReferencia: !!foto });
    const { data: reserva, error: erroReserva } = await supabase.rpc("ia_reservar_imagem", { p_tipo: "livre", p_produto_id: ctx.produto.id }).maybeSingle<{ id: string; usadas: number; limite: number | null }>();
    if (erroReserva || !reserva) await soltarTrava();
    if (erroReserva && faltaMigracao(erroReserva.code)) throw new Error("As imagens com IA precisam da migração 0072.");
    if (erroReserva) lancarErroSupabase(erroReserva);
    if (!reserva) throw new Error("Não foi possível reservar a geração. Tente de novo.");

    let caminho: string | null = null;
    try {
      const img = await gerarImagemGemini(prompt, foto);
      const ext = img.mime.includes("jpeg") ? "jpg" : img.mime.includes("webp") ? "webp" : "png";
      caminho = `${ctx.userId}/estudio-cena-${Date.now()}.${ext}`;
      const { error: erroUpload } = await supabase.storage.from("produtos").upload(caminho, Buffer.from(img.base64, "base64"), { contentType: img.mime, upsert: false });
      if (erroUpload) throw new Error("Não consegui guardar a imagem gerada. Tente de novo.");
      const { data: ok, error: erroConcluir } = await supabase.rpc("ia_concluir_imagem", { p_id: reserva.id, p_caminho: caminho });
      if (erroConcluir || !ok) throw new Error("A geração foi cancelada. Tente de novo.");

      // Relê antes de juntar: a geração demora e o título ou a conversa podem ter mudado no meio.
      const agora = await lerEstadoAtual(supabase, v.rascunho_id);
      const novas = [...(agora.capas ?? []), { cenaPath: caminho, titulo, criadoEm: new Date().toISOString() }];
      await gravarEstado(supabase, v.rascunho_id, agora, { capas: novas, capaEmGeracao: undefined, ...(v.textoFaixa ? { textoFaixa: v.textoFaixa } : {}) });
      const { data } = supabase.storage.from("produtos").getPublicUrl(caminho);
      return { indice: novas.length - 1, cenaPath: caminho, url: data.publicUrl, usadas: reserva.usadas, limite: reserva.limite, tentativas: novas.length };
    } catch (e) {
      await supabase.rpc("ia_cancelar_imagem", { p_id: reserva.id });
      if (caminho) await supabase.storage.from("produtos").remove([caminho]);
      await soltarTrava();
      if (e instanceof ErroIA && e.codigo === "sem_chave") throw new Error("As imagens com IA ainda não estão ligadas neste sistema (falta a chave do Gemini).");
      throw e;
    }
  });
}

export async function vereditoCapa(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(vereditoCapaSchema, entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const capas = [...(ctx.rascunho.estado.capas ?? [])];
    if (!capas[v.indice]) throw new Error("Capa não encontrada.");
    capas[v.indice] = { ...capas[v.indice], veredito: v.veredito, ...(v.motivo ? { motivo: v.motivo } : {}) };
    const estado = await gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { capas });
    await sincronizarStatus(supabase, v.rascunho_id);
    return estado;
  });
}

/** Guarda a capa final (cena + texto desenhado no navegador) depois do upload feito pela tela. */
export async function registrarCapaFinal(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(rascunhoIdSchema.extend({ indice: z.number().int().min(0).max(11), finalPath: z.string().trim().min(1).max(300) }), entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    if (!caminhoDoUsuario(ctx.userId, v.finalPath)) throw new Error("Envie a imagem por esta tela (só arquivos da sua conta).");
    const capas = [...(ctx.rascunho.estado.capas ?? [])];
    if (!capas[v.indice]) throw new Error("Capa não encontrada.");
    capas[v.indice] = { ...capas[v.indice], finalPath: v.finalPath };
    return gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { capas });
  });
}

/**
 * Imagem feita fora do Painel (outro gerador, foto, arte pronta), enviada pela tela. Entra já
 * aprovada e como final: o texto, se houver, já está nela. Não gasta cota nem conta no teto de
 * gerações com IA.
 */
export async function adicionarCapaPropria(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(rascunhoIdSchema.extend({ path: z.string().trim().min(1).max(300) }), entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    if (!caminhoDoUsuario(ctx.userId, v.path)) throw new Error("Envie a imagem por esta tela (só arquivos da sua conta).");
    const capas = ctx.rascunho.estado.capas ?? [];
    if (capas.length >= MAX_CAPAS) throw new Error(`O anúncio já tem ${MAX_CAPAS} imagens.`);
    const nova = { cenaPath: v.path, finalPath: v.path, titulo: ctx.rascunho.titulo ?? "", veredito: "aprovada" as const, criadoEm: new Date().toISOString(), propria: true };
    const estado = await gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { capas: [...capas, nova] });
    await sincronizarStatus(supabase, v.rascunho_id);
    return estado;
  });
}

/**
 * Tira do anúncio uma imagem enviada pelo usuário (não apaga o arquivo). As geradas com IA ficam:
 * elas contam no teto de tentativas, e removê-las abriria vaga para gerar além dele.
 */
export async function removerCapaPropria(entrada: unknown) {
  return comResultado(async () => {
    const v = validar(rascunhoIdSchema.extend({ indice: z.number().int().min(0).max(11) }), entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const capas = [...(ctx.rascunho.estado.capas ?? [])];
    if (!capas[v.indice]?.propria) throw new Error("Imagem não encontrada.");
    capas.splice(v.indice, 1);
    const estado = await gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { capas });
    await sincronizarStatus(supabase, v.rascunho_id);
    return estado;
  });
}

// ---------- Conversa ----------

export interface TurnoDaConversa {
  resposta: string;
  acoes: AcaoProposta[];
  usadas: number;
  limite: number;
  doCache: boolean;
}

const ROTULO_ETAPA: Record<EtapaId, string> = Object.fromEntries(ETAPAS.map((e) => [e.id, e.rotulo])) as Record<EtapaId, string>;

/** Tudo o que a IA do chat sabe do anúncio aberto, lido do banco (a tela manda só ids e o que foi digitado). */
async function contextoDaConversa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ctx: ContextoRascunho,
  extra: { etapa: EtapaId | null; descricaoPendente: boolean; historico: MensagemHistorico[]; mensagem: string; referencia: AnexoTexto | null; imagens: string[]; imagemHash: string | null },
): Promise<ContextoAssistente> {
  const e = ctx.rascunho.estado;
  const preco = await precoDoAnuncio(supabase, ctx.produto.id, ctx.perfil?.id ?? null).catch(() => null);
  return {
    produtoNome: [ctx.produto.nome, ctx.produto.variante].filter(Boolean).join(" "),
    plataforma: ctx.plataforma.nome,
    maxImagens: ctx.plataforma.maxImagens,
    perfilNome: ctx.perfil?.nome ?? null,
    etapa: extra.etapa ? ROTULO_ETAPA[extra.etapa] : null,
    estado: {
      titulo: ctx.rascunho.titulo,
      titulosSugeridos: (e.variantes ?? []).map((x) => x.titulo),
      numeroImagens: e.numeroImagens ?? null,
      descricaoSalva: ctx.rascunho.descricao,
      descricaoPendente: extra.descricaoPendente,
      capas: (e.capas ?? []).map((c) => ({ veredito: c.veredito ?? null, motivo: c.motivo ?? null, propria: !!c.propria })),
      fichaCapa1: Object.keys(ctx.fichaCapa1).length ? resumoDaFicha(ctx.fichaCapa1) : null,
      concorrentes: (e.concorrentes ?? []).map((c) => c.titulo),
      preco: preco?.preco != null ? { valor: preco.preco, margemPct: preco.margemPct, lucro: preco.lucro, onde: preco.lojaRotulo } : null,
    },
    direcao: {
      instrucoesTitulo: ctx.estilo.titulo.instrucoes,
      instrucoesDescricao: ctx.estilo.descricao.instrucoes,
      exemplosTitulo: ctx.estilo.titulo.exemplos.length,
      exemplosDescricao: ctx.estilo.descricao.exemplos.length,
    },
    memoria: ctx.memoria,
    historico: extra.historico,
    mensagem: extra.mensagem,
    referencia: extra.referencia,
    imagens: extra.imagens,
    imagemHash: extra.imagemHash,
  };
}

const SEM_0110 = "Mandar referência ou imagem no chat precisa da migração 0110. Aplique no Supabase e recarregue.";
const MAX_REFERENCIAS_PERFIL = 8;
const faltaColuna = (code?: string) => code === "PGRST204" || code === "42703";

export async function conversar(entrada: unknown) {
  return comResultado(async (): Promise<TurnoDaConversa> => {
    const v = validar(conversaSchema, entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const referencia: AnexoTexto | null = v.referencia ? { tipo: "texto", qual: v.referencia.qual, deOutraLoja: v.referencia.de_outra_loja, texto: v.referencia.texto } : null;
    const imagens = v.imagens ?? [];
    for (const p of [...imagens, ...(v.montagem ? [v.montagem] : [])]) {
      if (!caminhoDoUsuario(ctx.userId, p) || !caminhoValido(p)) throw new Error("Envie as imagens por esta tela (só arquivos da sua conta).");
    }
    const anexos: AnexoMensagem[] = [...(referencia ? [referencia] : []), ...imagens.map((path) => ({ tipo: "imagem" as const, path }))];
    // Sem a 0110 não há onde guardar o anexo: avisa ANTES de gastar a geração.
    if (anexos.length) {
      const { error: semColuna } = await supabase.from("anuncio_rascunho_mensagens").select("anexos").limit(0);
      if (semColuna && faltaColuna(semColuna.code)) throw new Error(SEM_0110);
    }
    const mensagem =
      v.mensagem ||
      (referencia ? `Colei uma referência (${ROTULO_REFERENCIA[referencia.qual]}${referencia.deOutraLoja ? " de outra loja" : ""}).` : `Mandei ${imagens.length} ${imagens.length === 1 ? "imagem" : "imagens"}.`);
    // Uma chamada leva uma imagem: com várias, a montagem que a tela juntou.
    const alvo = imagens.length > 1 ? v.montagem! : imagens[0];
    const imagem = alvo ? await baixarImagemDaConta(ctx.userId, alvo) : null;

    // "*": `anexos` só existe depois da 0110.
    const { data: anteriores } = await supabase.from("anuncio_rascunho_mensagens").select("*").eq("rascunho_id", v.rascunho_id).order("criado_em", { ascending: false }).limit(HISTORICO_MENSAGENS);
    const historico: MensagemHistorico[] = ((anteriores ?? []) as Record<string, unknown>[]).reverse().map((m) => ({ papel: m.papel === "ia" ? "ia" : "usuario", texto: String(m.texto ?? ""), anexos: lerAnexos(m.anexos) }));

    const g = await conversarIA(
      supabase,
      await contextoDaConversa(supabase, ctx, { etapa: v.etapa ?? null, descricaoPendente: !!v.descricao_pendente, historico, mensagem, referencia, imagens, imagemHash: imagem?.hash ?? null }),
      imagem ? { base64: imagem.base64, mime: imagem.mime } : undefined,
    );
    if (!g.ok) throw new Error(g.erro);

    // Só depois de a IA responder: mensagem e resposta entram juntas no histórico.
    const { error } = await supabase.from("anuncio_rascunho_mensagens").insert([
      { rascunho_id: v.rascunho_id, papel: "usuario", texto: mensagem, acoes: [], ...(anexos.length ? { anexos } : {}) },
      { rascunho_id: v.rascunho_id, papel: "ia", texto: g.dado.conversa.resposta || "Certo.", acoes: g.dado.conversa.acoes },
    ]);
    checar(error);
    return { resposta: g.dado.conversa.resposta, acoes: g.dado.conversa.acoes, usadas: g.dado.usadas, limite: g.dado.limite, doCache: g.dado.doCache };
  });
}

/** A ação `indice` da mensagem, lida do banco, e as já feitas (`null` = banco sem a 0110). */
async function lerAcaoDaMensagem(supabase: Awaited<ReturnType<typeof createClient>>, rascunhoId: string, mensagemId: string, indice: number) {
  const { data, error } = await supabase.from("anuncio_rascunho_mensagens").select("*").eq("id", mensagemId).eq("rascunho_id", rascunhoId).eq("papel", "ia").maybeSingle();
  checar(error);
  if (!data) throw new Error("Mensagem não encontrada.");
  const linha = data as Record<string, unknown>;
  const acao = lerAcaoGuardada(Array.isArray(linha.acoes) ? linha.acoes[indice] : null);
  if (!acao) throw new Error("Essa sugestão não está mais disponível.");
  const feitas = "acoes_feitas" in linha ? lerMensagem(linha).acoesFeitas : null;
  if (feitas?.includes(indice)) throw new Error("Essa sugestão já foi aplicada.");
  return { acao, feitas };
}

/** Grava a ação como feita. Sem a 0110 não há onde gravar: devolve `false` e a tela marca só na memória. */
async function gravarFeita(supabase: Awaited<ReturnType<typeof createClient>>, mensagemId: string, feitas: number[] | null, indice: number): Promise<boolean> {
  if (feitas === null) return false;
  const { error } = await supabase.from("anuncio_rascunho_mensagens").update({ acoes_feitas: [...new Set([...feitas, indice])].sort() }).eq("id", mensagemId);
  return !error;
}

/**
 * Marca como feita uma ação que a TELA executa (gerar títulos ou descrição, ir para a capa,
 * pesquisar concorrentes): a geração em si passa pelas mesmas actions dos botões.
 */
export async function marcarAcaoFeita(entrada: unknown) {
  return comResultado(async (): Promise<boolean> => {
    const v = validar(acaoConversaSchema, entrada);
    const supabase = await createClient();
    await usuarioDaSessao(supabase);
    const { feitas } = await lerAcaoDaMensagem(supabase, v.rascunho_id, v.mensagem_id, v.indice);
    return gravarFeita(supabase, v.mensagem_id, feitas, v.indice);
  });
}

/** Desembrulha o `Resultado` de outra action chamada daqui (o erro sobe com a mensagem dela). */
function exigir<T>(r: { ok: true; dado: T } | { ok: false; erro: string }): T {
  if (!r.ok) throw new Error(r.erro);
  return r.dado;
}

/**
 * Aplica uma ação que GRAVA (memória, ficha, número de imagens…) e a marca como feita. A ação é
 * lida do banco, na mensagem da IA: o navegador manda só o id e o índice, então não dá para
 * aplicar algo que a IA não propôs. Cada tipo passa pela mesma action (e as mesmas checagens)
 * do botão equivalente na tela.
 */
export async function aplicarAcaoConversa(entrada: unknown) {
  return comResultado(async (): Promise<{ mensagem: string; marcada: boolean }> => {
    const v = validar(acaoConversaSchema, entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const { acao, feitas } = await lerAcaoDaMensagem(supabase, v.rascunho_id, v.mensagem_id, v.indice);
    const perfilId = ctx.perfil?.id ?? null;
    const precisaPerfil = () => {
      if (!perfilId) throw new Error("Este anúncio está sem perfil. Escolha ou crie um perfil de loja em Configurações para guardar isso nele.");
      return perfilId;
    };

    let mensagem: string;
    switch (acao.tipo) {
      case "definir_numero_imagens": {
        if (ctx.plataforma.maxImagens && acao.n > ctx.plataforma.maxImagens) throw new Error(`${ctx.plataforma.nome} aceita até ${ctx.plataforma.maxImagens} imagens por anúncio.`);
        await gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { numeroImagens: acao.n });
        mensagem = `Combinado: ${acao.n} ${acao.n === 1 ? "imagem" : "imagens"}`;
        break;
      }
      case "guardar_memoria":
        exigir(await adicionarMemoriaMarca({ perfil_id: perfilId, tipo: acao.memoria.tipo, texto: acao.memoria.texto, origem: "ia" }));
        mensagem = "Guardado na memória";
        break;
      case "ajustar_ficha": {
        const perfil = precisaPerfil();
        const { data: ativa } = await supabase.from("marca_fichas").select("dados").eq("perfil_id", perfil).eq("tipo_imagem", acao.tipoImagem).eq("ativa", true).maybeSingle();
        const dados = mesclarFicha(normalizarFicha(ativa?.dados), acao.campos);
        exigir(await salvarFichaMarca({ perfil_id: perfil, tipo_imagem: acao.tipoImagem, dados, origem: "ajuste_ia", nota: "Ajuste proposto na conversa" }));
        mensagem = "Ficha atualizada (nova versão; dá para voltar na aba Ficha de arte)";
        break;
      }
      case "guardar_exemplo": {
        const { error } = await supabase.from("marca_exemplos").insert({ perfil_id: perfilId, tipo: acao.tipoExemplo, origem: "referencia", texto: acao.texto });
        if (error && (error.code === "23514" || faltaMigracao(error.code))) throw new Error("Guardar exemplo pelo chat precisa das migrações 0109 e 0110. Aplique no Supabase e recarregue.");
        checar(error);
        mensagem = `Guardado como exemplo de ${acao.tipoExemplo === "titulo" ? "título" : "descrição"}${perfilId ? " deste perfil" : " (vale para a conta toda)"}. Dá para pausar ou apagar na aba Direção da IA.`;
        break;
      }
      case "guardar_referencia_imagem": {
        const perfil = precisaPerfil();
        if (!caminhoDoUsuario(ctx.userId, acao.path)) throw new Error("Imagem fora da sua conta.");
        const { data: linha, error } = await supabase.from("perfis_marca").select("referencias").eq("id", perfil).maybeSingle();
        checar(error);
        const atuais = ((linha?.referencias as string[] | null) ?? []).filter(Boolean);
        if (atuais.includes(acao.path)) throw new Error("Essa imagem já está nas referências do perfil.");
        let novas = [...atuais, acao.path];
        if (atuais.length >= MAX_REFERENCIAS_PERFIL) {
          if (!v.substituir || !atuais.includes(v.substituir)) throw new Error(`O perfil já tem ${MAX_REFERENCIAS_PERFIL} referências. Escolha qual sai para esta entrar.`);
          novas = [...atuais.filter((r) => r !== v.substituir), acao.path];
        }
        const { error: erroGravar } = await supabase.from("perfis_marca").update({ referencias: novas, atualizado_em: new Date().toISOString() }).eq("id", perfil);
        checar(erroGravar);
        mensagem = `Imagem guardada nas referências do perfil (${novas.length} de ${MAX_REFERENCIAS_PERFIL}). Use "Aprender das capas" para atualizar a ficha.`;
        break;
      }
      case "usar_imagem_no_anuncio":
        // Mesma ação do "Enviar minha imagem" da Capa: aprovada, sem cota, conta no teto de 12.
        exigir(await adicionarCapaPropria({ rascunho_id: v.rascunho_id, path: acao.path }));
        mensagem = "Imagem adicionada ao anúncio (na etapa Capa, como enviada por você).";
        break;
      default:
        throw new Error("Essa sugestão roda na tela do anúncio.");
    }
    const marcada = await gravarFeita(supabase, v.mensagem_id, feitas, v.indice);
    revalidatePath(PATH);
    return { mensagem, marcada };
  });
}

"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { comResultado } from "@/lib/acao";
import { lancarErroSupabase } from "@/lib/erros";
import {
  validar,
  abrirRascunhoSchema,
  conversaSchema,
  escolherTituloSchema,
  rascunhoIdSchema,
  titulosEstudioSchema,
  vereditoCapaSchema,
  type EstadoRascunho,
} from "@/lib/validacao";
import { z } from "zod";
import { conversarIA, gerarDescricaoEstudioIA, gerarTitulosEstudioIA, pesquisarConcorrentesIA } from "@/lib/ia/gerar";
import { avaliarDescricao, LIMITE_DESCRICAO_ESTUDIO, type AvaliacaoDescricao } from "@/lib/ia/prompts-descricao-estudio";
import { avaliarVariantes, type VarianteAvaliada } from "@/lib/ia/prompts-titulos";
import { gerarImagemGemini } from "@/lib/ia/imagem";
import { ErroIA } from "@/lib/ia/erro";
import { regrasAtivas, temBloqueio, verificarTextos, type Violacao } from "@/lib/conformidade/termos";
import { montarPromptCapaCena, montarPromptCapaCompleta, type ContextoCapa } from "@/lib/marca/prompt-capa";
import { carregarContextoRascunho, caminhoDoUsuario, gravarEstado, lerEstado, usuarioDaSessao, type ContextoRascunho } from "@/lib/estudio/servidor";
import type { MensagemHistorico, AcaoProposta } from "@/lib/ia/prompts-assistente";

const PATH = "/anuncio/infinito";
const SEM_MIGRACAO = "O estúdio precisa da migração 0099. Aplique no Supabase e recarregue.";
const faltaMigracao = (code?: string) => code === "PGRST205" || code === "42P01" || code === "PGRST202" || code === "42883";
const MAX_TENTATIVAS_CAPA = 6;
const MAX_FOTO_BYTES = 5 * 1024 * 1024;
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];

function checar(erro: { message: string; code?: string } | null) {
  if (!erro) return;
  if (faltaMigracao(erro.code)) throw new Error(SEM_MIGRACAO);
  lancarErroSupabase(erro);
}

export interface RascunhoAberto {
  id: string;
  titulo: string | null;
  descricao: string | null;
  /** Dados do produto que a tela precisa (preço, palavras-chave, foto). */
  produto: { nome: string; precoVenda: number | null; palavrasChave: string[]; imagemUrl: string | null; pesoG: number | null; temMedidas: boolean };
  status: string;
  estado: EstadoRascunho;
  mensagens: { id: string; papel: "usuario" | "ia"; texto: string; acoes: AcaoProposta[]; criado_em: string }[];
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

    let r = achados?.[0];
    if (!r) {
      const { data, error: erroNovo } = await supabase.from("anuncio_rascunhos").insert({ produto_id: v.produto_id, perfil_id: v.perfil_id }).select("id, titulo, descricao, status, estado").single();
      checar(erroNovo);
      r = data!;
    }
    const { data: p } = await supabase.from("produtos").select("nome, preco_venda, palavras_chave, imagem_url, peso_g, altura_cm, largura_cm, comprimento_cm").eq("id", v.produto_id).maybeSingle();
    const { data: msgs } = await supabase.from("anuncio_rascunho_mensagens").select("id, papel, texto, acoes, criado_em").eq("rascunho_id", r.id).order("criado_em", { ascending: true }).limit(60);
    return {
      id: r.id,
      titulo: r.titulo ?? null,
      descricao: r.descricao ?? null,
      produto: { nome: (p?.nome as string | undefined) ?? "", precoVenda: p?.preco_venda != null ? Number(p.preco_venda) : null, palavrasChave: (p?.palavras_chave as string[] | null) ?? [], imagemUrl: (p?.imagem_url as string | null) ?? null, pesoG: p?.peso_g != null ? Number(p.peso_g) : null, temMedidas: !!(p?.altura_cm && p?.largura_cm && p?.comprimento_cm) },
      status: r.status,
      estado: lerEstado(r.estado),
      mensagens: ((msgs ?? []) as RascunhoAberto["mensagens"]).map((m) => ({ ...m, acoes: Array.isArray(m.acoes) ? m.acoes : [] })),
    };
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
      termosProibidos: ctx.perfil?.termosProibidos ?? [],
      concorrentes: (ctx.rascunho.estado.concorrentes ?? []).map((c) => ({ titulo: c.titulo, faixaPreco: c.precoTexto })),
      pedido: v.pedido,
    });
    if (!g.ok) throw new Error(g.erro);

    const regras = regrasAtivas([], ctx.perfil?.termosProibidos ?? []);
    const principal = g.dado.titulos.palavrasChave[0] ?? ctx.produto.nome;
    const variantes = avaliarVariantes(g.dado.titulos.variantes, { limite, termoPrincipal: principal, regras });
    await gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { variantes: variantes.map((x) => ({ titulo: x.titulo, angulo: x.angulo })) });
    return { variantes, palavrasChave: g.dado.titulos.palavrasChave, usadas: g.dado.usadas, limite: g.dado.limite, doCache: g.dado.doCache };
  });
}

/** O título escolhido (ou digitado) passa pela mesma conferência antes de virar o do anúncio. */
export async function escolherTitulo(entrada: unknown) {
  return comResultado(async (): Promise<{ violacoes: Violacao[] }> => {
    const v = validar(escolherTituloSchema, entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const limite = ctx.plataforma.limiteTitulo ?? 120;
    if (v.titulo.length > limite) throw new Error(`O título passa de ${limite} caracteres (limite de ${ctx.plataforma.nome}).`);
    const violacoes = verificarTextos([{ campo: "Título", texto: v.titulo, tipo: "texto" }], regrasAtivas([], ctx.perfil?.termosProibidos ?? []));
    if (temBloqueio(violacoes)) throw new Error(`Este título tem algo que as plataformas costumam barrar: “${violacoes[0].trecho}”. Ajuste e tente de novo.`);
    await gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, {}, { titulo: v.titulo });
    revalidatePath(PATH);
    return { violacoes };
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
    const termos = ctx.perfil?.termosProibidos ?? [];
    const g = await gerarDescricaoEstudioIA(supabase, {
      produto: { nome: ctx.produto.nome, variante: ctx.produto.variante, categoria: ctx.produto.categoria, componentes: [] },
      titulo: ctx.rascunho.titulo,
      plataforma: ctx.plataforma.nome,
      limite,
      nicho: ctx.perfil?.nicho ?? null,
      palavrasChave: ctx.produto.palavrasChave,
      memoria: ctx.memoria,
      termosProibidos: termos,
      diferenciaisConcorrentes: (ctx.rascunho.estado.concorrentes ?? []).flatMap((c) => c.diferenciais),
      pedido: v.pedido,
    });
    if (!g.ok) throw new Error(g.erro);
    const avaliacao = avaliarDescricao(g.dado.descricao.descricao, { limite, regras: regrasAtivas([], termos) });
    return { descricao: g.dado.descricao.descricao, palavrasChave: g.dado.descricao.palavrasChave, avaliacao, usadas: g.dado.usadas, limite: g.dado.limite, doCache: g.dado.doCache };
  });
}

/** Salva a descrição que o usuário aprovou, depois de conferir tamanho e termos no servidor. */
export async function salvarDescricao(entrada: unknown) {
  return comResultado(async (): Promise<{ avaliacao: AvaliacaoDescricao }> => {
    const v = validar(rascunhoIdSchema.extend({ descricao: z.string().max(5000) }), entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);
    const limite = Math.min(ctx.plataforma.limiteDescricao ?? LIMITE_DESCRICAO_ESTUDIO, LIMITE_DESCRICAO_ESTUDIO);
    const avaliacao = avaliarDescricao(v.descricao, { limite, regras: regrasAtivas([], ctx.perfil?.termosProibidos ?? []) });
    if (avaliacao.curta) throw new Error("A descrição está curta demais: escreva pelo menos 100 caracteres.");
    if (avaliacao.longa) throw new Error(`A descrição passa de ${limite} caracteres.`);
    if (avaliacao.violacoes.some((x) => x.gravidade === "bloquear")) throw new Error(`Há algo que as plataformas costumam barrar na descrição: “${avaliacao.violacoes[0].trecho}”. Ajuste e tente de novo.`);
    const { error } = await supabase.from("anuncio_rascunhos").update({ descricao: v.descricao.trim(), atualizado_em: new Date().toISOString() }).eq("id", v.rascunho_id);
    checar(error);
    return { avaliacao };
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
  return verificarTextos(itens, regrasAtivas([], ctx.perfil?.termosProibidos ?? []));
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
    if (capas.length >= MAX_TENTATIVAS_CAPA) throw new Error(`Você já gerou ${MAX_TENTATIVAS_CAPA} capas neste rascunho. Ajuste a ficha ou o pedido antes de gerar outra.`);
    if (capas.length > 0 && !capas[capas.length - 1].veredito) throw new Error("Dê um veredito à capa anterior (aprovar, ajustar ou rejeitar) antes de gerar outra: assim a ficha melhora e você não gasta à toa.");

    const violacoes = conferirTextosDaCapa(ctx, titulo, v.textoFaixa);
    if (temBloqueio(violacoes)) throw new Error(`Há texto que as plataformas costumam barrar na capa: “${violacoes[0].trecho}”. Corrija antes de gerar.`);

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

      const novas = [...capas, { cenaPath: caminho, titulo, criadoEm: new Date().toISOString() }];
      await gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { capas: novas, ...(v.textoFaixa ? { textoFaixa: v.textoFaixa } : {}) });
      const { data } = supabase.storage.from("produtos").getPublicUrl(caminho);
      return { indice: novas.length - 1, cenaPath: caminho, url: data.publicUrl, usadas: reserva.usadas, limite: reserva.limite, tentativas: novas.length };
    } catch (e) {
      await supabase.rpc("ia_cancelar_imagem", { p_id: reserva.id });
      if (caminho) await supabase.storage.from("produtos").remove([caminho]);
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
    return gravarEstado(supabase, v.rascunho_id, ctx.rascunho.estado, { capas });
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

// ---------- Conversa ----------

export interface TurnoDaConversa {
  resposta: string;
  acoes: AcaoProposta[];
  usadas: number;
  limite: number;
  doCache: boolean;
}

export async function conversar(entrada: unknown) {
  return comResultado(async (): Promise<TurnoDaConversa> => {
    const v = validar(conversaSchema, entrada);
    const supabase = await createClient();
    const ctx = await carregarContextoRascunho(supabase, v.rascunho_id);

    const { data: anteriores } = await supabase.from("anuncio_rascunho_mensagens").select("papel, texto").eq("rascunho_id", v.rascunho_id).order("criado_em", { ascending: false }).limit(6);
    const historico = ((anteriores ?? []) as MensagemHistorico[]).reverse();

    const g = await conversarIA(supabase, {
      produtoNome: [ctx.produto.nome, ctx.produto.variante].filter(Boolean).join(" "),
      plataforma: ctx.plataforma.nome,
      maxImagens: ctx.plataforma.maxImagens,
      estado: {
        titulo: ctx.rascunho.titulo,
        numeroImagens: ctx.rascunho.estado.numeroImagens ?? null,
        temConcorrentes: (ctx.rascunho.estado.concorrentes ?? []).length > 0,
        capasGeradas: (ctx.rascunho.estado.capas ?? []).length,
        fichaCapa1Preenchida: Object.keys(ctx.fichaCapa1).length > 0,
      },
      memoria: ctx.memoria,
      historico,
      mensagem: v.mensagem,
    });
    if (!g.ok) throw new Error(g.erro);

    // Só depois de a IA responder: mensagem e resposta entram juntas no histórico.
    const { error } = await supabase.from("anuncio_rascunho_mensagens").insert([
      { rascunho_id: v.rascunho_id, papel: "usuario", texto: v.mensagem, acoes: [] },
      { rascunho_id: v.rascunho_id, papel: "ia", texto: g.dado.conversa.resposta || "Certo.", acoes: g.dado.conversa.acoes },
    ]);
    checar(error);
    return { resposta: g.dado.conversa.resposta, acoes: g.dado.conversa.acoes, usadas: g.dado.usadas, limite: g.dado.limite, doCache: g.dado.doCache };
  });
}


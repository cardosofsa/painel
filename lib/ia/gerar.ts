/**
 * Orquestração da geração por IA. Código de SERVIDOR — nunca importe de Client Component.
 *
 * Não é um módulo `"use server"` de propósito: os wrappers finos que o cliente enxerga
 * moram nos `actions.ts` de cada feature, seguindo a convenção do projeto. Aqui fica a
 * lógica que os dois compartilham.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { validar, iaContextoSchema } from "@/lib/validacao";
import { lancarErroSupabase } from "@/lib/erros";
import { comResultado, type Resultado } from "@/lib/acao";
import { ErroIA } from "./erro";
import { PROVEDORES, chamarProvedor } from "./provedores";
import { resolverProvedor, type ProvedorResolvido } from "./resolver";
import {
  montarPromptTitulo,
  montarPromptDescricao,
  interpretarSugestao,
  esquemaSugestao,
  hashContexto,
  concorrentesRelevantes,
  limiteEfetivo,
  empacotarOpcoes,
  desempacotarOpcoes,
  montarPromptTema,
  esquemaTema,
  interpretarTema,
  hashContextoTema,
  type ContextoIA,
  type ContextoTema,
  type TemaSugerido,
} from "./prompts";

/** Os dois tipos de texto — título de anúncio e descrição de produto. */
export type TipoGeracaoTexto = "titulo" | "descricao";

/** Todo tipo de geração, incluindo "tema" (que não é texto — ver `gerarTemaVitrineIA`). */
export type TipoGeracao = TipoGeracaoTexto | "tema";

export interface SugestaoGerada {
  texto: string;
  /** Título: até 3 opções; descrição: uma. */
  opcoes: string[];
  palavrasChave: string[];
  posicionamento: string | null;
  /** Quantas gerações do dia já foram usadas, para a UI mostrar o saldo. */
  usadas: number;
  limite: number;
  /** Veio do cache: não custou nada e não consumiu cota. */
  doCache: boolean;
  /** Qual IA atendeu: a do sistema (com cota) ou a própria da conta. */
  origem: "sistema" | "propria";
  /** Ex.: "OpenAI (ChatGPT) · gpt-4.1-mini" — só para mostrar na tela. */
  provedorRotulo: string | null;
}

/**
 * Parâmetros por tipo.
 *
 * `maxTokens` é teto de CUSTO, não só de tamanho — e inclui os tokens de raciocínio. Por
 * isso não é apertado até o osso: se o raciocínio estourar o teto antes da resposta, a
 * API devolve vazio e a cota teria sido gasta à toa. Quem controla o gasto de verdade é o
 * `thinking_level` em `gemini.ts`.
 */
const PARAMETROS: Record<TipoGeracao, { maxTokens: number; temperatura: number }> = {
  // Três títulos curtos + palavras-chave + posicionamento na mesma resposta.
  titulo: { maxTokens: 900, temperatura: 0.9 },
  // Descrição em seções pode chegar a 5000 caracteres (~1500 tokens) mais o raciocínio.
  descricao: { maxTokens: 2600, temperatura: 0.7 },
  // Sete campos curtos (4 cores, 1 fonte, título, mensagem) — cabe folgado em 500 tokens.
  tema: { maxTokens: 500, temperatura: 0.8 },
};

/** Falha de infraestrutura: o usuário não fez nada errado, então a cota volta. */
const ESTORNAVEIS = new Set(["chave_invalida", "sem_credito", "servidor", "rede", "timeout"]);

/**
 * Devolve `Resultado` como toda action do app (ver `lib/acao.ts`): exceção de Server
 * Action é redigida pelo Next em produção, e a mensagem em pt-BR de `traduzirErroIA`
 * nunca chegaria à tela.
 */
export async function gerarComIA(
  supabase: SupabaseClient,
  tipo: TipoGeracaoTexto,
  contexto: unknown,
): Promise<Resultado<SugestaoGerada>> {
  return comResultado(() => executar(supabase, tipo, contexto));
}

async function executar(
  supabase: SupabaseClient,
  tipo: TipoGeracaoTexto,
  contexto: unknown,
): Promise<SugestaoGerada> {
  // 1. Valida. É o freio de custo de token, antes de qualquer coisa que gaste.
  const ctx = validar(iaContextoSchema, contexto) as ContextoIA;

  // 2. Qual IA atende esta conta. Sem nenhuma, não há o que fazer — e a cota não pode ser
  //    cobrada por isso.
  const ia = await resolverProvedor(supabase);

  const { maxTokens, temperatura } = PARAMETROS[tipo];
  const limite = limiteEfetivo(tipo, ctx.limite);
  // O provedor e o modelo entram no hash: o mesmo produto gerado por IAs diferentes dá
  // textos diferentes, e o cache de uma não pode responder pela outra.
  const hash = `${hashContexto(ctx, tipo)}:${ia.provedor}:${ia.modelo}`;

  // 3. Autentica E tenta o cache na mesma ida ao banco. É aqui que conta suspensa é
  //    barrada — por isso este passo vem antes de falar com o Google.
  const { data: cache, error: erroCache } = await supabase
    .rpc("ia_buscar_sugestao", { p_tipo: tipo, p_hash: hash })
    .maybeSingle<{ texto: string; palavras_chave: string[]; posicionamento: string | null }>();
  if (erroCache) lancarErroSupabase(erroCache);

  // 4. Acerto de cache: devolve sem chamar a API e sem consumir cota.
  if (cache) {
    const saldo = await lerSaldo(supabase, ia);
    const opcoes = desempacotarOpcoes(cache.texto, tipo);
    return {
      texto: opcoes[0] ?? "",
      opcoes,
      palavrasChave: cache.palavras_chave ?? [],
      posicionamento: cache.posicionamento,
      ...saldo,
      doCache: true,
      origem: ia.origem,
      provedorRotulo: rotuloIA(ia),
    };
  }

  // 5. Erro de cache: reserva a vaga. Estourou a cota, para aqui.
  const { usadas, limite: limiteDiario } = await reservarCota(supabase, tipo, ia);

  // 6. Gera.
  const temConcorrente = concorrentesRelevantes(ctx.concorrentes, ctx.precoCalculado ?? ctx.precoVenda).length > 0;
  const prompt = tipo === "titulo" ? montarPromptTitulo(ctx) : montarPromptDescricao(ctx);

  let bruto: string;
  try {
    bruto = await chamarProvedor(ia, prompt, {
      maxTokens,
      temperatura,
      esquema: esquemaSugestao(tipo, tipo === "titulo" && temConcorrente),
    });
  } catch (e) {
    // 7. Falha de infraestrutura não come a cota de quem não teve culpa. Bloqueio de
    //    conteúdo e resposta vazia NÃO estornam: o token já foi gasto do outro lado.
    await estornarSePreciso(supabase, ia, e);
    throw e;
  }

  const sugestao = interpretarSugestao(bruto, limite, tipo);
  if (!sugestao.texto) throw new ErroIA("vazio", "texto vazio após interpretar");

  const { error: erroGuardar } = await supabase.rpc("ia_guardar_sugestao", {
    p_tipo: tipo,
    p_hash: hash,
    p_texto: empacotarOpcoes(sugestao.opcoes),
    p_palavras_chave: sugestao.palavrasChave,
    p_posicionamento: sugestao.posicionamento,
  });
  // Falhar ao gravar no cache não pode derrubar uma geração que deu certo — o usuário
  // perde só a economia da próxima vez.
  if (erroGuardar) console.error("[ia] falha ao gravar cache:", erroGuardar.message);

  return {
    ...sugestao,
    usadas,
    limite: limiteDiario,
    doCache: false,
    origem: ia.origem,
    provedorRotulo: rotuloIA(ia),
  };
}

export interface SugestaoTema {
  tema: TemaSugerido;
  usadas: number;
  limite: number;
  doCache: boolean;
  origem: "sistema" | "propria";
  provedorRotulo: string | null;
}

/**
 * Gera o tema da vitrine. Função irmã de `executar()`, não uma variante dela: um tema não
 * é "um texto" (a saída de `interpretarTema` é um objeto de cores + fonte), então forçá-lo
 * dentro do shape de `SugestaoGerada` criaria campos que não fazem sentido nos dois
 * sentidos. O que É compartilhado — `ia_buscar_sugestao`/`ia_consumir`/`ia_guardar_sugestao`,
 * a ordem dos passos, o estorno — é reaproveitado por inteiro; só o schema, o prompt e o
 * interpretador são próprios.
 *
 * O tema fica guardado como JSON serializado dentro da coluna `texto` de `ia_sugestoes` —
 * mesma tabela dos outros dois tipos, sem coluna nova, porque `palavras_chave` e
 * `posicionamento` simplesmente ficam vazios para este tipo.
 */
export async function gerarTemaVitrineIA(
  supabase: SupabaseClient,
  contexto: ContextoTema,
): Promise<Resultado<SugestaoTema>> {
  return comResultado(() => executarTema(supabase, contexto));
}

async function executarTema(supabase: SupabaseClient, contexto: ContextoTema): Promise<SugestaoTema> {
  if (!contexto.descricaoLoja?.trim()) throw new Error("Descreva a loja em uma frase para a IA sugerir um tema.");
  if (contexto.descricaoLoja.length > 500) throw new Error("Descrição da loja longa demais.");
  const ia = await resolverProvedor(supabase);

  const { maxTokens, temperatura } = PARAMETROS.tema;
  const hash = `${hashContextoTema(contexto)}:${ia.provedor}:${ia.modelo}`;

  const { data: cache, error: erroCache } = await supabase
    .rpc("ia_buscar_sugestao", { p_tipo: "tema", p_hash: hash })
    .maybeSingle<{ texto: string }>();
  if (erroCache) lancarErroSupabase(erroCache);

  if (cache) {
    const saldo = await lerSaldo(supabase, ia);
    return { tema: interpretarTema(cache.texto), ...saldo, doCache: true, origem: ia.origem, provedorRotulo: rotuloIA(ia) };
  }

  const { usadas, limite: limiteDiario } = await reservarCota(supabase, "tema", ia);

  let bruto: string;
  try {
    bruto = await chamarProvedor(ia, montarPromptTema(contexto), { maxTokens, temperatura, esquema: esquemaTema() });
  } catch (e) {
    await estornarSePreciso(supabase, ia, e);
    throw e;
  }

  const tema = interpretarTema(bruto);

  const { error: erroGuardar } = await supabase.rpc("ia_guardar_sugestao", {
    p_tipo: "tema",
    p_hash: hash,
    p_texto: JSON.stringify(tema),
    p_palavras_chave: [],
    p_posicionamento: null,
  });
  if (erroGuardar) console.error("[ia] falha ao gravar cache de tema:", erroGuardar.message);

  return { tema, usadas, limite: limiteDiario, doCache: false, origem: ia.origem, provedorRotulo: rotuloIA(ia) };
}

function rotuloIA(ia: ProvedorResolvido): string | null {
  return ia.origem === "propria" ? `${PROVEDORES[ia.provedor].nome} · ${ia.modelo}` : null;
}

/**
 * Reserva a vaga da geração no banco. A origem decide a regra (migração 0036):
 * IA do sistema = teste grátis (dias + total de gerações); IA própria = só o teto de
 * segurança diário. O banco recusa com mensagem clara quando não cabe.
 */
async function reservarCota(
  supabase: SupabaseClient,
  tipo: TipoGeracao,
  ia: ProvedorResolvido,
): Promise<{ usadas: number; limite: number }> {
  const { data, error } = await supabase
    .rpc("ia_consumir", { p_tipo: tipo, p_origem: ia.origem })
    .maybeSingle<{ usadas: number; limite: number }>();
  if (error) lancarErroSupabase(error);
  return { usadas: data?.usadas ?? 0, limite: data?.limite ?? 0 };
}

/** Falha de infraestrutura devolve a vaga que foi reservada. */
async function estornarSePreciso(supabase: SupabaseClient, ia: ProvedorResolvido, e: unknown) {
  if (e instanceof ErroIA && ESTORNAVEIS.has(e.codigo)) {
    const { error } = await supabase.rpc("ia_estornar", { p_origem: ia.origem });
    if (error) console.error("[ia] falha ao estornar cota:", error.message);
  }
}

/**
 * Saldo para o rótulo no acerto de cache, onde `ia_consumir` não roda. Na IA do sistema é o
 * saldo do teste; na IA própria não há saldo a mostrar. Falha aqui é cosmética: zera o
 * rótulo, não quebra a geração.
 */
async function lerSaldo(supabase: SupabaseClient, ia: ProvedorResolvido): Promise<{ usadas: number; limite: number }> {
  if (ia.origem === "propria") return { usadas: 0, limite: 0 };
  const { data } = await supabase
    .rpc("ia_estado_teste")
    .maybeSingle<{ usadas: number; limite: number; ilimitado: boolean }>();
  return { usadas: data?.usadas ?? 0, limite: data?.ilimitado ? 0 : (data?.limite ?? 0) };
}

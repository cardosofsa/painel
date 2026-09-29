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
import { chamarGemini, ErroIA } from "./gemini";
import {
  montarPromptTitulo,
  montarPromptDescricao,
  interpretarSugestao,
  esquemaSugestao,
  hashContexto,
  concorrentesRelevantes,
  LIMITE_TITULO,
  LIMITE_DESCRICAO,
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
  palavrasChave: string[];
  posicionamento: string | null;
  /** Quantas gerações do dia já foram usadas, para a UI mostrar o saldo. */
  usadas: number;
  limite: number;
  /** Veio do cache: não custou nada e não consumiu cota. */
  doCache: boolean;
}

/**
 * Parâmetros por tipo.
 *
 * `maxTokens` é teto de CUSTO, não só de tamanho — e inclui os tokens de raciocínio. Por
 * isso não é apertado até o osso: se o raciocínio estourar o teto antes da resposta, a
 * API devolve vazio e a cota teria sido gasta à toa. Quem controla o gasto de verdade é o
 * `thinking_level` em `gemini.ts`.
 */
const PARAMETROS: Record<TipoGeracao, { maxTokens: number; temperatura: number; limite: number }> = {
  // Título é curto, mas vem com palavras-chave e posicionamento na mesma resposta.
  titulo: { maxTokens: 700, temperatura: 0.9, limite: LIMITE_TITULO },
  descricao: { maxTokens: 1600, temperatura: 0.7, limite: LIMITE_DESCRICAO },
  // Sete campos curtos (4 cores, 1 fonte, título, mensagem) — cabe folgado em 500 tokens.
  // `limite` aqui não é usado (tema não passa por `truncarEmPalavra` de um texto único),
  // mas o tipo exige o campo; mantém o shape uniforme entre os três.
  tema: { maxTokens: 500, temperatura: 0.8, limite: 0 },
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

  // 2. Sem chave não há o que fazer — e a cota não pode ser cobrada por isso.
  if (!process.env.GEMINI_API_KEY) throw new ErroIA("sem_chave");

  const { maxTokens, temperatura, limite } = PARAMETROS[tipo];
  const hash = hashContexto(ctx, tipo);

  // 3. Autentica E tenta o cache na mesma ida ao banco. É aqui que conta suspensa é
  //    barrada — por isso este passo vem antes de falar com o Google.
  const { data: cache, error: erroCache } = await supabase
    .rpc("ia_buscar_sugestao", { p_tipo: tipo, p_hash: hash })
    .maybeSingle<{ texto: string; palavras_chave: string[]; posicionamento: string | null }>();
  if (erroCache) lancarErroSupabase(erroCache);

  // 4. Acerto de cache: devolve sem chamar a API e sem consumir cota.
  if (cache) {
    const saldo = await lerSaldo(supabase);
    return {
      texto: cache.texto,
      palavrasChave: cache.palavras_chave ?? [],
      posicionamento: cache.posicionamento,
      ...saldo,
      doCache: true,
    };
  }

  // 5. Erro de cache: reserva a vaga do dia. Estourou a cota, para aqui.
  const { data: cota, error: erroCota } = await supabase
    .rpc("ia_consumir", { p_tipo: tipo })
    .maybeSingle<{ usadas: number; limite: number }>();
  if (erroCota) lancarErroSupabase(erroCota);

  const usadas = cota?.usadas ?? 0;
  const limiteDiario = cota?.limite ?? 0;

  // 6. Gera.
  const temConcorrente = concorrentesRelevantes(ctx.concorrentes, ctx.precoCalculado ?? ctx.precoVenda).length > 0;
  const prompt = tipo === "titulo" ? montarPromptTitulo(ctx) : montarPromptDescricao(ctx);

  let bruto: string;
  try {
    bruto = await chamarGemini(prompt, {
      maxTokens,
      temperatura,
      esquema: esquemaSugestao(tipo === "titulo" && temConcorrente),
    });
  } catch (e) {
    // 7. Falha de infraestrutura não come a cota de quem não teve culpa. Bloqueio de
    //    conteúdo e resposta vazia NÃO estornam: o token já foi gasto do outro lado.
    if (e instanceof ErroIA && ESTORNAVEIS.has(e.codigo)) {
      const { error } = await supabase.rpc("ia_estornar");
      if (error) console.error("[ia] falha ao estornar cota:", error.message);
    }
    throw e;
  }

  const sugestao = interpretarSugestao(bruto, limite);
  if (!sugestao.texto) throw new ErroIA("vazio", "texto vazio após interpretar");

  const { error: erroGuardar } = await supabase.rpc("ia_guardar_sugestao", {
    p_tipo: tipo,
    p_hash: hash,
    p_texto: sugestao.texto,
    p_palavras_chave: sugestao.palavrasChave,
    p_posicionamento: sugestao.posicionamento,
  });
  // Falhar ao gravar no cache não pode derrubar uma geração que deu certo — o usuário
  // perde só a economia da próxima vez.
  if (erroGuardar) console.error("[ia] falha ao gravar cache:", erroGuardar.message);

  return { ...sugestao, usadas, limite: limiteDiario, doCache: false };
}

export interface SugestaoTema {
  tema: TemaSugerido;
  usadas: number;
  limite: number;
  doCache: boolean;
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
  if (!process.env.GEMINI_API_KEY) throw new ErroIA("sem_chave");

  const { maxTokens, temperatura } = PARAMETROS.tema;
  const hash = hashContextoTema(contexto);

  const { data: cache, error: erroCache } = await supabase
    .rpc("ia_buscar_sugestao", { p_tipo: "tema", p_hash: hash })
    .maybeSingle<{ texto: string }>();
  if (erroCache) lancarErroSupabase(erroCache);

  if (cache) {
    const saldo = await lerSaldo(supabase);
    return { tema: interpretarTema(cache.texto), ...saldo, doCache: true };
  }

  const { data: cota, error: erroCota } = await supabase
    .rpc("ia_consumir", { p_tipo: "tema" })
    .maybeSingle<{ usadas: number; limite: number }>();
  if (erroCota) lancarErroSupabase(erroCota);

  const usadas = cota?.usadas ?? 0;
  const limiteDiario = cota?.limite ?? 0;

  let bruto: string;
  try {
    bruto = await chamarGemini(montarPromptTema(contexto), { maxTokens, temperatura, esquema: esquemaTema() });
  } catch (e) {
    if (e instanceof ErroIA && ESTORNAVEIS.has(e.codigo)) {
      const { error } = await supabase.rpc("ia_estornar");
      if (error) console.error("[ia] falha ao estornar cota:", error.message);
    }
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

  return { tema, usadas, limite: limiteDiario, doCache: false };
}

/**
 * Saldo do dia para o rótulo "{usadas}/{limite} hoje" no acerto de cache, onde
 * `ia_consumir` não roda. Falha aqui é cosmética: zera o rótulo, não quebra a geração.
 */
async function lerSaldo(supabase: SupabaseClient): Promise<{ usadas: number; limite: number }> {
  // O `.eq("user_id", ...)` vale só para `perfis_acesso`: a policy dela deixa o master ver
  // todas as contas, então sem filtro o `maybeSingle()` dava PGRST116 e o master lia
  // sempre limite 0. `ia_uso` não tem essa exceção — a policy já devolve só a própria linha.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [usoRes, perfilRes] = await Promise.all([
    supabase.from("ia_uso").select("geracoes").eq("dia", hojeSaoPaulo()).maybeSingle<{ geracoes: number }>(),
    supabase
      .from("perfis_acesso")
      .select("ia_limite_diario")
      .eq("user_id", user?.id ?? "")
      .maybeSingle<{ ia_limite_diario: number }>(),
  ]);
  return {
    usadas: usoRes.data?.geracoes ?? 0,
    limite: perfilRes.data?.ia_limite_diario ?? 0,
  };
}

/**
 * Mesmo fuso que a migração 0024 usa para virar o dia. `toISOString().slice(0,10)` daria
 * o dia seguinte depois das 21h e o saldo apareceria zerado à noite.
 */
function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

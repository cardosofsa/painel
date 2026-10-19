/**
 * Direção da loja para a IA do Anúncio (0109): as instruções que o vendedor escreveu e os
 * exemplos de texto dele, que entram no prompt de títulos e de descrição. Puro, coberto por
 * `estilo-loja.test.ts`.
 *
 * Os exemplos vêm de dois lugares: o que o vendedor EDITOU e salvou (a correção dele é o
 * melhor sinal de estilo, então vem primeiro) e os anúncios que a loja já tem. A IA recebe
 * poucos e cortados: exemplo é para pegar o tom e a estrutura, e cada caractere é token pago.
 */

import { hashTexto, limparCampo } from "./texto";

export type TipoExemplo = "titulo" | "descricao";
export type OrigemExemplo = "edicao" | "referencia" | "loja";

export interface ExemploDaLoja {
  texto: string;
  origem: OrigemExemplo;
}

export interface EstiloDaLoja {
  /** Texto livre do perfil (`instrucoes_titulo` / `instrucoes_descricao`). */
  instrucoes: string | null;
  /** Do mais importante para o menos: edições do vendedor, textos que ele colou no chat, anúncios da loja. */
  exemplos: ExemploDaLoja[];
}

export const LIMITE_INSTRUCOES = 2000;
/** Quantos exemplos e de que tamanho cada tipo leva ao prompt. */
const TETO: Record<TipoExemplo, { quantos: number; caracteres: number }> = {
  titulo: { quantos: 10, caracteres: 160 },
  descricao: { quantos: 3, caracteres: 900 },
};

/** Texto em várias linhas para dentro do prompt: sem crase (delimita bloco), sem excesso de branco, cortado. */
export function blocoDeTexto(t: string, max: number): string | null {
  const limpo = t
    .replace(/`+/g, "'")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!limpo) return null;
  return limpo.length > max ? `${limpo.slice(0, max).trimEnd()}…` : limpo;
}

/** Escolhe e ordena os exemplos: edições primeiro, sem repetidos, no teto do tipo. */
export function selecionarExemplos(exemplos: readonly ExemploDaLoja[], tipo: TipoExemplo): ExemploDaLoja[] {
  const vistos = new Set<string>();
  // O que o vendedor escreveu ou escolheu (edição, texto colado no chat) vem antes do que foi lido da loja.
  const ordem = [...exemplos.filter((e) => e.origem === "edicao"), ...exemplos.filter((e) => e.origem === "referencia"), ...exemplos.filter((e) => e.origem === "loja")];
  const saida: ExemploDaLoja[] = [];
  for (const e of ordem) {
    const chave = e.texto.replace(/\s+/g, " ").trim().toLowerCase();
    if (chave.length < 10 || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(e);
    if (saida.length >= TETO[tipo].quantos) break;
  }
  return saida;
}

/**
 * O trecho do prompt com a direção da loja. Vazio quando não há nada (o prompt fica igual ao
 * de antes). Os exemplos vêm com o aviso de que são de OUTROS produtos: o modelo copia o tom,
 * nunca um fato (medida, material) que não é deste produto.
 */
export function blocoEstiloDaLoja(estilo: EstiloDaLoja | null | undefined, tipo: TipoExemplo): string {
  if (!estilo) return "";
  const partes: string[] = [];
  const instrucoes = estilo.instrucoes ? blocoDeTexto(estilo.instrucoes, LIMITE_INSTRUCOES) : null;
  if (instrucoes) partes.push(`Direção da loja (siga, desde que não contrarie as regras do fim):\n${instrucoes}`);

  const { caracteres } = TETO[tipo];
  const exemplos = selecionarExemplos(estilo.exemplos, tipo)
    .map((e) => (tipo === "titulo" ? limparCampo(e.texto, caracteres) : blocoDeTexto(e.texto, caracteres)))
    .filter((t): t is string => !!t);
  if (exemplos.length) {
    const nome = tipo === "titulo" ? "Títulos" : "Descrições";
    const corpo = tipo === "titulo" ? exemplos.map((t) => `- ${t}`).join("\n") : exemplos.map((t, i) => `[Exemplo ${i + 1}]\n${t}`).join("\n\n");
    partes.push(
      `${nome} que a própria loja usa (imite o tom, a estrutura e o vocabulário; são de OUTROS produtos, então não copie medida, material, quantidade nem qualquer fato deles):\n${corpo}`,
    );
  }
  return partes.length ? `\n${partes.join("\n\n")}\n` : "";
}

/** Parte da chave de cache: mudou a direção ou os exemplos, a resposta guardada não vale mais. */
export function hashEstilo(estilo: EstiloDaLoja | null | undefined, tipo: TipoExemplo): string {
  if (!estilo) return "";
  const exemplos = selecionarExemplos(estilo.exemplos, tipo).map((e) => e.texto);
  if (!estilo.instrucoes?.trim() && exemplos.length === 0) return "";
  return hashTexto([estilo.instrucoes ?? "", ...exemplos].join("\u0002"));
}

/**
 * A edição merece virar exemplo? Só quando o texto final é de fato diferente do de partida
 * (espaço e quebra de linha não contam) e tem tamanho de texto de verdade.
 */
export function edicaoRelevante(antes: string | null | undefined, depois: string, minimo = 10): boolean {
  const norm = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  const final = norm(depois);
  if (final.length < minimo) return false;
  return !antes || norm(antes) !== final;
}

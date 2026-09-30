import type { OpcoesGeracao } from "../gemini";

import type { ProvedorId } from "./catalogo";
export type { ProvedorId } from "./catalogo";

export const PROVEDORES_IDS: readonly ProvedorId[] = ["gemini", "openai", "anthropic", "openrouter"];

export interface CredencialIA {
  provedor: ProvedorId;
  chave: string;
  modelo: string;
}

export type OpcoesProvedor = OpcoesGeracao;

/** Teto de espera das chamadas que não são do Gemini (modelos maiores respondem mais devagar). */
export const TIMEOUT_PADRAO_MS = 25_000;

/**
 * Para provedores sem saída estruturada nativa (ou com suporte irregular entre modelos):
 * o esquema vai no próprio prompt. `interpretarSugestao`/`interpretarTema` já toleram cerca
 * de markdown e texto em volta do JSON.
 */
export function instrucaoJson(esquema: object): string {
  return (
    "\n\nResponda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem markdown, " +
    "exatamente neste formato (JSON Schema):\n" +
    JSON.stringify(esquema)
  );
}

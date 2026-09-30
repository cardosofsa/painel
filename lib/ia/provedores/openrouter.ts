import { requisitarJson } from "../http";
import { extrairTextoChat } from "./openai";
import { TIMEOUT_PADRAO_MS, instrucaoJson, type OpcoesProvedor } from "./tipos";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const ENDPOINT_MODELOS = "https://openrouter.ai/api/v1/models";
const ENDPOINT_CHAVE = "https://openrouter.ai/api/v1/auth/key";

/**
 * Puro. O OpenRouter dá acesso a centenas de modelos, e nem todos aceitam saída estruturada:
 * por isso o esquema vai no PRÓPRIO PROMPT em vez de `response_format`, que faria a chamada
 * falhar em parte dos modelos.
 */
export function montarCorpoOpenRouter(prompt: string, o: OpcoesProvedor, modelo: string) {
  return {
    model: modelo,
    messages: [{ role: "user", content: prompt + instrucaoJson(o.esquema) }],
    max_tokens: o.maxTokens,
    temperature: o.temperatura,
  };
}

function cabecalhos(chave: string) {
  return { Authorization: `Bearer ${chave}`, "X-Title": "SERTAO" };
}

export async function chamarOpenRouter(
  prompt: string,
  o: OpcoesProvedor,
  cred: { chave: string; modelo: string },
): Promise<string> {
  const json = await requisitarJson(ENDPOINT, {
    method: "POST",
    headers: cabecalhos(cred.chave),
    body: montarCorpoOpenRouter(prompt, o, cred.modelo),
    timeoutMs: o.timeoutMs ?? TIMEOUT_PADRAO_MS,
  });
  return extrairTextoChat(json);
}

/** Puro. Só modelos que produzem texto; sem a informação de modalidade, mantém. */
export function filtrarModelosOpenRouter(
  modelos: { id?: string; architecture?: { output_modalities?: string[] } }[],
): string[] {
  return modelos
    .filter((m) => m.id && (!m.architecture?.output_modalities || m.architecture.output_modalities.includes("text")))
    .map((m) => m.id as string)
    .sort();
}

/**
 * A lista de modelos do OpenRouter é pública (não exige chave), então o teste da chave é
 * uma chamada à parte — senão qualquer texto passaria como "conexão ok".
 */
export async function listarModelosOpenRouter(chave: string): Promise<string[]> {
  await requisitarJson(ENDPOINT_CHAVE, { method: "GET", headers: cabecalhos(chave), timeoutMs: 10_000 });
  const json = (await requisitarJson(ENDPOINT_MODELOS, {
    method: "GET",
    headers: cabecalhos(chave),
    timeoutMs: 15_000,
  })) as { data?: { id?: string; architecture?: { output_modalities?: string[] } }[] } | null;
  return filtrarModelosOpenRouter(json?.data ?? []);
}

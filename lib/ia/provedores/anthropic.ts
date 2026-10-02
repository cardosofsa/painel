import { ErroIA } from "../erro";
import { requisitarJson } from "../http";
import { TIMEOUT_PADRAO_MS, type OpcoesProvedor } from "./tipos";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const ENDPOINT_MODELOS = "https://api.anthropic.com/v1/models?limit=100";
const VERSAO_API = "2023-06-01";
const NOME_FERRAMENTA = "responder";

function cabecalhos(chave: string) {
  return { "x-api-key": chave, "anthropic-version": VERSAO_API };
}

/**
 * Puro. A saída em JSON vem de uma "ferramenta" obrigatória: o modelo é forçado a chamá-la
 * e o argumento segue o esquema — mais confiável do que pedir JSON no texto.
 */
export function montarCorpoAnthropic(prompt: string, o: OpcoesProvedor, modelo: string) {
  return {
    model: modelo,
    max_tokens: o.maxTokens,
    // A API da Anthropic aceita de 0 a 1.
    temperature: Math.min(1, Math.max(0, o.temperatura)),
    messages: [
      {
        role: "user",
        content: o.imagem
          ? [
              { type: "image", source: { type: "base64", media_type: o.imagem.mime, data: o.imagem.base64 } },
              { type: "text", text: prompt },
            ]
          : prompt,
      },
    ],
    tools: [
      {
        name: NOME_FERRAMENTA,
        description: "Devolve a resposta final no formato pedido.",
        input_schema: o.esquema,
      },
    ],
    tool_choice: { type: "tool", name: NOME_FERRAMENTA },
  };
}

/** Puro. Devolve o argumento da ferramenta como JSON (texto), no formato que os parsers esperam. */
export function extrairTextoAnthropic(json: unknown): string {
  const raiz = (json ?? {}) as {
    type?: string;
    error?: { message?: string };
    content?: { type?: string; input?: unknown; text?: string }[];
    stop_reason?: string;
  };
  if (raiz.type === "error" || raiz.error) throw new ErroIA("desconhecido", raiz.error?.message);
  if (raiz.stop_reason === "refusal") throw new ErroIA("bloqueado_seguranca", "refusal");

  const blocos = raiz.content ?? [];
  const ferramenta = blocos.find((b) => b.type === "tool_use" && b.input && typeof b.input === "object");
  if (ferramenta) return JSON.stringify(ferramenta.input);

  // Sem ferramenta (raro): aproveita texto solto, que o parser tolera.
  const texto = blocos
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("")
    .trim();
  if (texto) return texto;
  throw new ErroIA("vazio", `sem conteúdo na resposta (stop_reason=${raiz.stop_reason ?? "?"})`);
}

export async function chamarAnthropic(
  prompt: string,
  o: OpcoesProvedor,
  cred: { chave: string; modelo: string },
): Promise<string> {
  const json = await requisitarJson(ENDPOINT, {
    method: "POST",
    headers: cabecalhos(cred.chave),
    body: montarCorpoAnthropic(prompt, o, cred.modelo),
    timeoutMs: o.timeoutMs ?? TIMEOUT_PADRAO_MS,
  });
  return extrairTextoAnthropic(json);
}

export async function listarModelosAnthropic(chave: string): Promise<string[]> {
  const json = (await requisitarJson(ENDPOINT_MODELOS, {
    method: "GET",
    headers: cabecalhos(chave),
    timeoutMs: 10_000,
  })) as { data?: { id?: string }[] } | null;
  return (json?.data ?? [])
    .map((m) => m.id ?? "")
    .filter((id) => id.startsWith("claude"))
    .sort();
}

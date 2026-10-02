import { ErroIA } from "../erro";
import { requisitarJson } from "../http";
import { TIMEOUT_PADRAO_MS, type OpcoesProvedor } from "./tipos";

const ENDPOINT = "https://api.openai.com/v1/chat/completions";
const ENDPOINT_MODELOS = "https://api.openai.com/v1/models";

/**
 * Modelos de raciocínio (o1/o3/o4, gpt-5…) recusam `temperature` diferente do padrão; para
 * eles o campo simplesmente não vai.
 */
export function aceitaTemperatura(modelo: string): boolean {
  return !/^(o\d|gpt-5)/i.test(modelo);
}

/** Puro. Texto, ou texto + foto no formato "chat completions" (OpenAI e OpenRouter). */
export function conteudoChat(prompt: string, o: Pick<OpcoesProvedor, "imagem">) {
  if (!o.imagem) return prompt;
  return [
    { type: "text", text: prompt },
    { type: "image_url", image_url: { url: `data:${o.imagem.mime};base64,${o.imagem.base64}` } },
  ];
}

/** Puro. Corpo da chamada, separado da rede para o teste conferir. */
export function montarCorpoOpenAI(prompt: string, o: OpcoesProvedor, modelo: string) {
  return {
    model: modelo,
    messages: [{ role: "user", content: conteudoChat(prompt, o) }],
    // `max_completion_tokens` (e não `max_tokens`) é o nome aceito por todos os modelos atuais.
    max_completion_tokens: o.maxTokens,
    ...(aceitaTemperatura(modelo) ? { temperature: o.temperatura } : {}),
    // strict=false: nosso esquema tem campo opcional (`posicionamento`), que o modo estrito
    // não aceita.
    response_format: { type: "json_schema", json_schema: { name: "resposta", strict: false, schema: o.esquema } },
  };
}

/**
 * Puro. Lê a resposta do formato "chat completions" — o mesmo que o OpenRouter devolve.
 * Recusa explícita do modelo vira `bloqueado_seguranca`; texto vazio por corte de tamanho
 * vira `vazio` (o raciocínio comeu o teto de tokens).
 */
export function extrairTextoChat(json: unknown): string {
  const raiz = (json ?? {}) as { error?: { message?: string; code?: string | number }; choices?: unknown[] };
  if (raiz.error) throw new ErroIA("desconhecido", `${raiz.error.code ?? ""}: ${raiz.error.message ?? ""}`);

  const escolha = (raiz.choices?.[0] ?? {}) as {
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string;
  };
  if (escolha.message?.refusal) throw new ErroIA("bloqueado_seguranca", escolha.message.refusal);
  if (escolha.finish_reason === "content_filter") throw new ErroIA("bloqueado_seguranca", "content_filter");

  const texto = (escolha.message?.content ?? "").trim();
  if (texto) return texto;
  throw new ErroIA("vazio", `sem texto na resposta (finish_reason=${escolha.finish_reason ?? "?"})`);
}

export async function chamarOpenAI(
  prompt: string,
  o: OpcoesProvedor,
  cred: { chave: string; modelo: string },
): Promise<string> {
  const json = await requisitarJson(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${cred.chave}` },
    body: montarCorpoOpenAI(prompt, o, cred.modelo),
    timeoutMs: o.timeoutMs ?? TIMEOUT_PADRAO_MS,
  });
  return extrairTextoChat(json);
}

/** Puro. Fica só com modelos de conversa/texto (fora áudio, imagem, embedding, moderação…). */
export function filtrarModelosOpenAI(ids: string[]): string[] {
  return ids
    .filter((id) => /^(gpt-|o\d|chatgpt-)/i.test(id))
    .filter((id) => !/(audio|realtime|image|tts|transcribe|embedding|search|moderation|whisper|instruct|preview-\d{4})/i.test(id))
    .sort();
}

/** Também serve de "testar conexão": chave errada estoura como `chave_invalida`. */
export async function listarModelosOpenAI(chave: string): Promise<string[]> {
  const json = (await requisitarJson(ENDPOINT_MODELOS, {
    method: "GET",
    headers: { Authorization: `Bearer ${chave}` },
    timeoutMs: 10_000,
  })) as { data?: { id?: string }[] } | null;
  return filtrarModelosOpenAI((json?.data ?? []).map((m) => m.id ?? "").filter(Boolean));
}

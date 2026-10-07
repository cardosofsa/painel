/**
 * Geração de imagem com o Gemini ("Nano Banana", `gemini-2.5-flash-image`). SÓ SERVIDOR:
 * a chave do sistema não pode ir para o navegador (mesma regra de `gemini.ts`).
 *
 * Usa `models/{modelo}:generateContent` com `responseModalities: ["IMAGE"]`, o formato
 * documentado para os modelos de imagem. O modelo é configurável por env
 * (`GEMINI_IMAGE_MODEL`) para trocar sem deploy quando o Google renomear.
 */

import "server-only";
import { ErroIA } from "./erro";
import { requisitarJson } from "./http";

const MODELO_IMAGEM_PADRAO = "gemini-2.5-flash-image";

export interface ImagemGerada {
  base64: string;
  mime: string;
}

/** Puro. Corpo da chamada (testado sem rede). */
export function montarCorpoImagem(prompt: string, foto?: { base64: string; mime: string } | null) {
  const partes: object[] = [{ text: prompt }];
  if (foto) partes.push({ inline_data: { mime_type: foto.mime, data: foto.base64 } });
  return {
    contents: [{ role: "user", parts: partes }],
    generationConfig: { responseModalities: ["IMAGE"], candidateCount: 1 },
  };
}

/**
 * Puro. Tira a primeira imagem da resposta. Aceita `inlineData` (REST) e `inline_data`
 * (snake_case), e também o formato da API Interactions (`steps[].content[]` com
 * `type: "image"`), para não quebrar se a forma mudar.
 */
export function extrairImagemGemini(json: unknown): ImagemGerada {
  const raiz = (json ?? {}) as Record<string, unknown>;
  const erro = raiz.error as { code?: string | number; message?: string } | undefined;
  if (erro) throw new ErroIA("desconhecido", `${String(erro.code ?? "")}: ${erro.message ?? ""}`);

  const feedback = raiz.promptFeedback as { blockReason?: string } | undefined;
  if (feedback?.blockReason) throw new ErroIA("bloqueado_seguranca", feedback.blockReason);

  for (const c of (raiz.candidates as Record<string, unknown>[] | undefined) ?? []) {
    const partes = ((c.content as Record<string, unknown> | undefined)?.parts as Record<string, unknown>[] | undefined) ?? [];
    for (const p of partes) {
      const dado = (p.inlineData ?? p.inline_data) as { data?: string; mimeType?: string; mime_type?: string } | undefined;
      if (dado?.data) return { base64: dado.data, mime: dado.mimeType ?? dado.mime_type ?? "image/png" };
    }
    if (typeof c.finishReason === "string" && /SAFETY|PROHIBITED|IMAGE_SAFETY|BLOCK/i.test(c.finishReason)) throw new ErroIA("bloqueado_seguranca", c.finishReason);
  }

  const inter = ((raiz.interaction as Record<string, unknown>) ?? raiz) as Record<string, unknown>;
  for (const step of (inter.steps as Record<string, unknown>[] | undefined) ?? []) {
    for (const bloco of (step.content as Record<string, unknown>[] | undefined) ?? []) {
      if (bloco?.type === "image" && typeof bloco.data === "string") return { base64: bloco.data, mime: (bloco.mime_type as string) ?? "image/png" };
    }
  }
  throw new ErroIA("vazio", "sem imagem na resposta");
}

export function modeloImagem(): string {
  return process.env.GEMINI_IMAGE_MODEL || MODELO_IMAGEM_PADRAO;
}

/** Chama o modelo de imagem com a chave do sistema. Lança `ErroIA`. */
export async function gerarImagemGemini(prompt: string, foto?: { base64: string; mime: string } | null): Promise<ImagemGerada> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) throw new ErroIA("sem_chave");
  const modelo = modeloImagem();
  const json = await requisitarJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave },
    body: montarCorpoImagem(prompt, foto),
    // Imagem leva mais que texto: 15–40 s é normal.
    timeoutMs: 55_000,
  });
  return extrairImagemGemini(json);
}

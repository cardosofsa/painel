/**
 * Pesquisa na web com a busca do Google embutida no Gemini. SÓ SERVIDOR (mesma regra de
 * `gemini.ts`: a chave não pode ir para o navegador).
 *
 * Usa `models/{modelo}:generateContent` com a ferramenta `google_search`. Essa ferramenta não
 * combina com saída em JSON de esquema, por isso o prompt pede o JSON no texto e a leitura é
 * defensiva (`interpretarConcorrentes`). Devolve o pacote texto + fontes já serializado, que é
 * o que o cache guarda.
 */

import "server-only";
import { empacotarPesquisa, extrairResposta } from "./prompts-concorrentes";
import { requisitarJson } from "./http";

export async function pesquisarComBusca(chave: string, modelo: string, prompt: string): Promise<string> {
  const json = await requisitarJson(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": chave },
    body: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2500 },
    },
    // Busca com várias páginas é mais lenta que texto puro.
    timeoutMs: 50_000,
  });
  const { texto, fontes } = extrairResposta(json);
  return empacotarPesquisa(texto, fontes);
}

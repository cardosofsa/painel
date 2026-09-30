import { ErroIA, mapearStatusHttp } from "./erro";

/**
 * POST/GET JSON com os mesmos cuidados para todo provedor: timeout, erro de rede e status
 * HTTP viram `ErroIA`. **Só recebe URL fixa do código** (nunca digitada pelo usuário), o que
 * fecha a porta para SSRF.
 *
 * O corpo de uma resposta de erro pode trazer eco do prompt (custo, fornecedor…): vai para o
 * log do servidor, nunca para a tela.
 */
export async function requisitarJson(
  url: string,
  init: { method: "GET" | "POST"; headers: Record<string, string>; body?: unknown; timeoutMs: number },
): Promise<unknown> {
  let resposta: Response;
  try {
    resposta = await fetch(url, {
      method: init.method,
      headers: { "Content-Type": "application/json", ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs),
      cache: "no-store",
    });
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    throw new ErroIA(nome === "TimeoutError" || nome === "AbortError" ? "timeout" : "rede", nome);
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    console.error("[ia] http", resposta.status, corpo.slice(0, 300));
    throw new ErroIA(mapearStatusHttp(resposta.status, corpo));
  }
  return resposta.json().catch(() => null);
}

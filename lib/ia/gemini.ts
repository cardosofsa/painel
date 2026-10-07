/**
 * Chamada ao Gemini. ÚNICO ponto do app que fala com um serviço externo.
 *
 * SÓ PODE SER IMPORTADO POR CÓDIGO DE SERVIDOR (`actions.ts`, `lib/ia/gerar.ts`). Se um
 * Client Component importar isto, a chave vaza para o bundle do navegador.
 *
 * Por isso `lib/csp.ts` NÃO é alterado: a CSP é aplicada pelo navegador sobre requisições
 * originadas na página, e esta sai do runtime Node. Liberar
 * `generativelanguage.googleapis.com` em `connect-src` não só é desnecessário como
 * sinalizaria que mover este `fetch` para o cliente é aceitável — e isso entregaria a
 * chave para qualquer visitante.
 *
 * A API é a Interactions (`POST /v1beta/interactions`), que substituiu o
 * `models/{id}:generateContent`. Diferenças que importam aqui: o modelo vai no CORPO,
 * `generation_config` é snake_case, a saída estruturada é `response_format` (JSON Schema,
 * não o dialeto OpenAPI antigo), e o raciocínio se controla por `thinking_level` — não
 * existe mais `thinkingBudget: 0`.
 */

import "server-only";
import { ErroIA } from "./erro";
import { requisitarJson } from "./http";

// Compatibilidade: o resto do projeto e os testes importam estes nomes daqui.
export { ErroIA, mapearStatusHttp, type CodigoErroIA } from "./erro";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

/**
 * Flash-Lite é o mais barato da linha e um dos poucos que aceita `thinking_level:
 * "minimal"`. Configurável por env para não precisar de deploy quando o Google renomear —
 * e trocar para um modelo que não aceite "minimal" (3.8 Flash, por exemplo) encareceria a
 * conta em silêncio, então o nível cai junto na tabela abaixo.
 */
const MODELO_PADRAO = "gemini-3.5-flash-lite";

/** Modelos que NÃO aceitam `minimal`; para eles o mínimo cobrável é `low`. */
const SEM_NIVEL_MINIMO = ["3.8-flash", "3-pro", "3.1-pro", "2.5-"];

export interface OpcoesGeracao {
  /** Teto de custo por chamada. Atenção: inclui os tokens de raciocínio. */
  maxTokens: number;
  temperatura: number;
  /** JSON Schema da resposta. Ver `esquemaSugestao` em `./prompts`. */
  esquema: object;
  timeoutMs?: number;
  /** Foto junto do prompt (modelos com visão). Base64 sem o prefixo `data:`. */
  imagem?: { base64: string; mime: string };
}

/** Códigos de bloqueio de conteúdo da API — todos viram a mesma mensagem para o usuário. */
const CODIGOS_BLOQUEIO = new Set([
  "safety",
  "recitation",
  "language",
  "prohibited_content",
  "spii",
  "blocklist",
  "content_blocked",
]);

/**
 * Puro. Extrai o texto da resposta.
 *
 * Aceita tanto `{ interaction: {...} }` quanto o objeto direto de propósito: a doc mostra
 * o envelope no streaming e nos SDKs, mas não publica o corpo da resposta não-streaming.
 * Aceitar os dois custa uma linha e evita quebrar se a forma mudar.
 *
 * `output_text` é o atalho da API, mas ele junta só os últimos blocos de texto
 * consecutivos — por isso o fallback varre os `steps` do tipo `model_output`.
 */
export function extrairTextoGemini(json: unknown): string {
  const raiz = (json ?? {}) as Record<string, unknown>;
  const erro = raiz.error as { code?: string; message?: string } | undefined;
  if (erro?.code && CODIGOS_BLOQUEIO.has(erro.code)) throw new ErroIA("bloqueado_seguranca", erro.message);
  if (erro?.code) throw new ErroIA("desconhecido", `${erro.code}: ${erro.message ?? ""}`);

  const inter = ((raiz.interaction as Record<string, unknown>) ?? raiz) as Record<string, unknown>;

  const atalho = typeof inter.output_text === "string" ? inter.output_text.trim() : "";
  if (atalho) return atalho;

  const steps = Array.isArray(inter.steps) ? inter.steps : [];
  const partes: string[] = [];
  for (const step of steps) {
    const s = step as Record<string, unknown>;
    if (s.type !== "model_output") continue;
    for (const bloco of Array.isArray(s.content) ? s.content : []) {
      const texto = (bloco as Record<string, unknown>)?.text;
      if (typeof texto === "string" && texto.trim()) partes.push(texto);
    }
  }

  const texto = partes.join("").trim();
  if (texto) return texto;

  // `incomplete` acontece quando o raciocínio consome o teto de tokens antes da resposta.
  if (inter.status === "incomplete") throw new ErroIA("vazio", "status incomplete (max_output_tokens)");
  throw new ErroIA("vazio", `sem texto na resposta (status=${String(inter.status ?? "?")})`);
}

/** Puro. `minimal` onde der; nos modelos que não aceitam, `low`. */
export function nivelRaciocinio(modelo: string): "minimal" | "low" {
  return SEM_NIVEL_MINIMO.some((m) => modelo.includes(m)) ? "low" : "minimal";
}

/** Puro. Separado de `chamarGemini` para o teste conferir o corpo sem tocar na rede. */
export function montarCorpo(prompt: string, o: OpcoesGeracao, modelo: string) {
  return {
    model: modelo,
    input: o.imagem ? [{ type: "text", text: prompt }, { type: "image", data: o.imagem.base64, mime_type: o.imagem.mime }] : prompt,
    generation_config: {
      temperature: o.temperatura,
      max_output_tokens: o.maxTokens,
      // A economia principal do desenho: o raciocínio é cobrado como token de saída e
      // não ajuda a escrever título de anúncio. Ver "Cota e custo" no README.
      thinking_level: nivelRaciocinio(modelo),
    },
    response_format: { type: "text", mime_type: "application/json", schema: o.esquema },
  };
}

export interface CredencialGemini {
  chave: string;
  modelo: string;
}

/** Credencial da IA DO SISTEMA (variáveis de ambiente). Lida dentro da função, não no módulo. */
export function credencialDoSistema(): CredencialGemini | null {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) return null;
  return { chave, modelo: process.env.GEMINI_MODEL || MODELO_PADRAO };
}

/**
 * Faz a chamada e devolve o texto cru do modelo. Lança `ErroIA`.
 *
 * Sem retry automático de propósito: retry multiplica o custo e, num erro sistêmico,
 * vira amplificação contra a própria conta. Retentar é clique do usuário em "Gerar outro".
 *
 * `cred` vem da conta (chave própria, já decifrada) ou do sistema; sem ela usa a do sistema.
 */
export async function chamarGemini(prompt: string, o: OpcoesGeracao, cred?: CredencialGemini): Promise<string> {
  const c = cred ?? credencialDoSistema();
  if (!c) throw new ErroIA("sem_chave");

  const json = await requisitarJson(ENDPOINT, {
    method: "POST",
    // Header, nunca query string: URL vai parar em log de proxy e de erro.
    headers: { "x-goog-api-key": c.chave },
    body: montarCorpo(prompt, o, c.modelo),
    timeoutMs: o.timeoutMs ?? 12_000,
  });
  return extrairTextoGemini(json);
}

/**
 * Modelos que a chave enxerga e que geram texto. Também serve de "testar conexão": chave
 * errada estoura aqui como `chave_invalida`.
 */
export async function listarModelosGemini(chave: string): Promise<string[]> {
  const json = (await requisitarJson("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
    method: "GET",
    headers: { "x-goog-api-key": chave },
    timeoutMs: 10_000,
  })) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] } | null;

  return (json?.models ?? [])
    .filter((m) => m.name?.startsWith("models/gemini") && (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => (m.name as string).replace("models/", ""))
    .sort();
}

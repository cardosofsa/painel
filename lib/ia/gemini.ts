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

import { traduzirErroIA } from "@/lib/erros";

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

export type CodigoErroIA =
  | "sem_chave"
  | "chave_invalida"
  | "limite_api"
  | "sem_credito"
  | "timeout"
  | "bloqueado_seguranca"
  | "vazio"
  | "servidor"
  | "rede"
  | "desconhecido";

export class ErroIA extends Error {
  constructor(
    readonly codigo: CodigoErroIA,
    readonly detalhe?: string,
  ) {
    super(traduzirErroIA(codigo));
    this.name = "ErroIA";
  }
}

export interface OpcoesGeracao {
  /** Teto de custo por chamada. Atenção: inclui os tokens de raciocínio. */
  maxTokens: number;
  temperatura: number;
  /** JSON Schema da resposta. Ver `esquemaSugestao` em `./prompts`. */
  esquema: object;
  timeoutMs?: number;
}

/** Puro. Traduz o status HTTP no nosso código de erro. */
export function mapearStatusHttp(status: number, corpo: string): CodigoErroIA {
  if (status === 401 || status === 403) return "chave_invalida";
  // Cota da conta Google acabou. A doc é explícita: não retentar.
  if (status === 402) return "sem_credito";
  if (status === 429) return "limite_api";
  if (status === 504) return "timeout";
  if (status >= 500) return "servidor";
  // 400 com chave ruim é comum o suficiente para valer a checagem no corpo.
  if (status === 400 && /api.?key/i.test(corpo)) return "chave_invalida";
  return "desconhecido";
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
    input: prompt,
    generation_config: {
      temperature: o.temperatura,
      max_output_tokens: o.maxTokens,
      // A economia principal do desenho: o raciocínio é cobrado como token de saída e
      // não ajuda a escrever título de anúncio. Ver "Economia" no README.
      thinking_level: nivelRaciocinio(modelo),
    },
    response_format: { type: "text", mime_type: "application/json", schema: o.esquema },
  };
}

/**
 * Faz a chamada e devolve o texto cru do modelo. Lança `ErroIA`.
 *
 * Sem retry automático de propósito: retry multiplica o custo e, num erro sistêmico,
 * vira amplificação contra a própria conta. Retentar é clique do usuário em "Gerar outro".
 */
export async function chamarGemini(prompt: string, o: OpcoesGeracao): Promise<string> {
  // Lida DENTRO da função: em escopo de módulo, um import inocente derrubaria o app de
  // quem não usa IA.
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) throw new ErroIA("sem_chave");

  const modelo = process.env.GEMINI_MODEL || MODELO_PADRAO;

  let resposta: Response;
  try {
    resposta = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        // Header, nunca query string: URL vai parar em log de proxy e de erro.
        "x-goog-api-key": chave,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(montarCorpo(prompt, o, modelo)),
      signal: AbortSignal.timeout(o.timeoutMs ?? 12_000),
    });
  } catch (e) {
    const nome = e instanceof Error ? e.name : "";
    throw new ErroIA(nome === "TimeoutError" || nome === "AbortError" ? "timeout" : "rede", nome);
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    // O corpo pode trazer eco do prompt — vai para o log do servidor, nunca para a tela.
    console.error("[ia] http", resposta.status, corpo.slice(0, 300));
    throw new ErroIA(mapearStatusHttp(resposta.status, corpo));
  }

  const json = await resposta.json().catch(() => null);
  return extrairTextoGemini(json);
}

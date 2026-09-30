/**
 * Utilitários de texto compartilhados pelos prompts (produto e tema da vitrine).
 * Funções puras, cobertas pelos testes de `prompts.test.ts`.
 */

/**
 * Normaliza um campo antes de entrar no prompt.
 *
 * Faz três trabalhos ao mesmo tempo: (1) custo — texto colado de marketplace vem com
 * quebra de linha e espaço à toa, e tudo isso é token pago; (2) formato — uma quebra de
 * linha no meio de um valor desalinharia os pares `Rótulo: valor` que o prompt usa;
 * (3) injeção — nome de produto é texto que o usuário colou de algum lugar, então crase
 * (que delimita bloco) e tamanho ilimitado não passam.
 */
export function limparCampo(valor: string | null | undefined, max: number): string | null {
  if (valor == null) return null;
  const limpo = valor.replace(/[`\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  if (limpo.length === 0) return null;
  return limpo.length > max ? `${limpo.slice(0, max).trimEnd()}…` : limpo;
}

/**
 * Monta as linhas `Rótulo: valor` pulando o que for nulo.
 *
 * Campo vazio NÃO vira linha: "Fornecedor: null" no prompt ensina o modelo a inventar um
 * fornecedor, além de custar token por nada.
 */
export function linhas(pares: [string, string | null][]): string {
  return pares
    .filter((par): par is [string, string] => par[1] !== null)
    .map(([rotulo, valor]) => `- ${rotulo}: ${valor}`)
    .join("\n");
}

/**
 * Corta no limite sem partir palavra ao meio.
 *
 * Sem isso, estourar o teto por três caracteres vira `Error("titulo_anuncio: Texto longo
 * demais")` do Zod na hora de salvar — um erro nosso aparecendo como culpa do usuário.
 */
export function truncarEmPalavra(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const ultimoEspaco = corte.lastIndexOf(" ");
  // Se a única palavra já estoura o limite, corta no seco — melhor que devolver vazio.
  return (ultimoEspaco > limite * 0.6 ? corte.slice(0, ultimoEspaco) : corte).trimEnd();
}

/** Tira cerca markdown que alguns modelos colocam mesmo pedindo JSON puro. */
export function tirarCerca(bruto: string): string {
  const comCerca = bruto.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return comCerca ? comCerca[1] : bruto.trim();
}

/** Lê JSON de objeto; qualquer outra coisa (texto cru, array, JSON quebrado) vira `null`. */
export function lerObjetoJson(bruto: string): Record<string, unknown> | null {
  try {
    const dados: unknown = JSON.parse(tirarCerca(bruto));
    return dados && typeof dados === "object" && !Array.isArray(dados) ? (dados as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Impressão digital para chave de cache. FNV-1a em duas passagens com offsets diferentes:
 * determinístico, sem dependência, e roda igual em qualquer runtime — `crypto.createHash`
 * não existe no edge, e o `crypto.subtle` é assíncrono.
 */
export function hashTexto(entrada: string): string {
  return `${fnv1a(entrada, 0x811c9dc5)}${fnv1a(entrada, 0x01000193)}`;
}

function fnv1a(texto: string, semente: number): string {
  let hash = semente;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    // Multiplicação pelo primo FNV em 32 bits, sem estourar para float.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Montagem dos prompts e leitura da resposta do Gemini.
 *
 * Tudo aqui é função PURA, de propósito: é o único jeito de cobrir a parte que mais erra
 * (limite de caracteres, campo nulo virando texto, resposta fora do formato) com o vitest
 * deste repo, que roda em `environment: "node"` e não tem mock de rede.
 *
 * A chamada HTTP mora em `lib/ia/gemini.ts`; a orquestração, em `lib/ia/gerar.ts`.
 */

/** Tetos dos schemas de `lib/validacao.ts`. Gerar acima disso quebra na hora de salvar. */
export const LIMITE_TITULO = 200;
export const LIMITE_DESCRICAO = 2000;

/**
 * Quatro concorrentes bastam para o modelo entender o campo de disputa, e cada um a mais
 * é token pago em toda geração. Ver "Economia" no README.
 */
export const MAX_CONCORRENTES = 4;

export interface ConcorrenteIA {
  nome: string;
  preco: number | null;
}

export interface ContextoIA {
  produtoNome: string;
  sku?: string | null;
  categoria?: string | null;
  fornecedor?: string | null;
  variante?: string | null;
  descricaoAtual?: string | null;
  codigoBarras?: string | null;
  custo?: number | null;
  precoVenda?: number | null;
  canal?: string | null;
  loja?: string | null;
  precoCalculado?: number | null;
  componentes?: { nome: string; quantidade: number }[];
  concorrentes?: ConcorrenteIA[];
  instrucaoExtra?: string | null;
}

export interface SugestaoIA {
  texto: string;
  palavrasChave: string[];
  posicionamento: string | null;
}

/**
 * Normaliza um campo antes de entrar no prompt.
 *
 * Faz três trabalhos ao mesmo tempo: (1) custo — texto colado de marketplace vem com
 * quebra de linha e espaço à toa, e tudo isso é token pago; (2) formato — uma quebra de
 * linha no meio de um valor desalinharia os pares `Rótulo: valor` que o prompt usa;
 * (3) injeção — nome de produto é texto que o usuário colou de algum lugar, então crase
 * (que delimita bloco) e tamanho ilimitado não passam.
 */
function limparCampo(valor: string | null | undefined, max: number): string | null {
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
function linhas(pares: [string, string | null][]): string {
  return pares
    .filter((par): par is [string, string] => par[1] !== null)
    .map(([rotulo, valor]) => `- ${rotulo}: ${valor}`)
    .join("\n");
}

/**
 * Os concorrentes que disputam o mesmo comprador são os de preço parecido com o seu — um
 * concorrente dez vezes mais caro não diz nada sobre como o seu anúncio deveria se
 * posicionar. Sem preço de referência, mantém a ordem de cadastro.
 *
 * Não muta a lista recebida.
 */
export function concorrentesRelevantes(
  lista: ConcorrenteIA[] | undefined,
  precoAlvo: number | null | undefined,
): { nome: string; preco: number | null }[] {
  if (!lista || lista.length === 0) return [];

  const validos = lista.filter((c) => c.nome?.trim());
  const ordenados =
    precoAlvo == null
      ? validos
      : [...validos].sort((a, b) => {
          // Concorrente sem preço vai para o fim: não dá para medir distância.
          if (a.preco == null) return 1;
          if (b.preco == null) return -1;
          return Math.abs(a.preco - precoAlvo) - Math.abs(b.preco - precoAlvo);
        });

  return ordenados.slice(0, MAX_CONCORRENTES).map((c) => ({ nome: c.nome.trim(), preco: c.preco }));
}

/**
 * O LINK do concorrente nunca entra no prompt. Não melhora a resposta (o modelo não abre
 * URL nenhuma aqui) e é o campo mais fácil de usar para injeção — é texto livre que o
 * usuário cola de fora.
 */
function blocoConcorrentes(ctx: ContextoIA): string | null {
  const lista = concorrentesRelevantes(ctx.concorrentes, ctx.precoCalculado ?? ctx.precoVenda);
  if (lista.length === 0) return null;

  const itens = lista
    .map((c) => `- ${limparCampo(c.nome, 80)}${c.preco != null ? ` (R$ ${c.preco.toFixed(2)})` : ""}`)
    .join("\n");

  return `\nAnúncios concorrentes já vendendo algo parecido:\n${itens}`;
}

/** Regras que valem para os dois prompts. Escritas uma vez para não divergirem. */
const REGRAS_COMUNS = [
  "Escreva em português do Brasil.",
  "Use SOMENTE as informações fornecidas. Não invente material, medida, marca, origem, garantia, prazo de entrega ou nota fiscal.",
  "NÃO cite preço, valor, desconto, porcentagem, frete grátis, promoção nem superlativo de preço ('mais barato', 'imperdível').",
  "Não use emoji, hashtag, CAPS LOCK em palavra inteira, markdown nem HTML.",
].join("\n");

export function montarPromptTitulo(ctx: ContextoIA): string {
  const concorrentes = blocoConcorrentes(ctx);

  const contexto = linhas([
    ["Produto", limparCampo(ctx.produtoNome, 200)],
    ["Variação", limparCampo(ctx.variante, 60)],
    ["Categoria", limparCampo(ctx.categoria, 60)],
    ["Marca/fornecedor", limparCampo(ctx.fornecedor, 60)],
    ["SKU", limparCampo(ctx.sku, 40)],
    ["Canal de venda", limparCampo(ctx.canal, 60)],
    ["Itens que acompanham", ctx.componentes?.length ? limparCampo(ctx.componentes.map((c) => `${c.quantidade}x ${c.nome}`).join(", "), 200) : null],
    ["Pedido do vendedor", limparCampo(ctx.instrucaoExtra, 300)],
  ]);

  // O posicionamento só é pedido quando há concorrente cadastrado — sem isso o modelo
  // responderia genérico e teríamos pago tokens por uma frase inútil.
  const pedidoPosicionamento = concorrentes
    ? "\n3. Um POSICIONAMENTO de uma frase: em que ângulo este anúncio deveria se diferenciar do que os concorrentes acima já dizem. Fale de conteúdo do texto, nunca de preço."
    : "";

  return `Você escreve títulos de anúncio para marketplace brasileiro (Shopee).

${contexto}${concorrentes ?? ""}

Gere:
1. Um TÍTULO de no máximo ${LIMITE_TITULO} caracteres. Conte os caracteres antes de responder.
2. Até 10 PALAVRAS-CHAVE de busca, do termo mais buscado para o menos buscado.${pedidoPosicionamento}

Regras do título:
- Estrutura: tipo do produto + marca/modelo + atributo principal + variação/quantidade.
- Comece pelo termo que o comprador digitaria na busca.
- Não repita a mesma palavra.
${REGRAS_COMUNS}`;
}

export function montarPromptDescricao(ctx: ContextoIA): string {
  const contexto = linhas([
    ["Produto", limparCampo(ctx.produtoNome, 200)],
    ["Variação", limparCampo(ctx.variante, 60)],
    ["Categoria", limparCampo(ctx.categoria, 60)],
    ["Marca/fornecedor", limparCampo(ctx.fornecedor, 60)],
    ["Código de barras", limparCampo(ctx.codigoBarras, 20)],
    ["Itens que acompanham", ctx.componentes?.length ? limparCampo(ctx.componentes.map((c) => `${c.quantidade}x ${c.nome}`).join(", "), 300) : null],
    ["Descrição atual (reescreva, não repita)", limparCampo(ctx.descricaoAtual, 600)],
    ["Pedido do vendedor", limparCampo(ctx.instrucaoExtra, 300)],
  ]);

  return `Você escreve descrições de produto para marketplace brasileiro (Shopee).

${contexto}

Gere:
1. Uma DESCRIÇÃO de no máximo ${LIMITE_DESCRICAO} caracteres, em texto corrido com parágrafos curtos separados por uma linha em branco.
2. Até 10 PALAVRAS-CHAVE de busca.

Regras da descrição:
- Fale com o comprador em segunda pessoa.
- Comece pelo que o produto resolve, depois características, depois o que acompanha.
- Texto puro: a loja exibe sem formatação, então marcador, título e link não funcionam.
${REGRAS_COMUNS}`;
}

/**
 * Esquema da resposta estruturada. `posicionamento` fica fora de `required` porque só faz
 * sentido quando há concorrente — pedir obrigatório faria o modelo inventar um.
 */
export function esquemaSugestao(incluirPosicionamento: boolean) {
  return {
    type: "object",
    properties: {
      texto: { type: "string", description: "O título ou a descrição gerada." },
      palavras_chave: { type: "array", items: { type: "string" }, description: "Termos de busca." },
      ...(incluirPosicionamento
        ? { posicionamento: { type: "string", description: "Uma frase sobre como se diferenciar dos concorrentes." } }
        : {}),
    },
    required: ["texto", "palavras_chave"],
  };
}

/**
 * Corta no limite sem partir palavra ao meio.
 *
 * Sem isso, estourar o teto por três caracteres vira `Error("titulo_anuncio: Texto longo
 * demais")` do Zod na hora de salvar — um erro nosso aparecendo como culpa do usuário.
 */
function truncarEmPalavra(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, limite);
  const ultimoEspaco = corte.lastIndexOf(" ");
  // Se a única palavra já estoura o limite, corta no seco — melhor que devolver vazio.
  return (ultimoEspaco > limite * 0.6 ? corte.slice(0, ultimoEspaco) : corte).trimEnd();
}

/** Tira cerca markdown que alguns modelos colocam mesmo pedindo JSON puro. */
function tirarCerca(bruto: string): string {
  const comCerca = bruto.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return comCerca ? comCerca[1] : bruto.trim();
}

/**
 * Lê a resposta do modelo e devolve algo que CABE nos schemas do app.
 *
 * É o cinto de segurança da integração: por mais que o prompt peça JSON e a chamada use
 * saída estruturada, quem garante que o app não quebra é esta função. Resposta fora do
 * formato vira texto puro em vez de erro.
 */
export function interpretarSugestao(bruto: string, limite: number): SugestaoIA {
  const conteudo = tirarCerca(bruto);

  let dados: unknown = null;
  try {
    dados = JSON.parse(conteudo);
  } catch {
    // Não é JSON: trata o corpo inteiro como o texto pedido.
  }

  const obj = dados && typeof dados === "object" && !Array.isArray(dados) ? (dados as Record<string, unknown>) : null;

  const textoBruto = typeof obj?.texto === "string" && obj.texto.trim() ? obj.texto : obj ? "" : conteudo;
  const texto = truncarEmPalavra(textoBruto.replace(/[ \t]{2,}/g, " ").trim(), limite);

  const brutasChave = Array.isArray(obj?.palavras_chave) ? obj.palavras_chave : [];
  const vistas = new Set<string>();
  const palavrasChave: string[] = [];
  for (const item of brutasChave) {
    if (typeof item !== "string") continue;
    const termo = item.replace(/[`\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 40);
    const chave = termo.toLowerCase();
    if (!termo || vistas.has(chave)) continue;
    vistas.add(chave);
    palavrasChave.push(termo);
    if (palavrasChave.length >= 15) break;
  }

  const posBruto = typeof obj?.posicionamento === "string" ? obj.posicionamento.trim() : "";
  const posicionamento = posBruto ? truncarEmPalavra(posBruto, 300) : null;

  return { texto, palavrasChave, posicionamento };
}

/**
 * Impressão digital do contexto, para o cache não pagar duas vezes pela mesma pergunta.
 *
 * FNV-1a em duas passagens com offsets diferentes: determinístico, sem dependência, e
 * roda igual em qualquer runtime — `crypto.createHash` não existe no edge, e o
 * `crypto.subtle` é assíncrono, o que contaminaria a assinatura de tudo que chama isto.
 *
 * Qualquer campo que mude a resposta precisa entrar aqui. `instrucaoExtra` em especial: fora
 * do hash, pedir "foque em público fitness" devolveria a sugestão genérica do cache.
 */
export function hashContexto(ctx: ContextoIA, tipo: "titulo" | "descricao"): string {
  const partes = [
    tipo,
    ctx.produtoNome,
    ctx.sku,
    ctx.categoria,
    ctx.fornecedor,
    ctx.variante,
    ctx.descricaoAtual,
    ctx.codigoBarras,
    ctx.canal,
    ctx.loja,
    ctx.instrucaoExtra,
    ctx.componentes?.map((c) => `${c.quantidade}x${c.nome}`).join("|"),
    concorrentesRelevantes(ctx.concorrentes, ctx.precoCalculado ?? ctx.precoVenda)
      .map((c) => `${c.nome}@${c.preco ?? ""}`)
      .join("|"),
  ];

  // Preço entra arredondado: variar centavo não muda o texto gerado, e sem arredondar o
  // cache erraria em toda recalculada.
  const numeros = [ctx.custo, ctx.precoVenda, ctx.precoCalculado].map((n) => (n == null ? "" : Math.round(n).toString()));

  const entrada = [...partes.map((p) => p ?? ""), ...numeros].join("\u0001");

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

/* ============================================================
 * Tema da vitrine.
 *
 * Contexto e schema PRÓPRIOS, separados de `ContextoIA`/`SugestaoIA`: aqui não se descreve
 * um produto, se descreve uma LOJA, e a saída não é texto — é um punhado de cores em hex
 * mais um nome de fonte. Forçar isso dentro das interfaces de produto criaria campos que
 * não fazem sentido nos dois sentidos.
 * ============================================================ */

/**
 * As únicas fontes que a IA pode escolher. Lista fechada de propósito: a CSP do projeto
 * tem `font-src 'self'` (ver `lib/csp.ts`) — nada de Google Fonts em tempo de execução —
 * então a fonte só pode ser uma das que o build já empacota via `next/font`.
 */
export const FONTES_VITRINE = ["geist", "inter", "lora", "poppins"] as const;
export type FonteVitrine = (typeof FONTES_VITRINE)[number];

export interface ContextoTema {
  descricaoLoja: string;
  nomeNegocio?: string | null;
  instrucaoExtra?: string | null;
}

export interface TemaSugerido {
  corPrimaria: string;
  corFundo: string;
  corSuperficie: string;
  corTexto: string;
  fonte: FonteVitrine;
  titulo: string | null;
  mensagemBoasVindas: string | null;
}

const LIMITE_TITULO_VITRINE = 60;
const LIMITE_MENSAGEM_BOAS_VINDAS = 160;

export function montarPromptTema(ctx: ContextoTema): string {
  const linhasCtx = linhas([
    ["Nome do negócio", limparCampo(ctx.nomeNegocio, 120)],
    ["Descrição da loja (escrita pelo dono)", limparCampo(ctx.descricaoLoja, 500)],
    ["Instrução extra", limparCampo(ctx.instrucaoExtra, 300)],
  ]);

  return [
    "Você é um designer sugerindo a identidade visual de uma vitrine online de e-commerce.",
    "",
    linhasCtx,
    "",
    "Responda em JSON com:",
    "- cor_primaria: hex #RRGGBB. A cor de destaque da marca (botões, preço).",
    "- cor_fundo: hex #RRGGBB. Fundo da página. Deve ser bem claro (quase branco) ou bem",
    "  escuro (quase preto) — nunca um tom médio, que dificulta ler tudo por cima.",
    "- cor_superficie: hex #RRGGBB. Fundo dos cartões de produto, próximo de cor_fundo mas",
    "  perceptivelmente diferente (ex.: branco puro sobre um fundo quase branco).",
    "- cor_texto: hex #RRGGBB. Cor do texto principal — próxima do preto sobre fundo claro,",
    "  ou próxima do branco sobre fundo escuro. NÃO precisa já ter contraste perfeito: o",
    "  sistema ajusta a luminosidade automaticamente depois.",
    `- fonte: uma destas palavras, exatamente: ${FONTES_VITRINE.join(", ")}.`,
    `- titulo: um título curto para o topo da vitrine (até ${LIMITE_TITULO_VITRINE} caracteres). Pode ser null.`,
    `- mensagem_boas_vindas: uma frase de boas-vindas (até ${LIMITE_MENSAGEM_BOAS_VINDAS} caracteres). Pode ser null.`,
    "",
    "Regras:",
    "- As quatro cores precisam ser coerentes entre si (mesma família, tema claro OU escuro).",
    "- Não use preto puro (#000000) nem branco puro (#ffffff) para cor_texto — prefira tons",
    "  bem próximos, para o resultado não ficar duro.",
    "- Nunca cite preço, desconto ou concorrente.",
    "- Responda só o JSON, sem comentário fora dele.",
  ].join("\n");
}

export function esquemaTema() {
  return {
    type: "object",
    properties: {
      cor_primaria: { type: "string" },
      cor_fundo: { type: "string" },
      cor_superficie: { type: "string" },
      cor_texto: { type: "string" },
      fonte: { type: "string", enum: [...FONTES_VITRINE] },
      titulo: { type: ["string", "null"] },
      mensagem_boas_vindas: { type: ["string", "null"] },
    },
    required: ["cor_primaria", "cor_fundo", "cor_superficie", "cor_texto", "fonte"],
  };
}

const HEX_VALIDO = /^#[0-9a-fA-F]{6}$/;

/** Hex já validado, ou o `reserva` se vier fora do formato — a IA erra formato às vezes. */
function corOuReserva(valor: unknown, reserva: string): string {
  return typeof valor === "string" && HEX_VALIDO.test(valor.trim()) ? valor.trim().toLowerCase() : reserva;
}

/**
 * Lê a resposta do modelo e devolve algo que o app pode aplicar sem medo.
 *
 * Nunca lança: uma cor fora do formato cai numa cor neutra de reserva, e uma fonte fora da
 * lista fechada cai em "geist" — a mesma fonte que o resto do sistema já usa. Quem garante
 * que o RESULTADO final é legível é `derivarTokens`/`ajustarParaContraste` em
 * `lib/cores.ts`, chamado depois desta função; aqui só se garante o FORMATO.
 */
export function interpretarTema(bruto: string): TemaSugerido {
  const conteudo = tirarCerca(bruto);
  let dados: unknown = null;
  try {
    dados = JSON.parse(conteudo);
  } catch {
    dados = null;
  }
  const obj = dados && typeof dados === "object" && !Array.isArray(dados) ? (dados as Record<string, unknown>) : {};

  const fonte = FONTES_VITRINE.includes(obj.fonte as FonteVitrine) ? (obj.fonte as FonteVitrine) : "geist";
  const titulo = typeof obj.titulo === "string" && obj.titulo.trim() ? truncarEmPalavra(obj.titulo.trim(), LIMITE_TITULO_VITRINE) : null;
  const mensagemBoasVindas =
    typeof obj.mensagem_boas_vindas === "string" && obj.mensagem_boas_vindas.trim()
      ? truncarEmPalavra(obj.mensagem_boas_vindas.trim(), LIMITE_MENSAGEM_BOAS_VINDAS)
      : null;

  return {
    corPrimaria: corOuReserva(obj.cor_primaria, "#3b4d1f"),
    corFundo: corOuReserva(obj.cor_fundo, "#fafafa"),
    corSuperficie: corOuReserva(obj.cor_superficie, "#ffffff"),
    corTexto: corOuReserva(obj.cor_texto, "#18181b"),
    fonte,
    titulo,
    mensagemBoasVindas,
  };
}

export function hashContextoTema(ctx: ContextoTema): string {
  const entrada = ["tema", ctx.descricaoLoja, ctx.nomeNegocio ?? "", ctx.instrucaoExtra ?? ""].join("\u0001");
  return `${fnv1a(entrada, 0x811c9dc5)}${fnv1a(entrada, 0x01000193)}`;
}

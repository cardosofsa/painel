/**
 * Montagem dos prompts de TEXTO DE PRODUTO (título e descrição) e leitura da resposta.
 *
 * Tudo aqui é função PURA, de propósito: é o único jeito de cobrir a parte que mais erra
 * (limite de caracteres, campo nulo virando texto, resposta fora do formato) com o vitest
 * deste repo, que roda em `environment: "node"` e não tem mock de rede.
 *
 * O tema da vitrine mora em `prompts-tema.ts`; a chamada HTTP, em `provedores/`; a
 * orquestração, em `gerar.ts`.
 */

import { hashTexto, lerObjetoJson, limparCampo, linhas, tirarCerca, truncarEmPalavra } from "./texto";

// O tema continua importável daqui: telas e testes antigos não precisam saber da divisão.
export * from "./prompts-tema";

/** Teto do título: é o do schema de `titulo_anuncio`. O canal pode apertar, nunca alargar. */
export const LIMITE_TITULO = 200;
/** Teto da descrição do PRODUTO (a que aparece na vitrine). */
export const LIMITE_DESCRICAO = 2000;
/** Teto da descrição do ANÚNCIO (precificação), migração 0037. */
export const LIMITE_DESCRICAO_ANUNCIO = 5000;

/** Quantas opções de título cada geração devolve: custam a mesma chamada. */
export const OPCOES_TITULO = 3;

/**
 * Quatro concorrentes bastam para o modelo entender o campo de disputa, e cada um a mais
 * é token pago em toda geração.
 */
export const MAX_CONCORRENTES = 4;

export const TONS = {
  padrao: { rotulo: "Padrão", instrucao: null },
  tecnico: {
    rotulo: "Técnico",
    instrucao: "Tom técnico: priorize especificações, medidas e materiais que foram informados; frases objetivas.",
  },
  premium: {
    rotulo: "Premium",
    instrucao: "Tom premium: vocabulário elegante, destaque qualidade e acabamento, sem exagero nem superlativo vazio.",
  },
  descontraido: {
    rotulo: "Descontraído",
    instrucao: "Tom descontraído: linguagem próxima e leve, como quem conversa com o cliente, sem gíria pesada.",
  },
} as const;
export type Tom = keyof typeof TONS;

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
  /** Nomes das variações do anúncio (cor, tamanho...). */
  variacoes?: string[];
  concorrentes?: ConcorrenteIA[];
  /** Garantia do produto em dias. Ausente = o texto NÃO pode falar de garantia. */
  garantiaDias?: number | null;
  /** Palavras-chave já guardadas no produto, para reaproveitar. */
  palavrasChave?: string[];
  /** Limite de caracteres do campo de destino (o do canal, quando houver). */
  limite?: number | null;
  tom?: Tom | null;
  instrucaoExtra?: string | null;
}

export interface SugestaoIA {
  /** A primeira opção — é a que vai para o campo se a pessoa só clicar "Usar". */
  texto: string;
  /** Título: até 3 opções. Descrição: uma só (igual a `texto`). */
  opcoes: string[];
  palavrasChave: string[];
  posicionamento: string | null;
}

/**
 * Limite que vale de verdade: o do canal, mas nunca acima do teto do app (o que passasse
 * disso quebraria na hora de salvar) nem abaixo de 20 (título de 5 letras não é título).
 */
export function limiteEfetivo(tipo: "titulo" | "descricao", pedido: number | null | undefined): number {
  const teto = tipo === "titulo" ? LIMITE_TITULO : LIMITE_DESCRICAO_ANUNCIO;
  const padrao = tipo === "titulo" ? LIMITE_TITULO : LIMITE_DESCRICAO;
  if (pedido == null || !Number.isFinite(pedido)) return padrao;
  return Math.max(20, Math.min(teto, Math.floor(pedido)));
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

function listaCurta(itens: string[] | undefined, max: number): string | null {
  if (!itens?.length) return null;
  return limparCampo(itens.filter((i) => i.trim()).join(", "), max);
}

function textoGarantia(dias: number | null | undefined): string | null {
  if (!dias || dias <= 0) return null;
  if (dias % 365 === 0) return `${dias / 365} ${dias === 365 ? "ano" : "anos"}`;
  if (dias % 30 === 0) return `${dias / 30} ${dias === 30 ? "mês" : "meses"}`;
  return `${dias} dias`;
}

/** Destino do texto: o canal cadastrado ou, sem ele, marketplace genérico. */
function destino(ctx: ContextoIA): string {
  const canal = limparCampo(ctx.canal, 60);
  return canal ? `marketplace brasileiro (${canal})` : "marketplace brasileiro";
}

/** Regras que valem para os dois prompts. Escritas uma vez para não divergirem. */
const REGRAS_COMUNS = [
  "Escreva em português do Brasil.",
  "Use SOMENTE as informações fornecidas. Não invente material, medida, marca, origem, garantia, prazo de entrega ou nota fiscal.",
  "NÃO cite preço, valor, desconto, porcentagem, frete grátis, promoção nem superlativo de preço ('mais barato', 'imperdível').",
].join("\n");

function linhaTom(tom: Tom | null | undefined): string {
  const instrucao = tom ? TONS[tom]?.instrucao : null;
  return instrucao ? `\n${instrucao}` : "";
}

export function montarPromptTitulo(ctx: ContextoIA): string {
  const concorrentes = blocoConcorrentes(ctx);
  const limite = limiteEfetivo("titulo", ctx.limite);

  const contexto = linhas([
    ["Produto", limparCampo(ctx.produtoNome, 200)],
    ["Variação", limparCampo(ctx.variante, 60)],
    ["Variações do anúncio", listaCurta(ctx.variacoes, 200)],
    ["Categoria", limparCampo(ctx.categoria, 60)],
    ["Marca/fornecedor", limparCampo(ctx.fornecedor, 60)],
    ["SKU", limparCampo(ctx.sku, 40)],
    ["Itens que acompanham", ctx.componentes?.length ? limparCampo(ctx.componentes.map((c) => `${c.quantidade}x ${c.nome}`).join(", "), 200) : null],
    ["Palavras-chave que o vendedor já usa", listaCurta(ctx.palavrasChave, 200)],
    ["Pedido do vendedor", limparCampo(ctx.instrucaoExtra, 300)],
  ]);

  // O posicionamento só é pedido quando há concorrente cadastrado — sem isso o modelo
  // responderia genérico e teríamos pago tokens por uma frase inútil.
  const pedidoPosicionamento = concorrentes
    ? "\n3. Um POSICIONAMENTO de uma frase: em que ângulo este anúncio deveria se diferenciar do que os concorrentes acima já dizem. Fale de conteúdo do texto, nunca de preço."
    : "";

  return `Você escreve títulos de anúncio para ${destino(ctx)}.

${contexto}${concorrentes ?? ""}

Gere:
1. ${OPCOES_TITULO} OPÇÕES de título diferentes entre si, cada uma com no máximo ${limite} caracteres. Conte os caracteres antes de responder. A 1ª foca no termo de busca mais forte; a 2ª, no atributo ou benefício principal; a 3ª, na variação, quantidade ou kit.
2. Até 10 PALAVRAS-CHAVE de busca, do termo mais buscado para o menos buscado.${pedidoPosicionamento}

Regras do título:
- Estrutura: tipo do produto + marca/modelo + atributo principal + variação/quantidade.
- Comece pelo termo que o comprador digitaria na busca.
- Aproveite o espaço disponível, sem encher linguiça.
- Não repita a mesma palavra.
- Não use emoji, hashtag, CAPS LOCK em palavra inteira, markdown nem HTML.
${REGRAS_COMUNS}${linhaTom(ctx.tom)}`;
}

export function montarPromptDescricao(ctx: ContextoIA): string {
  const limite = limiteEfetivo("descricao", ctx.limite);
  const garantia = textoGarantia(ctx.garantiaDias);
  const acompanha = ctx.componentes?.length
    ? limparCampo(ctx.componentes.map((c) => `${c.quantidade}x ${c.nome}`).join(", "), 300)
    : null;

  const contexto = linhas([
    ["Produto", limparCampo(ctx.produtoNome, 200)],
    ["Variação", limparCampo(ctx.variante, 60)],
    ["Variações do anúncio", listaCurta(ctx.variacoes, 300)],
    ["Categoria", limparCampo(ctx.categoria, 60)],
    ["Marca/fornecedor", limparCampo(ctx.fornecedor, 60)],
    ["Código de barras", limparCampo(ctx.codigoBarras, 20)],
    ["Itens que acompanham", acompanha],
    ["Garantia", garantia],
    ["Palavras-chave que o vendedor já usa", listaCurta(ctx.palavrasChave, 200)],
    ["Descrição atual (reescreva, não repita)", limparCampo(ctx.descricaoAtual, 600)],
    ["Pedido do vendedor", limparCampo(ctx.instrucaoExtra, 300)],
  ]);

  // Cada seção só existe se houver dado para ela: seção vazia ensina o modelo a inventar.
  const secoes = [
    "- Um parágrafo de abertura (2 a 3 frases): o que é e o que resolve para o comprador.",
    '- "Benefícios:" com 3 a 5 linhas começando por "- ".',
    '- "Especificações:" com linhas começando por "- ", só com dados informados acima (omita a seção se não houver nenhum).',
    ctx.variacoes?.length ? '- "Opções disponíveis:" listando as variações.' : null,
    acompanha ? '- "O que acompanha:" listando os itens.' : null,
    garantia ? `- "Garantia:" uma linha dizendo que o produto tem garantia de ${garantia}.` : null,
  ].filter(Boolean);

  return `Você escreve descrições de produto para ${destino(ctx)}.

${contexto}

Gere:
1. Uma DESCRIÇÃO de no máximo ${limite} caracteres, organizada nestas seções, nesta ordem, separadas por uma linha em branco:
${secoes.join("\n")}
2. Até 10 PALAVRAS-CHAVE de busca.

Regras da descrição:
- Fale com o comprador em segunda pessoa.
- Texto puro: sem markdown (asterisco, #, negrito), sem HTML, sem emoji e sem link. Listas só com hífen no começo da linha.
${garantia ? "" : "- O produto NÃO tem garantia informada: não fale de garantia.\n"}${REGRAS_COMUNS}${linhaTom(ctx.tom)}`;
}

/**
 * Esquema da resposta estruturada. `posicionamento` fica fora de `required` porque só faz
 * sentido quando há concorrente — pedir obrigatório faria o modelo inventar um.
 */
export function esquemaSugestao(tipo: "titulo" | "descricao", incluirPosicionamento: boolean) {
  const principal =
    tipo === "titulo"
      ? { opcoes: { type: "array", items: { type: "string" }, description: `${OPCOES_TITULO} opções de título.` } }
      : { texto: { type: "string", description: "A descrição gerada." } };
  return {
    type: "object",
    properties: {
      ...principal,
      palavras_chave: { type: "array", items: { type: "string" }, description: "Termos de busca." },
      ...(incluirPosicionamento
        ? { posicionamento: { type: "string", description: "Uma frase sobre como se diferenciar dos concorrentes." } }
        : {}),
    },
    required: [tipo === "titulo" ? "opcoes" : "texto", "palavras_chave"],
  };
}

/** Título é uma linha só: quebra de linha vira espaço, espaço duplo some. */
function limparTitulo(texto: string, limite: number): string {
  return truncarEmPalavra(texto.replace(/\s+/g, " ").trim(), limite);
}

/**
 * Lê a resposta do modelo e devolve algo que CABE nos schemas do app.
 *
 * É o cinto de segurança da integração: por mais que o prompt peça JSON e a chamada use
 * saída estruturada, quem garante que o app não quebra é esta função. Resposta fora do
 * formato vira texto puro em vez de erro. Aceita tanto `opcoes` (título, 7.4) quanto
 * `texto` (descrição, e título de modelo que ignorou o esquema).
 */
export function interpretarSugestao(bruto: string, limite: number, tipo: "titulo" | "descricao" = "descricao"): SugestaoIA {
  const obj = lerObjetoJson(bruto);

  let opcoes: string[];
  if (tipo === "titulo") {
    const brutas = Array.isArray(obj?.opcoes) ? obj.opcoes : [];
    const candidatas = brutas.filter((o): o is string => typeof o === "string");
    if (candidatas.length === 0) {
      const unico = typeof obj?.texto === "string" ? obj.texto : obj ? "" : tirarCerca(bruto);
      candidatas.push(unico);
    }
    const vistas = new Set<string>();
    opcoes = [];
    for (const c of candidatas) {
      const t = limparTitulo(c, limite);
      if (!t || vistas.has(t.toLowerCase())) continue;
      vistas.add(t.toLowerCase());
      opcoes.push(t);
      if (opcoes.length >= OPCOES_TITULO) break;
    }
  } else {
    const textoBruto = typeof obj?.texto === "string" && obj.texto.trim() ? obj.texto : obj ? "" : tirarCerca(bruto);
    const texto = truncarEmPalavra(
      textoBruto
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
      limite,
    );
    opcoes = texto ? [texto] : [];
  }

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

  return { texto: opcoes[0] ?? "", opcoes, palavrasChave, posicionamento };
}

/**
 * O cache guarda um texto só por sugestão. Para o título, as opções vão juntas numa linha
 * cada — seguro porque `limparTitulo` já tirou toda quebra de linha de dentro delas.
 */
export function empacotarOpcoes(opcoes: string[]): string {
  return opcoes.join("\n");
}

export function desempacotarOpcoes(texto: string, tipo: "titulo" | "descricao"): string[] {
  if (tipo === "descricao") return texto ? [texto] : [];
  return texto
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Impressão digital do contexto, para o cache não pagar duas vezes pela mesma pergunta.
 *
 * Qualquer campo que mude a resposta precisa entrar aqui. `instrucaoExtra` em especial: fora
 * do hash, pedir "foque em público fitness" devolveria a sugestão genérica do cache. O
 * prefixo `v2` separa o cache das sugestões de antes da 7.4 (título único, sem seções).
 */
export function hashContexto(ctx: ContextoIA, tipo: "titulo" | "descricao"): string {
  const partes = [
    "v2",
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
    ctx.tom ?? "padrao",
    String(limiteEfetivo(tipo, ctx.limite)),
    ctx.garantiaDias == null ? "" : String(ctx.garantiaDias),
    ctx.variacoes?.join("|"),
    ctx.palavrasChave?.join("|"),
    ctx.componentes?.map((c) => `${c.quantidade}x${c.nome}`).join("|"),
    concorrentesRelevantes(ctx.concorrentes, ctx.precoCalculado ?? ctx.precoVenda)
      .map((c) => `${c.nome}@${c.preco ?? ""}`)
      .join("|"),
  ];

  // Preço entra arredondado: variar centavo não muda o texto gerado, e sem arredondar o
  // cache erraria em toda recalculada.
  const numeros = [ctx.custo, ctx.precoVenda, ctx.precoCalculado].map((n) => (n == null ? "" : Math.round(n).toString()));

  return hashTexto([...partes.map((p) => p ?? ""), ...numeros].join("\u0001"));
}

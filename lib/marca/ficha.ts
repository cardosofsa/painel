/**
 * Ficha de Direção de Arte: o jeito que a loja quer aparecer, em campos estruturados.
 * PURO, coberto por `ficha.test.ts`. Nada aqui assume nicho ou plataforma: o que for
 * específico vem do perfil do usuário, nunca do código.
 *
 * A IA só PROPÕE uma ficha (ou uma mudança); quem decide é o usuário, e cada versão aprovada
 * fica guardada (tabela `marca_fichas`, 0098) para voltar atrás.
 */

import { fichaSchema, TIPOS_IMAGEM_MARCA, type FichaMarca } from "@/lib/validacao";

export type { FichaMarca };
export type TipoImagemMarca = (typeof TIPOS_IMAGEM_MARCA)[number];

export const ROTULO_TIPO_IMAGEM: Record<TipoImagemMarca, string> = {
  geral: "Regras gerais (todas as imagens)",
  capa_1: "Capa 1 (a que aparece na busca)",
  capa_2: "Capa 2 (informativa)",
  detalhe: "Detalhes do produto",
  beneficios: "Benefícios e diferenciais",
  uso: "Como usar",
  composicao: "Composição e rótulos",
  faq: "Dúvidas frequentes",
};

export const ROTULO_CAMPO: Record<keyof FichaMarca, string> = {
  fundo: "Fundo",
  luz: "Luz",
  enquadramento: "Enquadramento do produto",
  areaProdutoMinPct: "Área mínima do produto (%)",
  paleta: "Paleta de cores",
  tipografia: "Tipografia",
  tituloMaxPalavras: "Palavras no título da imagem (máx.)",
  selos: "Selos e diferenciais",
  faixaInferior: "Faixa inferior",
  logoPosicao: "Posição da logo",
  logoLarguraPct: "Largura da logo (%)",
  pessoas: "Pessoas na imagem",
  proibicoes: "O que nunca aparece",
  tom: "Tom",
  numeroImagens: "Quantidade de imagens",
  observacoes: "Observações",
};

export const ROTULO_POSICAO_LOGO: Record<NonNullable<FichaMarca["logoPosicao"]>, string> = {
  inferior_direito: "Canto inferior direito",
  inferior_esquerdo: "Canto inferior esquerdo",
  superior_direito: "Canto superior direito",
  superior_esquerdo: "Canto superior esquerdo",
  nenhuma: "Sem logo",
};

export const ROTULO_PESSOAS = { nao: "Nunca", opcional: "Opcional, pequena", sim: "Sim" } as const;

/** Ponto de partida neutro: serve a qualquer loja e é só um começo para o usuário ajustar. */
export const FICHA_PADRAO: FichaMarca = {
  areaProdutoMinPct: 40,
  tituloMaxPalavras: 5,
  logoPosicao: "inferior_direito",
  logoLarguraPct: 10,
  pessoas: "opcional",
};

const CAMPOS = Object.keys(fichaSchema.shape) as (keyof FichaMarca)[];

const vazio = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * Limpa uma ficha vinda da IA (ou de qualquer lugar): mantém campo a campo o que é válido e
 * descarta o resto, sem lançar. Texto fora do tamanho é cortado em vez de perdido.
 */
export function normalizarFicha(entrada: unknown): FichaMarca {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return {};
  const bruto = entrada as Record<string, unknown>;
  const saida: Record<string, unknown> = {};
  for (const campo of CAMPOS) {
    let v = bruto[campo];
    if (vazio(v)) continue;
    // Texto longo demais vira texto cortado, não campo perdido.
    if (typeof v === "string") v = cortar(v, limiteTexto(campo));
    if (Array.isArray(v)) v = limparLista(campo, v);
    const r = fichaSchema.shape[campo].safeParse(v);
    if (r.success && !vazio(r.data)) saida[campo] = r.data;
  }
  return saida as FichaMarca;
}

function limiteTexto(campo: keyof FichaMarca): number {
  return campo === "observacoes" ? 400 : campo === "enquadramento" ? 160 : 120;
}

const cortar = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max).trimEnd() : t;
};

function limparLista(campo: keyof FichaMarca, lista: unknown[]): unknown[] {
  const max = campo === "paleta" ? 6 : campo === "selos" ? 4 : 15;
  const tam = campo === "selos" ? 40 : 100;
  const itens = lista
    .filter((x): x is string => typeof x === "string")
    .map((x) => (campo === "paleta" ? x.trim() : cortar(x, tam)))
    // Um item ruim não derruba a lista inteira: cor fora do formato #RRGGBB sai sozinha.
    .filter((x) => (campo === "paleta" ? /^#[0-9a-fA-F]{6}$/.test(x) : x.length > 0));
  return [...new Set(itens)].slice(0, max);
}

/** `proposta` por cima de `base`: só os campos que a proposta preencheu mudam. */
export function mesclarFicha(base: FichaMarca, proposta: FichaMarca): FichaMarca {
  return normalizarFicha({ ...base, ...Object.fromEntries(Object.entries(proposta).filter(([, v]) => !vazio(v))) });
}

export interface DiferencaFicha {
  campo: keyof FichaMarca;
  rotulo: string;
  de: string;
  para: string;
}

/** Texto curto de um valor para a tela de revisão. */
export function valorLegivel(campo: keyof FichaMarca, v: unknown): string {
  if (vazio(v)) return "—";
  if (campo === "logoPosicao") return ROTULO_POSICAO_LOGO[v as keyof typeof ROTULO_POSICAO_LOGO] ?? String(v);
  if (campo === "pessoas") return ROTULO_PESSOAS[v as keyof typeof ROTULO_PESSOAS] ?? String(v);
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

/** O que muda de `antes` para `depois`, campo a campo (para o usuário aprovar a mudança). */
export function diferencasFicha(antes: FichaMarca, depois: FichaMarca): DiferencaFicha[] {
  const saida: DiferencaFicha[] = [];
  for (const campo of CAMPOS) {
    const a = valorLegivel(campo, antes[campo]);
    const d = valorLegivel(campo, depois[campo]);
    if (a !== d) saida.push({ campo, rotulo: ROTULO_CAMPO[campo], de: a, para: d });
  }
  return saida;
}

/**
 * A ficha como bloco de texto para os prompts de geração (título e imagens). Campo vazio
 * não vira linha: "Fundo: —" ensinaria o modelo a inventar um fundo.
 */
export function fichaParaPrompt(ficha: FichaMarca, tipo: TipoImagemMarca): string {
  const linhas: [string, string][] = [];
  for (const campo of CAMPOS) {
    const v = ficha[campo];
    if (vazio(v)) continue;
    if (campo === "areaProdutoMinPct") linhas.push([ROTULO_CAMPO[campo], `pelo menos ${v}% da imagem`]);
    else if (campo === "logoLarguraPct") linhas.push([ROTULO_CAMPO[campo], `${v}% da largura da imagem`]);
    else linhas.push([ROTULO_CAMPO[campo], valorLegivel(campo, v)]);
  }
  if (linhas.length === 0) return "";
  return [`Padrão visual da loja — ${ROTULO_TIPO_IMAGEM[tipo]}:`, ...linhas.map(([r, v]) => `- ${r}: ${v}`)].join("\n");
}

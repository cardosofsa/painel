/**
 * Verificação de termos que o usuário não quer (ou que a plataforma costuma barrar) em textos
 * e em textos de imagem. PURO, coberto por `termos.test.ts`.
 *
 * Primeira barreira, não parecer jurídico: ela acha palavra e padrão. Quem decide é o usuário,
 * e as regras específicas de cada nicho NÃO moram aqui — são presets opcionais que ele liga, e
 * os termos dele (`perfis_marca.termos_proibidos`). Isto é uma conferência automática; a
 * revisão final continua sendo humana.
 */

export type EscopoTermo = "texto" | "imagem" | "ambos";
export type GravidadeTermo = "bloquear" | "revisar";

export interface RegraTermo {
  termo: string;
  escopo: EscopoTermo;
  gravidade: GravidadeTermo;
  motivo: string;
  origem: "base" | "preset" | "usuario";
  /** Padrão em vez de palavra (ex.: telefone). */
  padrao?: RegExp;
}

export interface Preset {
  id: string;
  nome: string;
  descricao: string;
  termos: string[];
  motivo: string;
}

const base = (termo: string, escopo: EscopoTermo, motivo: string): RegraTermo => ({ termo, escopo, gravidade: "bloquear", motivo, origem: "base" });

/** Regras que valem para qualquer loja, de qualquer nicho: preço/promoção na imagem e dados de contato. */
export const REGRAS_BASE: RegraTermo[] = [
  base("frete grátis", "imagem", "Promoção e frete na imagem costumam ser barrados"),
  base("promoção", "imagem", "Promoção na imagem costuma ser barrada"),
  base("oferta", "imagem", "Oferta na imagem costuma ser barrada"),
  base("desconto", "imagem", "Desconto na imagem costuma ser barrado"),
  base("cupom", "imagem", "Cupom na imagem costuma ser barrado"),
  base("mais vendido", "ambos", "Afirmação de ranking sem comprovação"),
  base("melhor do brasil", "ambos", "Superlativo sem comprovação"),
  base("whatsapp", "ambos", "Contato fora da plataforma"),
  base("zap", "ambos", "Contato fora da plataforma"),
  base("instagram", "ambos", "Contato fora da plataforma"),
  base("telefone", "ambos", "Contato fora da plataforma"),
  { termo: "telefone no texto", escopo: "ambos", gravidade: "revisar", motivo: "Contato fora da plataforma", origem: "base", padrao: /(?:\(?\b\d{2}\)?[\s.-]?)?\b9?\d{4}[\s.-]?\d{4}\b/ },
  { termo: "link", escopo: "ambos", gravidade: "bloquear", motivo: "Link externo", origem: "base", padrao: /\bhttps?:\/\/|\bwww\./i },
];

/** Conjuntos opcionais: o usuário liga o que faz sentido para o que ele vende. */
export const PRESETS: Preset[] = [
  {
    id: "saude",
    nome: "Alegações de saúde e emagrecimento",
    descricao: "Para quem vende alimentos, suplementos, chás ou cosméticos: palavras que prometem efeito no corpo.",
    motivo: "Alegação de saúde ou de efeito no corpo",
    termos: [
      "trata", "tratamento", "cura", "previne", "controla", "combate", "detox", "desintoxica", "emagrece", "emagrecer", "emagrecimento",
      "regula", "baixa pressão", "queima gordura", "seca barriga", "desincha", "diurético", "anti-inflamatório",
    ],
  },
];

export function presetPorId(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** Os termos de um perfil de marca (0103): presets ligados e as duas listas do usuário. */
export interface TermosDoPerfil {
  presets: string[];
  /** Os termos dos presets ligados só pedem revisão ou bloqueiam. */
  presetsGravidade: GravidadeTermo;
  /** `perfis_marca.termos_proibidos`: pedem revisão. */
  revisar: string[];
  /** `perfis_marca.termos_bloqueados`: bloqueiam (o título não vai para o anúncio nem para a Shopee). */
  bloquear: string[];
}

export const TERMOS_VAZIOS: TermosDoPerfil = { presets: [], presetsGravidade: "revisar", revisar: [], bloquear: [] };

const listaDeTextos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Lê a linha de `perfis_marca` sem confiar nela: antes da 0103 as colunas novas não vêm. */
export function termosDoPerfil(linha: { presets?: unknown; presets_gravidade?: unknown; termos_proibidos?: unknown; termos_bloqueados?: unknown } | null | undefined): TermosDoPerfil {
  if (!linha) return TERMOS_VAZIOS;
  return {
    presets: listaDeTextos(linha.presets).filter((id) => presetPorId(id)),
    presetsGravidade: linha.presets_gravidade === "bloquear" ? "bloquear" : "revisar",
    revisar: listaDeTextos(linha.termos_proibidos),
    bloquear: listaDeTextos(linha.termos_bloqueados),
  };
}

/** Tudo o que a IA deve evitar: os termos do usuário (as duas listas) e os dos presets ligados. */
export function termosParaEvitar(t: TermosDoPerfil | null | undefined): string[] {
  if (!t) return [];
  const todos = [...t.bloquear, ...t.revisar, ...t.presets.flatMap((id) => presetPorId(id)?.termos ?? [])];
  return [...new Map(todos.map((x) => [normalizar(x.trim()), x.trim()])).values()].filter((x) => x.length >= 2);
}

/**
 * Regras em vigor: as da base, as dos presets ligados e os termos do próprio usuário. Um termo
 * repetido vale pela primeira regra (a conferência não repete o mesmo termo no mesmo campo),
 * então o que bloqueia entra antes do que só pede revisão.
 */
export function regrasAtivas(
  presetsLigados: readonly string[],
  termosDoUsuario: readonly string[],
  opcoes: { presetsGravidade?: GravidadeTermo; bloquear?: readonly string[] } = {},
): RegraTermo[] {
  const regras = [...REGRAS_BASE];
  const doUsuario = (lista: readonly string[], gravidade: GravidadeTermo, motivo: string) => {
    for (const t of lista) {
      const termo = t.trim();
      if (termo.length >= 2) regras.push({ termo, escopo: "ambos", gravidade, motivo, origem: "usuario" });
    }
  };
  doUsuario(opcoes.bloquear ?? [], "bloquear", "Termo que você marcou para bloquear");
  const gravidadePreset = opcoes.presetsGravidade ?? "revisar";
  for (const id of presetsLigados) {
    const p = presetPorId(id);
    if (p) regras.push(...p.termos.map((termo): RegraTermo => ({ termo, escopo: "ambos", gravidade: gravidadePreset, motivo: p.motivo, origem: "preset" })));
  }
  doUsuario(termosDoUsuario, "revisar", "Termo que você marcou como proibido");
  return regras;
}

/** As regras de um perfil (ou só as da base, sem perfil). */
export function regrasDoPerfil(t: TermosDoPerfil | null | undefined): RegraTermo[] {
  const x = t ?? TERMOS_VAZIOS;
  return regrasAtivas(x.presets, x.revisar, { presetsGravidade: x.presetsGravidade, bloquear: x.bloquear });
}

export interface ItemTexto {
  /** Onde o texto aparece ("Título", "Texto da capa 1"...). */
  campo: string;
  texto: string;
  tipo: "texto" | "imagem";
}

export interface Violacao {
  campo: string;
  termo: string;
  trecho: string;
  gravidade: GravidadeTermo;
  motivo: string;
  origem: RegraTermo["origem"];
}

/** Minúsculas e sem acento, para "PROMOÇÃO" e "promocao" serem a mesma coisa. */
export function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Palavra inteira: "cura" acha "cura", não "curado" nem "procura". */
function regexDoTermo(termo: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${escapar(normalizar(termo)).replace(/\s+/g, "\\s+")}(?=$|[^a-z0-9])`, "i");
}

export function verificarTextos(itens: readonly ItemTexto[], regras: readonly RegraTermo[]): Violacao[] {
  const saida: Violacao[] = [];
  const vistos = new Set<string>();
  for (const item of itens) {
    const alvo = normalizar(item.texto);
    if (!alvo.trim()) continue;
    for (const r of regras) {
      if (r.escopo !== "ambos" && r.escopo !== item.tipo) continue;
      const m = r.padrao ? item.texto.match(r.padrao) : alvo.match(regexDoTermo(r.termo));
      if (!m) continue;
      const chave = `${item.campo}|${normalizar(r.termo)}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      saida.push({ campo: item.campo, termo: r.termo, trecho: r.padrao ? m[0].trim() : trechoAoRedor(item.texto, alvo, m), gravidade: r.gravidade, motivo: r.motivo, origem: r.origem });
    }
  }
  // Bloqueios primeiro.
  return saida.sort((a, b) => Number(b.gravidade === "bloquear") - Number(a.gravidade === "bloquear"));
}

function trechoAoRedor(original: string, normalizado: string, m: RegExpMatchArray): string {
  const ini = (m.index ?? 0) + (m[1]?.length ?? 0);
  const fim = ini + (m[0].length - (m[1]?.length ?? 0));
  // `normalizar` só remove marcas de acento, então os índices do original e do normalizado coincidem na maioria dos casos.
  const a = Math.max(0, ini - 15);
  const b = Math.min(original.length, fim + 15);
  return `${a > 0 ? "…" : ""}${original.slice(a, b).trim()}${b < original.length ? "…" : ""}`.replace(/\s+/g, " ");
}

export const temBloqueio = (v: readonly Violacao[]) => v.some((x) => x.gravidade === "bloquear");

/**
 * Prompt, esquema e leitura da resposta do VIXE PREÇO.
 *
 * A IA não calcula nada: recebe margem, taxas, zona morta e concorrência já prontos
 * (`lib/vixe/preco.ts`) e devolve diagnóstico e estratégias. O preço que ela sugerir é
 * recalculado na tela pelas mesmas funções, nunca exibido com a conta dela.
 */

import { hashTexto, lerObjetoJson, limparCampo, linhas, truncarEmPalavra } from "./texto";

export const TIPOS_ESTRATEGIA = ["preco", "cupom", "ads", "kit", "frete", "posicionamento"] as const;
export type TipoEstrategia = (typeof TIPOS_ESTRATEGIA)[number];

export const ROTULO_ESTRATEGIA: Record<TipoEstrategia, string> = {
  preco: "Preço",
  cupom: "Cupom",
  ads: "Anúncio pago",
  kit: "Kit",
  frete: "Frete",
  posicionamento: "Posicionamento",
};

export interface ContextoPrecoIA {
  produtoNome: string;
  canal?: string | null;
  objetivo: "volume" | "margem";
  custo: number;
  preco: number;
  lucro: number;
  /** Fração. */
  margemPct: number;
  comissaoPct: number;
  tarifa: number;
  /** Fração. */
  impostoPct: number;
  precoMinimoViavel?: number | null;
  zonaMorta?: { inicio: number; fim: number; precoMelhor: number; ganhoLiquido: number } | null;
  concorrencia?: { min: number; max: number; media: number; diferencaPct: number; quantidade: number } | null;
  precoPsicologico?: number | null;
  instrucaoExtra?: string | null;
}

export interface Estrategia {
  tipo: TipoEstrategia;
  titulo: string;
  detalhe: string;
}

export interface DiagnosticoPreco {
  diagnostico: string;
  estrategias: Estrategia[];
  precoSugerido: number | null;
  motivoPreco: string | null;
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const pct = (f: number) => `${(f * 100).toFixed(1).replace(".", ",")}%`;

export function montarPromptPreco(ctx: ContextoPrecoIA): string {
  const dados = linhas([
    ["Produto", limparCampo(ctx.produtoNome, 200)],
    ["Canal de venda", limparCampo(ctx.canal, 60)],
    ["Custo total por unidade", brl(ctx.custo)],
    ["Preço atual", brl(ctx.preco)],
    ["Lucro líquido por venda", brl(ctx.lucro)],
    ["Margem líquida", pct(ctx.margemPct)],
    ["Comissão da plataforma nesse preço", `${ctx.comissaoPct}% + ${brl(ctx.tarifa)} por venda`],
    ["Imposto", pct(ctx.impostoPct)],
    ["Preço mínimo sem prejuízo", ctx.precoMinimoViavel != null ? brl(ctx.precoMinimoViavel) : null],
    [
      "Zona morta de comissão",
      ctx.zonaMorta
        ? `entre ${brl(ctx.zonaMorta.inicio)} e ${brl(ctx.zonaMorta.fim)} a comissão sobe de faixa; a ${brl(ctx.zonaMorta.precoMelhor)} o vendedor recebe ${brl(ctx.zonaMorta.ganhoLiquido)} a mais por venda`
        : null,
    ],
    [
      "Concorrentes cadastrados",
      ctx.concorrencia
        ? `${ctx.concorrencia.quantidade}, de ${brl(ctx.concorrencia.min)} a ${brl(ctx.concorrencia.max)}, média ${brl(ctx.concorrencia.media)}; o preço atual está ${pct(Math.abs(ctx.concorrencia.diferencaPct))} ${ctx.concorrencia.diferencaPct >= 0 ? "acima" : "abaixo"} da média`
        : null,
    ],
    ["Preço psicológico mais próximo", ctx.precoPsicologico != null ? brl(ctx.precoPsicologico) : null],
    ["Pedido do vendedor", limparCampo(ctx.instrucaoExtra, 300)],
  ]);

  const objetivo =
    ctx.objetivo === "volume"
      ? "VENDER MAIS UNIDADES, aceitando margem menor, sem nunca ir abaixo do preço mínimo sem prejuízo."
      : "GANHAR MAIS POR VENDA, aceitando vender um pouco menos.";

  return `Você é a Vixe, consultora de preços de um pequeno vendedor online brasileiro. Fale direto, em português simples, como quem conhece marketplace.

Números do anúncio (já calculados pelo sistema, estão certos):
${dados}

Objetivo do vendedor: ${objetivo}

Responda em JSON com:
- diagnostico: 2 a 4 frases sobre a situação do preço hoje, citando os números acima.
- estrategias: de 3 a 5 ações práticas, cada uma com tipo (um de: ${TIPOS_ESTRATEGIA.join(", ")}), titulo (até 60 caracteres) e detalhe (até 280 caracteres, dizendo como fazer).
- preco_sugerido: um preço em reais (número) se valer a pena mudar, ou null se o atual já está bom.
- motivo_preco: uma frase explicando o preço sugerido, ou null.

Regras:
- Use SOMENTE os números fornecidos. Não invente taxa, comissão, volume de vendas, avaliação, dado de mercado nem regra de plataforma.
- Nunca sugira preço abaixo do preço mínimo sem prejuízo.
- Se houver zona morta, trate dela primeiro.
- Cupom e anúncio pago custam margem: diga isso quando sugerir.
- Sem emoji, sem markdown, sem HTML.`;
}

export function esquemaPreco() {
  return {
    type: "object",
    properties: {
      diagnostico: { type: "string" },
      estrategias: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tipo: { type: "string", enum: [...TIPOS_ESTRATEGIA] },
            titulo: { type: "string" },
            detalhe: { type: "string" },
          },
          required: ["tipo", "titulo", "detalhe"],
        },
      },
      preco_sugerido: { type: ["number", "null"] },
      motivo_preco: { type: ["string", "null"] },
    },
    required: ["diagnostico", "estrategias"],
  };
}

function textoLimpo(v: unknown, max: number): string {
  return typeof v === "string" ? truncarEmPalavra(v.replace(/\s+/g, " ").trim(), max) : "";
}

/**
 * Lê a resposta e devolve algo seguro para a tela. Nunca lança. Preço sugerido abaixo do
 * mínimo sem prejuízo, negativo ou absurdo (mais de 10× o atual) vira `null`: a Vixe não
 * pode mandar o vendedor perder dinheiro por erro do modelo.
 */
export function interpretarPreco(bruto: string, limites: { precoMinimoViavel: number | null; precoAtual: number }): DiagnosticoPreco {
  const obj = lerObjetoJson(bruto) ?? {};

  const estrategias: Estrategia[] = [];
  for (const e of Array.isArray(obj.estrategias) ? obj.estrategias : []) {
    if (!e || typeof e !== "object") continue;
    const r = e as Record<string, unknown>;
    const tipo = TIPOS_ESTRATEGIA.includes(r.tipo as TipoEstrategia) ? (r.tipo as TipoEstrategia) : "posicionamento";
    const titulo = textoLimpo(r.titulo, 60);
    const detalhe = textoLimpo(r.detalhe, 280);
    if (!titulo || !detalhe) continue;
    estrategias.push({ tipo, titulo, detalhe });
    if (estrategias.length >= 5) break;
  }

  const bruto$ = typeof obj.preco_sugerido === "number" ? obj.preco_sugerido : typeof obj.preco_sugerido === "string" ? Number(String(obj.preco_sugerido).replace(",", ".")) : NaN;
  const minimo = limites.precoMinimoViavel ?? 0;
  const precoSugerido =
    Number.isFinite(bruto$) && bruto$ > 0 && bruto$ >= minimo && bruto$ <= limites.precoAtual * 10 && Math.abs(bruto$ - limites.precoAtual) >= 0.01
      ? Math.round(bruto$ * 100) / 100
      : null;

  return {
    diagnostico: textoLimpo(obj.diagnostico, 700),
    estrategias,
    precoSugerido,
    motivoPreco: precoSugerido != null ? textoLimpo(obj.motivo_preco, 300) || null : null,
  };
}

/** Centavos importam aqui (a zona morta é de centavo), então nada é arredondado a real. */
export function hashContextoPreco(ctx: ContextoPrecoIA): string {
  const n = (v: number | null | undefined) => (v == null ? "" : v.toFixed(2));
  return hashTexto(
    [
      "preco-v1",
      ctx.produtoNome,
      ctx.canal ?? "",
      ctx.objetivo,
      n(ctx.custo),
      n(ctx.preco),
      n(ctx.comissaoPct),
      n(ctx.tarifa),
      n(ctx.impostoPct * 100),
      n(ctx.precoMinimoViavel),
      ctx.zonaMorta ? `${n(ctx.zonaMorta.inicio)}-${n(ctx.zonaMorta.fim)}` : "",
      ctx.concorrencia ? `${n(ctx.concorrencia.min)}-${n(ctx.concorrencia.max)}-${n(ctx.concorrencia.media)}` : "",
      ctx.instrucaoExtra ?? "",
    ].join("\u0001"),
  );
}

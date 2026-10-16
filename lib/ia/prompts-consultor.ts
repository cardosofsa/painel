/**
 * Prompt, esquema e leitura da resposta da NARRAÇÃO dos Insights de anúncios.
 *
 * A IA não calcula nem decide veredito: o servidor já classificou cada anúncio
 * (`lib/consultor/insights.ts`) e ela só explica, prioriza e sugere o próximo passo. Recebe
 * título de anúncio e números agregados por anúncio; nunca dado de cliente final nem linha
 * crua de pedido. Nome citado na resposta precisa ser um dos fornecidos: o que a IA inventar
 * é descartado em `interpretarConsultor`.
 *
 * O cache (`ia_sugestoes.texto`) guarda a resposta CRUA até 6.000 caracteres; os limites de
 * tamanho abaixo mantêm o JSON bem dentro disso.
 */

import type { LinhaConsultor, ResultadoConsultor } from "@/lib/consultor/insights";
import { hashTexto, lerObjetoJson, limparCampo, linhas, truncarEmPalavra } from "./texto";

export interface AnuncioParaIA {
  nome: string;
  veredito: "replicar" | "atencao" | "nao_vale" | "parado";
  pedidos: number;
  unidades: number;
  receita: number;
  lucro: number;
  margemPct: number | null;
  problemaPct: number | null;
  tendenciaPct: number | null;
  gastoAds: number;
  lucroAposAds: number;
  campea: { nome: string; participacaoPct: number } | null;
}

export interface ContextoConsultorIA {
  dias: number;
  amostraFraca: boolean;
  pedidos: number;
  adsTotal: number;
  adsSemAnuncio: number;
  anuncios: AnuncioParaIA[];
  faixas: { de: number; ate: number; unidades: number; lucro: number; margemPct: number | null }[] | null;
}

export interface AcaoAnuncio {
  anuncio: string;
  acao: string;
  motivo: string;
}
export interface OportunidadeIA {
  baseadoEm: string;
  ideia: string;
  motivo: string;
}
export interface NarracaoConsultor {
  resumo: string;
  replicar: AcaoAnuncio[];
  atencao: AcaoAnuncio[];
  evitar: AcaoAnuncio[];
  oportunidades: OportunidadeIA[];
  precos: string;
}

/** Quantos anúncios de cada grupo vão ao prompt (os maiores por faturamento). */
const LIMITES: Record<AnuncioParaIA["veredito"], number> = { replicar: 8, atencao: 6, nao_vale: 6, parado: 5 };

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const pct = (n: number | null) => (n === null ? "sem base" : `${n.toFixed(1).replace(".", ",")}%`);
const arred = (n: number) => Math.round(n * 100) / 100;

/** Enxuga o resultado do consultor para o que a IA precisa; títulos já saem limpos e curtos. */
export function montarContextoConsultor(r: ResultadoConsultor): ContextoConsultorIA {
  const grupos: AnuncioParaIA["veredito"][] = ["replicar", "atencao", "nao_vale", "parado"];
  const anuncios: AnuncioParaIA[] = [];
  const vistos = new Set<string>();
  for (const v of grupos) {
    const doGrupo = r.linhas.filter((l: LinhaConsultor) => l.veredito === v).sort((a, b) => b.receita - a.receita);
    for (const l of doGrupo.slice(0, LIMITES[v])) {
      const nome = limparCampo(l.nome, 80);
      if (!nome || vistos.has(nome.toLowerCase())) continue;
      vistos.add(nome.toLowerCase());
      anuncios.push({
        nome,
        veredito: v,
        pedidos: l.pedidos,
        unidades: l.unidades,
        receita: arred(l.receita),
        lucro: arred(l.lucro),
        margemPct: l.margem == null ? null : arred(l.margem * 100),
        problemaPct: l.taxaProblema == null ? null : arred(l.taxaProblema * 100),
        tendenciaPct: l.tendencia == null ? null : arred(l.tendencia * 100),
        gastoAds: arred(l.gastoAds),
        lucroAposAds: arred(l.lucroAposAds),
        campea: l.campea ? { nome: limparCampo(l.campea.nome, 40) ?? "", participacaoPct: arred(l.campea.participacao * 100) } : null,
      });
    }
  }
  return {
    dias: r.dias,
    amostraFraca: r.amostraFraca,
    pedidos: r.pedidosPeriodo,
    adsTotal: arred(r.adsTotal),
    adsSemAnuncio: arred(r.adsSemAnuncio),
    anuncios,
    faixas: r.faixas ? r.faixas.map((f) => ({ de: arred(f.de), ate: arred(f.ate), unidades: f.unidades, lucro: arred(f.lucro), margemPct: f.margem == null ? null : arred(f.margem * 100) })) : null,
  };
}

/** Nomes que a resposta pode citar. */
export const nomesDoContexto = (ctx: ContextoConsultorIA): string[] => ctx.anuncios.map((a) => a.nome);

const ROTULO: Record<AnuncioParaIA["veredito"], string> = {
  replicar: "VALE REPLICAR",
  atencao: "PEDE ATENÇÃO",
  nao_vale: "NÃO VALE A PENA",
  parado: "PARADO",
};

export function montarPromptConsultor(ctx: ContextoConsultorIA): string {
  const geral = linhas([
    ["Período analisado", `últimos ${ctx.dias} dias`],
    ["Pedidos no período", String(ctx.pedidos)],
    ["Gasto total com anúncios pagos (Ads)", ctx.adsTotal > 0 ? brl(ctx.adsTotal) : null],
    ["Parte do Ads que não foi ligada a nenhum anúncio", ctx.adsSemAnuncio > 0 ? brl(ctx.adsSemAnuncio) : null],
    ["Amostra", ctx.amostraFraca ? "FRACA (poucos pedidos): trate tudo como indício, não como conclusão" : "suficiente para tendências gerais"],
  ]);

  const blocos = (Object.keys(ROTULO) as AnuncioParaIA["veredito"][])
    .map((v) => {
      const itens = ctx.anuncios.filter((a) => a.veredito === v);
      if (itens.length === 0) return "";
      const corpo = itens
        .map((a) => {
          if (v === "parado") return `- "${a.nome}": nenhuma venda no período`;
          const extras = [
            a.tendenciaPct !== null ? `faturamento ${pct(a.tendenciaPct)} vs. período anterior` : null,
            a.problemaPct !== null && a.problemaPct > 0 ? `${pct(a.problemaPct)} cancelados/devolvidos` : null,
            a.gastoAds > 0 ? `Ads ${brl(a.gastoAds)}, lucro depois do Ads ${brl(a.lucroAposAds)}` : null,
            a.campea ? `variação que mais vende: ${a.campea.nome} (${pct(a.campea.participacaoPct)} das unidades)` : null,
          ].filter(Boolean);
          return `- "${a.nome}": ${a.pedidos} pedidos, ${a.unidades} un., faturou ${brl(a.receita)}, lucro ${brl(a.lucro)}, margem ${pct(a.margemPct)}${extras.length ? `; ${extras.join("; ")}` : ""}`;
        })
        .join("\n");
      return `\n${ROTULO[v]}:\n${corpo}`;
    })
    .join("");

  const faixas = ctx.faixas
    ? `\nFaixas de preço (cada uma com ~25% das unidades vendidas):\n${ctx.faixas.map((f) => `- ${brl(f.de)} a ${brl(f.ate)}: ${f.unidades} un., lucro ${brl(f.lucro)}, margem ${pct(f.margemPct)}`).join("\n")}\n`
    : "";

  return `Você é a Vixe, consultora de um pequeno vendedor brasileiro de Shopee. Fale direto, em português simples, sem jargão, como quem quer ver a loja crescer.

Números do período (já calculados e classificados pelo sistema; estão certos):
${geral}
${blocos}
${faixas}
Responda em JSON com:
- resumo: 2 a 3 frases sobre o desempenho dos anúncios, citando os números mais importantes (até 400 caracteres).
- replicar: de 0 a 4 itens para anúncios do grupo VALE REPLICAR. Cada um com anuncio (o título EXATO fornecido), acao (o que fazer, até 110 caracteres) e motivo (até 160).
- atencao: de 0 a 4 itens para anúncios do grupo PEDE ATENÇÃO, no mesmo formato.
- evitar: de 0 a 4 itens para anúncios do grupo NÃO VALE A PENA, no mesmo formato (por ex.: rever o preço, pausar o Ads, rever o custo, deixar de repor).
- oportunidades: de 0 a 3 ideias de novo anúncio ou nova variação/kit, cada uma com baseado_em (o título EXATO de um anúncio fornecido), ideia (até 120) e motivo (até 160). Só proponha com base no que os números mostram (variação campeã, margem alta, faixa de preço que mais rende).
- precos: 1 a 2 frases sobre a faixa de preço que mais rende e o que isso sugere, ou "" se não houver faixas (até 250 caracteres).

Regras:
- Use SOMENTE os títulos e números fornecidos. Não invente valor, preço, concorrente, volume de busca, visita, conversão nem dado que não está acima.
- O campo anuncio e o baseado_em devem repetir um título fornecido, sem mudar uma letra.
- Não dê preço novo em reais nem prometa resultado ("vai vender mais"): diga o que testar e por quê.
- Se a amostra é fraca, diga isso no resumo e seja cauteloso nas ações.
- Anúncio PARADO só entra em atencao se houver motivo nos dados; sem dado, não opine sobre por que não vende.
- Sem emoji, sem markdown, sem HTML.`;
}

const acao = {
  type: "object",
  properties: { anuncio: { type: "string" }, acao: { type: "string" }, motivo: { type: "string" } },
  required: ["anuncio", "acao", "motivo"],
};

export function esquemaConsultor() {
  return {
    type: "object",
    properties: {
      resumo: { type: "string" },
      replicar: { type: "array", items: acao },
      atencao: { type: "array", items: acao },
      evitar: { type: "array", items: acao },
      oportunidades: {
        type: "array",
        items: { type: "object", properties: { baseado_em: { type: "string" }, ideia: { type: "string" }, motivo: { type: "string" } }, required: ["baseado_em", "ideia", "motivo"] },
      },
      precos: { type: "string" },
    },
    required: ["resumo", "replicar", "atencao", "evitar", "oportunidades", "precos"],
  };
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? truncarEmPalavra(v.replace(/\s+/g, " ").trim(), max) : "";
}

const chaveNome = (s: string) => s.trim().toLowerCase();

function listaDeAcoes(v: unknown, validos: Map<string, string>): AcaoAnuncio[] {
  const saida: AcaoAnuncio[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    // O que a IA citar e não estiver na lista fornecida é invenção: descarta.
    const nome = validos.get(chaveNome(typeof r.anuncio === "string" ? r.anuncio : ""));
    const a = texto(r.acao, 110);
    if (!nome || !a) continue;
    saida.push({ anuncio: nome, acao: a, motivo: texto(r.motivo, 160) });
    if (saida.length >= 4) break;
  }
  return saida;
}

/** Lê a resposta e devolve algo seguro para a tela. Nunca lança; campo ruim vira vazio. */
export function interpretarConsultor(bruto: string, nomesValidos: readonly string[]): NarracaoConsultor {
  const obj = lerObjetoJson(bruto) ?? {};
  const validos = new Map(nomesValidos.map((n) => [chaveNome(n), n]));

  const oportunidades: OportunidadeIA[] = [];
  for (const o of Array.isArray(obj.oportunidades) ? obj.oportunidades : []) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    const base = validos.get(chaveNome(typeof r.baseado_em === "string" ? r.baseado_em : ""));
    const ideia = texto(r.ideia, 120);
    if (!base || !ideia) continue;
    oportunidades.push({ baseadoEm: base, ideia, motivo: texto(r.motivo, 160) });
    if (oportunidades.length >= 3) break;
  }

  return {
    resumo: texto(obj.resumo, 400),
    replicar: listaDeAcoes(obj.replicar, validos),
    atencao: listaDeAcoes(obj.atencao, validos),
    evitar: listaDeAcoes(obj.evitar, validos),
    oportunidades,
    precos: texto(obj.precos, 250),
  };
}

/** Narração sem nada aproveitável: o modelo falhou e a vaga não volta (o token foi gasto). */
export const narracaoVazia = (n: NarracaoConsultor) => !n.resumo && n.replicar.length + n.atencao.length + n.evitar.length + n.oportunidades.length === 0;

/** Valores arredondados: variação de poeira não pode invalidar o cache. */
export function hashContextoConsultor(ctx: ContextoConsultorIA): string {
  const n = (v: number | null) => (v === null ? "" : Math.round(v).toString());
  return hashTexto(
    [
      "consultor-v1",
      String(ctx.dias),
      ctx.amostraFraca ? "1" : "0",
      String(ctx.pedidos),
      n(ctx.adsTotal),
      n(ctx.adsSemAnuncio),
      ctx.anuncios.map((a) => [a.nome, a.veredito, a.pedidos, a.unidades, n(a.receita), n(a.lucro), n(a.margemPct), n(a.problemaPct), n(a.tendenciaPct), n(a.gastoAds), a.campea?.nome ?? ""].join(":")).join(";"),
      ctx.faixas ? ctx.faixas.map((f) => [n(f.de), n(f.ate), f.unidades, n(f.lucro)].join(":")).join(";") : "",
    ].join("\u0001"),
  );
}

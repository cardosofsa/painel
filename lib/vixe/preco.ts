/**
 * Vixe Preço — os NÚMEROS. Tudo sai das funções que a Precificação já usa
 * (`lib/pricing.ts`); a IA recebe o resultado pronto e só interpreta. Assim a conta nunca
 * depende do modelo acertar aritmética.
 *
 * Funções puras, cobertas por `preco.test.ts`.
 */

import {
  analisarConcorrencia,
  encontrarFaixa,
  precoEmCentavos,
  resolverComFaixas,
  resolverPorLucro,
  resultadoParaPreco,
  resultadoParaPrecoComFaixas,
  zonaMortaDeFaixa,
  type FaixaComissao,
  type ResultadoPrecificacao,
  type TaxasPlataforma,
  type ZonaMorta,
} from "@/lib/pricing";

export type ObjetivoPreco = "volume" | "margem";

export interface LojaPreco {
  id: string;
  nome: string;
  canalNome: string;
  tipoTaxa: "faixas" | "fixo";
  /** Em pontos percentuais (20 = 20%), como no cadastro. */
  comissaoPct: number;
  taxaFixa: number;
  taxaExtraValor: number | null;
  taxaExtraTipo: "percentual" | "fixo" | null;
  faixas: FaixaComissao[];
  /** Quando a tabela de faixas foi gravada pela última vez (ISO), se houver. */
  faixasAtualizadasEm: string | null;
}

export interface EntradaPreco {
  custo: number;
  preco: number;
  /** Fração (0,06 = 6%). */
  impostoPct: number;
  loja: LojaPreco | null;
  /** Preços dos concorrentes cadastrados. */
  concorrentes: number[];
}

export interface AnalisePreco {
  resultado: ResultadoPrecificacao;
  /** Comissão da faixa (ou do canal) em que o preço caiu, em pontos percentuais. */
  comissaoAplicadaPct: number;
  tarifaAplicada: number;
  /** Abaixo disso a venda dá prejuízo. null = não dá para calcular (custo zero, taxas > 100%). */
  precoMinimoViavel: number | null;
  zonaMorta: ZonaMorta | null;
  concorrencia: {
    min: number;
    max: number;
    media: number;
    /** (seu − média) / média, fração. */
    diferencaPct: number;
    posicao: "abaixo" | "na_media" | "acima";
  } | null;
  /** Preço "quebrado" mais próximo para baixo (R$ 79,90), quando o atual não termina assim. */
  precoPsicologico: number | null;
}

type TaxasBase = Omit<TaxasPlataforma, "taxaVariavelPct" | "taxaFixa">;

function taxasBase(e: Pick<EntradaPreco, "impostoPct" | "loja">): TaxasBase {
  return {
    impostoPct: e.impostoPct,
    taxaAdicionalPct: 0,
    taxaExtraValor: e.loja?.taxaExtraValor ?? undefined,
    taxaExtraTipo: e.loja?.taxaExtraTipo ?? null,
  };
}

function usaFaixas(loja: LojaPreco | null): loja is LojaPreco {
  return !!loja && loja.tipoTaxa === "faixas" && loja.faixas.length > 0;
}

function taxasFixas(e: Pick<EntradaPreco, "impostoPct" | "loja">): TaxasPlataforma {
  return { ...taxasBase(e), taxaVariavelPct: (e.loja?.comissaoPct ?? 0) / 100, taxaFixa: e.loja?.taxaFixa ?? 0 };
}

/** Lucro, margem e taxas para um preço qualquer — usado também no preço que a IA sugerir. */
export function simularPreco(e: Pick<EntradaPreco, "custo" | "impostoPct" | "loja">, preco: number): ResultadoPrecificacao {
  if (usaFaixas(e.loja)) return resultadoParaPrecoComFaixas(preco, e.custo, taxasBase(e), e.loja.faixas);
  return resultadoParaPreco(preco, e.custo, taxasFixas(e));
}

export function precoPsicologico(preco: number): number | null {
  if (!Number.isFinite(preco) || preco < 2) return null;
  const centavos = Math.round((preco % 1) * 100);
  if (centavos === 90 || centavos === 97 || centavos === 99) return null;
  const inteiro = Math.floor(preco);
  // R$ 80,00 → R$ 79,90; R$ 84,50 → R$ 83,90. Sempre para baixo: subir não é "psicológico".
  const candidato = inteiro + 0.9 <= preco ? inteiro + 0.9 : inteiro - 0.1;
  return Math.round(candidato * 100) / 100;
}

export function analisarPreco(e: EntradaPreco): AnalisePreco {
  const resultado = simularPreco(e, e.preco);

  let comissaoAplicadaPct = e.loja?.comissaoPct ?? 0;
  let tarifaAplicada = e.loja?.taxaFixa ?? 0;
  if (usaFaixas(e.loja)) {
    const f = encontrarFaixa(e.loja.faixas, e.preco);
    comissaoAplicadaPct = f.comissaoPct;
    tarifaAplicada = f.tarifaFixa;
  }

  const minimo = usaFaixas(e.loja)
    ? resolverComFaixas(e.custo, "lucro", 0, taxasBase(e), e.loja.faixas).resultado
    : resolverPorLucro(e.custo, 0, taxasFixas(e));
  const precoMinimoViavel =
    minimo.viavel && Number.isFinite(minimo.precoVenda) ? precoEmCentavos(minimo.precoVenda, true, usaFaixas(e.loja) ? e.loja.faixas : []) : null;

  const zonaMorta = usaFaixas(e.loja) ? zonaMortaDeFaixa(e.loja.faixas, e.preco, taxasBase(e)) : null;

  const precos = e.concorrentes.filter((p) => Number.isFinite(p) && p > 0);
  const analise =
    precos.length > 0
      ? analisarConcorrencia(
          resultado,
          precos.map((p, i) => ({ id: String(i), nome: "", preco: p, link: null })),
          // Com faixas, o preço médio dos concorrentes pode cair noutra faixa que a do seu preço.
          usaFaixas(e.loja) ? (p: number) => simularPreco(e, p) : taxasFixas(e),
        )
      : null;
  const concorrencia = analise
    ? {
        min: analise.precoMinConcorrentes,
        max: analise.precoMaxConcorrentes,
        media: analise.precoMedioConcorrentes,
        diferencaPct: analise.diferencaPct,
        posicao: analise.classificacao === "caro" ? ("acima" as const) : analise.classificacao === "barato" ? ("abaixo" as const) : ("na_media" as const),
      }
    : null;

  return {
    resultado,
    comissaoAplicadaPct,
    tarifaAplicada,
    precoMinimoViavel,
    zonaMorta,
    concorrencia,
    precoPsicologico: precoPsicologico(e.preco),
  };
}

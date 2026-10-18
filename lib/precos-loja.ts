/**
 * Preço por loja (0101): o preço de cada loja e o que ele rende COM AS TAXAS DAQUELA LOJA.
 * Puro, coberto por `precos-loja.test.ts`; os cálculos são os de `lib/pricing.ts`. Usado no
 * bloco "Preços por loja" da Precificação e na etapa Revisar do Anúncio.
 */
import {
  resultadoParaPreco,
  resultadoParaPrecoComFaixas,
  zonaMortaDeFaixa,
  type FaixaComissao,
  type ResultadoPrecificacao,
  type ZonaMorta,
} from "./pricing";

export interface LojaParaPreco {
  id: string;
  nome: string;
  canalNome: string;
  tipoTaxa: "faixas" | "fixo";
  /** Em %, como no cadastro. */
  comissaoPct: number;
  taxaFixa: number;
  taxaExtraValor: number | null;
  taxaExtraTipo: "percentual" | "fixo" | null;
  faixas: FaixaComissao[];
}

export interface PrecoGravado {
  loja_id: string;
  preco: number | null;
  preco_atualizado_em?: string | null;
}

export type SituacaoPrecoLoja = "sem_preco" | "prejuizo" | "zona_morta" | "ok";

export interface PrecoDeLoja {
  loja: LojaParaPreco;
  rotulo: string;
  preco: number | null;
  atualizadoEm: string | null;
  resultado: ResultadoPrecificacao | null;
  zonaMorta: ZonaMorta | null;
  situacao: SituacaoPrecoLoja;
}

const usaFaixas = (l: LojaParaPreco) => l.tipoTaxa === "faixas" && l.faixas.length > 0;

/** Lucro, margem e taxas de vender a `preco` nesta loja. `impostoPct` em fração (0,06). */
export function resultadoNaLoja(loja: LojaParaPreco, custo: number, impostoPct: number, preco: number): ResultadoPrecificacao {
  const base = { impostoPct, taxaAdicionalPct: 0, taxaExtraValor: loja.taxaExtraValor ?? undefined, taxaExtraTipo: loja.taxaExtraTipo };
  if (usaFaixas(loja)) return resultadoParaPrecoComFaixas(preco, custo, base, loja.faixas);
  return resultadoParaPreco(preco, custo, { ...base, taxaVariavelPct: loja.comissaoPct / 100, taxaFixa: loja.taxaFixa });
}

/** Uma linha por loja cadastrada (loja nova aparece sozinha, sem preço). */
export function precosPorLoja(lojas: LojaParaPreco[], gravados: PrecoGravado[], custo: number, impostoPct: number): PrecoDeLoja[] {
  const porLoja = new Map(gravados.map((g) => [g.loja_id, g]));
  return lojas.map((loja) => {
    const g = porLoja.get(loja.id);
    const preco = g?.preco != null && Number(g.preco) > 0 ? Number(g.preco) : null;
    const rotulo = `${loja.canalNome} · ${loja.nome}`;
    if (preco === null) return { loja, rotulo, preco: null, atualizadoEm: null, resultado: null, zonaMorta: null, situacao: "sem_preco" as const };
    const resultado = custo > 0 ? resultadoNaLoja(loja, custo, impostoPct, preco) : null;
    const zona = usaFaixas(loja) ? zonaMortaDeFaixa(loja.faixas, preco, { impostoPct, taxaAdicionalPct: 0, taxaExtraValor: loja.taxaExtraValor ?? undefined, taxaExtraTipo: loja.taxaExtraTipo }) : null;
    const situacao: SituacaoPrecoLoja = resultado && resultado.lucroLiquido < 0 ? "prejuizo" : zona ? "zona_morta" : "ok";
    return { loja, rotulo, preco, atualizadoEm: g?.preco_atualizado_em ?? null, resultado, zonaMorta: zona, situacao };
  });
}

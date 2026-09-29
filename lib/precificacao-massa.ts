import {
  resolverComFaixas,
  resolverPorMargem,
  type FaixaComissao,
  type ResultadoPrecificacao,
} from "./pricing";

export const MAX_LINHAS_MASSA = 200;

export interface ProdutoMassa {
  id: string;
  sku: string;
  nome: string;
  custo: number;
  preco_venda: number;
}

export interface LojaMassa {
  id: string;
  nome: string;
  canalNome: string;
  tipoTaxa: "faixas" | "fixo";
  comissaoPct: number;
  taxaFixa: number;
  taxaExtraValor: number | null;
  taxaExtraTipo: "percentual" | "fixo" | null;
  faixas: FaixaComissao[];
}

export interface LinhaEmMassa {
  id: string;
  produtoId: string | null;
  sku: string;
  nome: string;
  custo: number;
  lojaId: string | null;
  comissaoPct: number;
  taxaFixa: number;
  impostoPct: number;
  margemPct: number;
  precoAtual: number;
}

export interface ResultadoLinhaMassa {
  linha: LinhaEmMassa;
  loja: LojaMassa | null;
  faixa: FaixaComissao | null;
  resultado: ResultadoPrecificacao;
  diferenca: number;
  precisaSubir: boolean;
}

let proximoId = 1;

export function linhaVazia(): LinhaEmMassa {
  proximoId += 1;
  return {
    id: `linha-${proximoId}`,
    produtoId: null,
    sku: "",
    nome: "",
    custo: 0,
    lojaId: null,
    comissaoPct: 20,
    taxaFixa: 4,
    impostoPct: 6,
    margemPct: 25,
    precoAtual: 0,
  };
}

/** Linha que entra no cálculo: tem identificação e custo. */
export function linhaCalculavel(l: LinhaEmMassa): boolean {
  return (l.sku.trim() !== "" || l.nome.trim() !== "") && l.custo > 0;
}

/**
 * Comissão (fração) e tarifa fixa que valeram naquela linha. Loja com faixas usa a faixa
 * sorteada pelo solver; loja de taxa fixa usa a da loja; sem loja, o que foi digitado.
 * Existia repetido em quatro lugares da tela — daqui sai um só, então o valor mostrado, o
 * exportado e o salvo no histórico não têm como divergir.
 */
export function taxasDaLinha(r: Pick<ResultadoLinhaMassa, "linha" | "loja" | "faixa">) {
  if (r.faixa) return { taxaVariavelPct: r.faixa.comissaoPct / 100, taxaFixa: r.faixa.tarifaFixa };
  if (r.loja) return { taxaVariavelPct: r.loja.comissaoPct / 100, taxaFixa: r.loja.taxaFixa };
  return { taxaVariavelPct: r.linha.comissaoPct / 100, taxaFixa: r.linha.taxaFixa };
}

/** Preço pra atingir a margem alvo de cada linha e o quanto ele difere do preço atual. */
export function calcularResultadosEmMassa(linhas: LinhaEmMassa[], lojas: LojaMassa[]): ResultadoLinhaMassa[] {
  return linhas.filter(linhaCalculavel).map((l) => {
    const loja = lojas.find((lj) => lj.id === l.lojaId) ?? null;
    const extra = { taxaExtraValor: loja?.taxaExtraValor ?? undefined, taxaExtraTipo: loja?.taxaExtraTipo ?? null };

    let resultado: ResultadoPrecificacao;
    let faixa: FaixaComissao | null = null;

    if (loja?.tipoTaxa === "faixas") {
      const r = resolverComFaixas(
        l.custo,
        "margem",
        l.margemPct / 100,
        { impostoPct: l.impostoPct / 100, taxaAdicionalPct: 0, ...extra },
        loja.faixas,
      );
      resultado = r.resultado;
      faixa = r.faixa;
    } else {
      resultado = resolverPorMargem(l.custo, l.margemPct / 100, {
        impostoPct: l.impostoPct / 100,
        taxaFixa: loja ? loja.taxaFixa : l.taxaFixa,
        taxaVariavelPct: (loja ? loja.comissaoPct : l.comissaoPct) / 100,
        taxaAdicionalPct: 0,
        ...extra,
      });
    }

    const diferenca = resultado.precoVenda - l.precoAtual;
    return { linha: l, loja, faixa, resultado, diferenca, precisaSubir: l.precoAtual > 0 && diferenca > 0.01 };
  });
}

/**
 * Calculadora pública (/calculadora): o mesmo motor da precificação do painel
 * (`lib/pricing.ts`), com as taxas que o sistema já conhece, para quem ainda não tem conta.
 *
 * Shopee: as faixas são `FAIXAS_SHOPEE_PADRAO`, as mesmas que toda conta nova recebe
 * (migração 0005). Mercado Livre: o sistema NÃO traz tabela padrão (a comissão varia por
 * categoria e tipo de anúncio, e o canal nasce com 0% e R$ 0 em toda conta), então quem usa
 * informa a comissão e a tarifa fixa do próprio anúncio. Nada de taxa inventada aqui.
 */

import { FAIXAS_SHOPEE_PADRAO } from "@/lib/marketplace/plataformas";
import {
  formatarFaixaLabel,
  resolverComFaixas,
  resolverPorMargem,
  resultadoParaPreco,
  zonaMortaDeFaixa,
  type FaixaComissao,
  type ResultadoPrecificacao,
  type ZonaMorta,
} from "@/lib/pricing";

export type ModoCalculadora = "margem" | "preco";

export interface EntradaCalculadora {
  /** Custo do produto + embalagem (R$). */
  custo: number | null;
  modo: ModoCalculadora;
  /** Margem líquida desejada, em % do preço (modo "margem"). */
  margemPct: number | null;
  /** Preço de venda que a pessoa já pratica ou quer testar (modo "preco"). */
  preco: number | null;
  /** Imposto sobre a venda, em % (opcional: vazio vale 0). */
  impostoPct: number | null;
  /** Comissão do anúncio no Mercado Livre, em % — informada pela pessoa. */
  mlComissaoPct: number | null;
  /** Tarifa fixa por venda no Mercado Livre (R$) — informada pela pessoa; vazio vale 0. */
  mlTaxaFixa: number | null;
}

export interface ResultadoCanal {
  canal: "shopee" | "mercadolivre";
  nome: string;
  /** `null` quando falta dado para calcular (ex.: comissão do ML em branco). */
  falta: string | null;
  viavel: boolean;
  precoVenda: number;
  comissaoPct: number;
  comissaoValor: number;
  taxaFixa: number;
  impostoValor: number;
  lucro: number;
  /** Lucro / preço, em fração (0,2 = 20%). */
  margem: number;
  /** Faixa de comissão aplicada (só Shopee). */
  faixa: string | null;
  /** Preço em zona morta de faixa (só Shopee). */
  zonaMorta: ZonaMorta | null;
}

/** Destino do CTA: o cadastro com a origem marcada (o pacote do cadastro lê o UTM). */
export const LINK_CADASTRO_CALCULADORA = "/signup?utm_source=calculadora";

export const FONTE_TAXAS_SHOPEE =
  "Faixas de comissão padrão do Sertão para a Shopee (as mesmas que toda conta nova recebe). Confira sempre na Central do Vendedor: a Shopee muda as regras de tempos em tempos.";

export const FONTE_TAXAS_ML =
  "O Mercado Livre cobra uma comissão por categoria e tipo de anúncio (Clássico ou Premium) e, em produto barato, uma tarifa fixa por venda. Copie as do seu anúncio, que aparecem ao publicar ou em Tarifas e faturamento.";

export const FAIXAS_SHOPEE: FaixaComissao[] = FAIXAS_SHOPEE_PADRAO.map((f) => ({
  min: f.preco_min,
  max: f.preco_max,
  comissaoPct: f.comissao_pct,
  tarifaFixa: f.tarifa_fixa,
}));

function vazio(canal: ResultadoCanal["canal"], nome: string, falta: string | null): ResultadoCanal {
  return { canal, nome, falta, viavel: false, precoVenda: 0, comissaoPct: 0, comissaoValor: 0, taxaFixa: 0, impostoValor: 0, lucro: 0, margem: 0, faixa: null, zonaMorta: null };
}

/** O que falta para calcular qualquer canal (custo, margem ou preço). */
function faltaComum(e: EntradaCalculadora): string | null {
  if (e.custo === null || e.custo <= 0) return "Informe o custo do produto.";
  if (e.modo === "margem" && (e.margemPct === null || e.margemPct < 0)) return "Informe a margem desejada.";
  if (e.modo === "preco" && (e.preco === null || e.preco <= 0)) return "Informe o preço de venda.";
  if (e.impostoPct !== null && (e.impostoPct < 0 || e.impostoPct >= 100)) return "O imposto precisa ficar entre 0% e 100%.";
  return null;
}

function montar(canal: ResultadoCanal["canal"], nome: string, r: ResultadoPrecificacao, comissaoPct: number, taxaFixa: number): ResultadoCanal {
  if (!r.viavel) return { ...vazio(canal, nome, null), comissaoPct, taxaFixa };
  return {
    canal,
    nome,
    falta: null,
    viavel: true,
    precoVenda: r.precoVenda,
    comissaoPct,
    comissaoValor: r.taxaVariavelValor,
    taxaFixa,
    impostoValor: r.impostoValor,
    lucro: r.lucroLiquido,
    margem: r.margemEfetivaPct,
    faixa: null,
    zonaMorta: null,
  };
}

export function calcularShopee(e: EntradaCalculadora): ResultadoCanal {
  const nome = "Shopee";
  const falta = faltaComum(e);
  if (falta) return vazio("shopee", nome, falta);
  const impostoPct = (e.impostoPct ?? 0) / 100;
  const parametro = e.modo === "margem" ? (e.margemPct ?? 0) / 100 : (e.preco ?? 0);
  const { resultado, faixa } = resolverComFaixas(e.custo ?? 0, e.modo, parametro, { impostoPct, taxaAdicionalPct: 0 }, FAIXAS_SHOPEE);
  const base = montar("shopee", nome, resultado, faixa.comissaoPct, faixa.tarifaFixa);
  if (!base.viavel) return base;
  return { ...base, faixa: formatarFaixaLabel(faixa), zonaMorta: zonaMortaDeFaixa(FAIXAS_SHOPEE, resultado.precoVenda, { impostoPct, taxaAdicionalPct: 0 }) };
}

export function calcularMercadoLivre(e: EntradaCalculadora): ResultadoCanal {
  const nome = "Mercado Livre";
  const falta = faltaComum(e);
  if (falta) return vazio("mercadolivre", nome, falta);
  if (e.mlComissaoPct === null) return vazio("mercadolivre", nome, "Informe a comissão do seu anúncio no Mercado Livre.");
  if (e.mlComissaoPct < 0 || e.mlComissaoPct >= 100) return vazio("mercadolivre", nome, "A comissão precisa ficar entre 0% e 100%.");
  if (e.mlTaxaFixa !== null && e.mlTaxaFixa < 0) return vazio("mercadolivre", nome, "A tarifa fixa não pode ser negativa.");
  const taxas = { impostoPct: (e.impostoPct ?? 0) / 100, taxaFixa: e.mlTaxaFixa ?? 0, taxaVariavelPct: e.mlComissaoPct / 100, taxaAdicionalPct: 0 };
  const r = e.modo === "margem" ? resolverPorMargem(e.custo ?? 0, (e.margemPct ?? 0) / 100, taxas) : resultadoParaPreco(e.preco ?? 0, e.custo ?? 0, taxas);
  return montar("mercadolivre", nome, r, e.mlComissaoPct, taxas.taxaFixa);
}

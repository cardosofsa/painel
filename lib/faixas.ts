/**
 * Faixas de comissão por preço (Shopee e afins). Puro, coberto por `faixas.test.ts`.
 *
 * - `faixaDaLinha`: linha do banco → `FaixaComissao`. A tarifa fixa pode ser um valor (R$ 4,50) e/ou
 *   uma PORCENTAGEM DO PREÇO (`tarifa_fixa_pct`, 0107: abaixo de R$ 9 a Shopee cobra metade do
 *   preço). Como as duas partes são proporcionais ao preço, a porcentagem entra somada na taxa
 *   variável (`comissaoPct`) — todo o motor de preço já trata isso certo — e fica guardada à parte
 *   só para o rótulo ("20% + 50% do preço").
 * - `validarFaixas`: o CONJUNTO tem de fazer sentido (começa em zero, sem buraco nem sobreposição,
 *   só a última aberta). Antes dava para salvar a tabela vazia, e aí o cálculo caía em 0% + R$ 0.
 */
import type { FaixaComissao } from "./pricing";

export interface LinhaFaixa {
  preco_min: number | string;
  preco_max: number | string | null;
  comissao_pct: number | string;
  tarifa_fixa: number | string | null;
  /** 0107: tarifa fixa em % do preço. Antes da migração não vem. */
  tarifa_fixa_pct?: number | string | null;
}

export function faixaDaLinha(l: LinhaFaixa): FaixaComissao {
  const pctPreco = Number(l.tarifa_fixa_pct ?? 0) || 0;
  const comissao = Number(l.comissao_pct) || 0;
  return {
    min: Number(l.preco_min),
    max: l.preco_max == null ? null : Number(l.preco_max),
    comissaoPct: comissao + pctPreco,
    tarifaFixa: Number(l.tarifa_fixa ?? 0) || 0,
    ...(pctPreco > 0 ? { comissaoBasePct: comissao, tarifaPctPreco: pctPreco } : {}),
  };
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** "20% + R$ 4,50", "20% + 50% do preço". */
export function rotuloTaxaFaixa(f: FaixaComissao): string {
  if (f.tarifaPctPreco) {
    const partes = [pct(f.comissaoBasePct ?? f.comissaoPct - f.tarifaPctPreco), `${pct(f.tarifaPctPreco)} do preço`];
    if (f.tarifaFixa > 0) partes.push(brl(f.tarifaFixa));
    return partes.join(" + ");
  }
  return `${pct(f.comissaoPct)} + ${brl(f.tarifaFixa)}`;
}

/** Faixa como a tela de configuração edita (mesmos nomes do banco). */
export interface FaixaEditavel {
  preco_min: number;
  preco_max: number | null;
  comissao_pct: number;
  tarifa_fixa: number;
  tarifa_fixa_pct?: number;
}

const centavos = (n: number) => Math.round(n * 100);

/**
 * Primeiro problema do conjunto, em pt-BR; `null` se está tudo certo. As mesmas regras valem no
 * banco (`salvar_faixas_canal`, 0107).
 */
export function validarFaixas(faixas: readonly FaixaEditavel[]): string | null {
  if (faixas.length === 0) return "Cadastre pelo menos uma faixa: sem faixa nenhuma, o preço sairia sem comissão.";
  if (faixas.length > 20) return "No máximo 20 faixas.";
  for (let i = 0; i < faixas.length; i++) {
    const f = faixas[i];
    const n = i + 1;
    if (![f.preco_min, f.comissao_pct, f.tarifa_fixa, f.tarifa_fixa_pct ?? 0].every(Number.isFinite) || (f.preco_max !== null && !Number.isFinite(f.preco_max))) return `A faixa ${n} tem um valor inválido.`;
    if (f.comissao_pct < 0 || f.comissao_pct > 100) return `A comissão da faixa ${n} precisa estar entre 0% e 100%.`;
    if ((f.tarifa_fixa_pct ?? 0) < 0 || (f.tarifa_fixa_pct ?? 0) > 100) return `A tarifa em % do preço da faixa ${n} precisa estar entre 0% e 100%.`;
    if (f.comissao_pct + (f.tarifa_fixa_pct ?? 0) >= 100) return `Na faixa ${n}, comissão + tarifa em % do preço chegam a 100%: não sobraria nada da venda.`;
    if (f.tarifa_fixa < 0) return `A tarifa fixa da faixa ${n} não pode ser negativa.`;
    if (i === 0 && centavos(f.preco_min) !== 0) return "A primeira faixa precisa começar em R$ 0,00.";
    const ultima = i === faixas.length - 1;
    if (ultima && f.preco_max !== null) return "A última faixa precisa ficar aberta (sem preço máximo).";
    if (!ultima && f.preco_max === null) return `Só a última faixa fica sem preço máximo (a faixa ${n} está aberta).`;
    if (f.preco_max !== null && centavos(f.preco_max) <= centavos(f.preco_min)) return `A faixa ${n} termina antes de começar: confira o mínimo e o máximo.`;
    if (i > 0) {
      const anterior = faixas[i - 1];
      if (anterior.preco_max !== null && centavos(f.preco_min) !== centavos(anterior.preco_max) + 1) {
        return `A faixa ${n} precisa começar em ${brl(anterior.preco_max + 0.01)} (um centavo depois do fim da faixa ${i}).`;
      }
    }
  }
  return null;
}

/**
 * Faixa nova para o botão "Adicionar": fecha a última (que era aberta) e abre uma depois dela,
 * com as mesmas taxas. Antes a nova vinha sempre de R$ 0 e quebrava a tabela.
 */
export function comNovaFaixa(faixas: readonly FaixaEditavel[]): FaixaEditavel[] {
  if (faixas.length === 0) return [{ preco_min: 0, preco_max: null, comissao_pct: 0, tarifa_fixa: 0, tarifa_fixa_pct: 0 }];
  const lista = faixas.map((f) => ({ ...f }));
  const ultima = lista[lista.length - 1];
  const fim = ultima.preco_max ?? Math.max(ultima.preco_min * 2, ultima.preco_min + 100) - 0.01;
  ultima.preco_max = Math.round(fim * 100) / 100;
  lista.push({ preco_min: Math.round((ultima.preco_max + 0.01) * 100) / 100, preco_max: null, comissao_pct: ultima.comissao_pct, tarifa_fixa: ultima.tarifa_fixa, tarifa_fixa_pct: ultima.tarifa_fixa_pct ?? 0 });
  return lista;
}

/** Remover uma faixa sem abrir buraco: a seguinte passa a começar onde a removida começava. */
export function semFaixa(faixas: readonly FaixaEditavel[], indice: number): FaixaEditavel[] {
  const lista = faixas.map((f) => ({ ...f }));
  const [removida] = lista.splice(indice, 1);
  if (!removida || lista.length === 0) return lista;
  if (indice < lista.length) lista[indice].preco_min = removida.preco_min;
  else lista[lista.length - 1].preco_max = null;
  return lista;
}

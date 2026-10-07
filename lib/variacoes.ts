/**
 * Variações por quantidade de um produto PAI (0084): "1 un.", "Kit 2", "Kit 12"... Cada
 * variação é um produto filho que consome N do pai. O banco é a fonte da verdade (estoque
 * e custo são derivados por trigger); aqui fica só o que a tela calcula para mostrar e
 * montar o formulário. PURO, coberto por `variacoes.test.ts`.
 */

export const MAX_VARIACOES = 50;
export const MAX_QUANTIDADE_VARIACAO = 100000;

/** Linha do formulário de variações (o que vai para `salvar_variacoes_produto`). */
export interface VariacaoForm {
  /** Ausente = variação nova. */
  id?: string;
  variante_nome: string;
  /** N: quantas unidades do pai uma unidade desta variação consome. */
  quantidade: number;
  sku: string;
  /** null = custo padrão (custo do pai × N). */
  custo_manual: number | null;
  preco_venda: number;
}

/** Variação já gravada, como a tela de Produtos recebe. */
export interface VariacaoSalva extends VariacaoForm {
  id: string;
  produto_pai_id: string;
  custo: number;
  estoque: number;
  ativo: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Estoque de uma variação: quantas dá para montar com o disponível do pai. */
export function estoqueDerivado(estoquePai: number, n: number): number {
  if (!Number.isFinite(estoquePai) || !Number.isFinite(n) || n < 1) return 0;
  return Math.floor(Math.max(0, estoquePai) / Math.floor(n));
}

/** Custo padrão = custo do pai × N. */
export function custoPadrao(custoPai: number, n: number): number {
  return r2((Number.isFinite(custoPai) ? custoPai : 0) * Math.max(1, Math.floor(n)));
}

/** O custo que vale para a variação: o override, ou o padrão. */
export function custoVariacao(custoPai: number, v: Pick<VariacaoForm, "quantidade" | "custo_manual">): number {
  return v.custo_manual != null && Number.isFinite(v.custo_manual) ? r2(v.custo_manual) : custoPadrao(custoPai, v.quantidade);
}

/** Nome padrão: "1 un." para N = 1, "Kit N" para o resto (o mesmo do banco). */
export function nomeVariacao(n: number): string {
  return n === 1 ? "1 un." : `Kit ${n}`;
}

/** SKU sugerido: SKU do pai + "-K" + N. */
export function skuVariacao(skuPai: string, n: number): string {
  return `${skuPai.trim() || "SKU"}-K${n}`;
}

/**
 * "12, 24, 36" (ou "12 24 36", "12;24") → [12, 24, 36]. Ignora o que não é inteiro entre 1 e
 * o limite, e repetidos. Mantém a ordem digitada.
 */
export function interpretarQuantidades(texto: string): number[] {
  const out: number[] = [];
  for (const parte of texto.split(/[\s,;/]+/)) {
    if (!/^\d+$/.test(parte)) continue;
    const n = Number(parte);
    if (n >= 1 && n <= MAX_QUANTIDADE_VARIACAO && !out.includes(n)) out.push(n);
  }
  return out;
}

/**
 * Acrescenta uma variação para cada N que ainda não existe na lista. Preço sugerido = preço
 * do pai × N (o dono ajusta); custo fica no padrão.
 */
export function gerarVariacoes(
  pai: { sku: string; preco_venda: number },
  quantidades: readonly number[],
  existentes: readonly VariacaoForm[],
): VariacaoForm[] {
  const lista = [...existentes];
  const usados = new Set(existentes.map((v) => v.quantidade));
  const nomes = new Set(existentes.map((v) => v.variante_nome.trim().toLowerCase()));
  const skus = new Set(existentes.map((v) => v.sku.trim().toLowerCase()));
  for (const n of quantidades) {
    if (lista.length >= MAX_VARIACOES) break;
    if (usados.has(n)) continue;
    const nome = nomeVariacao(n);
    const sku = skuVariacao(pai.sku, n);
    if (nomes.has(nome.toLowerCase()) || skus.has(sku.toLowerCase())) continue;
    lista.push({ variante_nome: nome, quantidade: n, sku, custo_manual: null, preco_venda: r2(Math.max(0, pai.preco_venda) * n) });
    usados.add(n);
    nomes.add(nome.toLowerCase());
    skus.add(sku.toLowerCase());
  }
  return lista.sort((a, b) => a.quantidade - b.quantidade);
}

/** Problema da lista antes de salvar (null = pode salvar). O banco confere de novo. */
export function problemaVariacoes(lista: readonly VariacaoForm[]): string | null {
  if (lista.length > MAX_VARIACOES) return `No máximo ${MAX_VARIACOES} variações por produto.`;
  const nomes = new Set<string>();
  const skus = new Set<string>();
  for (const v of lista) {
    if (!Number.isInteger(v.quantidade) || v.quantidade < 1 || v.quantidade > MAX_QUANTIDADE_VARIACAO) return "A quantidade de cada variação precisa ser um número inteiro de 1 em diante.";
    if (!v.variante_nome.trim()) return "Dê um nome a cada variação.";
    if (!v.sku.trim()) return "Informe o SKU de cada variação.";
    const nome = v.variante_nome.trim().toLowerCase();
    const sku = v.sku.trim().toLowerCase();
    if (nomes.has(nome)) return `Duas variações com o nome "${v.variante_nome.trim()}".`;
    if (skus.has(sku)) return `Duas variações com o SKU "${v.sku.trim()}".`;
    nomes.add(nome);
    skus.add(sku);
    if (!Number.isFinite(v.preco_venda) || v.preco_venda < 0) return "O preço não pode ser negativo.";
    if (v.custo_manual != null && (!Number.isFinite(v.custo_manual) || v.custo_manual < 0)) return "O custo não pode ser negativo.";
  }
  return null;
}

/** Agrupa as variações pelo pai, em ordem de N. */
export function variacoesPorPai<T extends { produto_pai_id: string; quantidade: number }>(lista: readonly T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const v of lista) m.set(v.produto_pai_id, [...(m.get(v.produto_pai_id) ?? []), v]);
  for (const l of m.values()) l.sort((a, b) => a.quantidade - b.quantidade);
  return m;
}

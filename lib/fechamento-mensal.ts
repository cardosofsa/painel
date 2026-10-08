/**
 * Fechamento mensal do Financeiro (migração 0088): o que se projetou para o mês contra o que
 * realmente aconteceu. Funções puras — a leitura e a escrita no banco ficam em
 * `fechamento-servidor.ts`. Coberto por `fechamento-mensal.test.ts`.
 */

import { inicioDoMes } from "./saldo-projetado";
import type { RelatorioMes } from "./ia/prompts-relatorio";

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Categorias de saída que não são despesa do negócio (mesma regra do `dre_mensal`, 0066). */
const CATEGORIAS_FORA_DAS_DESPESAS = new Set(["Compra de mercadoria", "Devoluções", "Repasse marketplace"]);

export interface MovimentoFonte {
  valor: number;
  categoria: string | null;
  afeta_lucro: boolean;
  referencia_venda_id?: string | null;
  referencia_pedido_compra_id?: string | null;
}

export interface DespesaCategoria {
  categoria: string;
  valor: number;
}

export interface DetalhesMes {
  entradas: number;
  saidas: number;
  /** Entradas menos saídas (caixa), não o lucro. */
  resultadoCaixa: number;
  /** Despesas do negócio por categoria, da maior para a menor. */
  despesas: DespesaCategoria[];
}

export const DETALHES_VAZIOS: DetalhesMes = { entradas: 0, saidas: 0, resultadoCaixa: 0, despesas: [] };

/** Entradas, saídas e despesas por categoria de um mês de lançamentos. */
export function agregarMes(movimentos: MovimentoFonte[]): DetalhesMes {
  let entradas = 0;
  let saidas = 0;
  const porCategoria = new Map<string, number>();
  for (const m of movimentos) {
    const v = Number(m.valor);
    if (!Number.isFinite(v)) continue;
    if (v > 0) entradas += v;
    else if (v < 0) saidas += -v;
    const ehDespesa = v < 0 && m.afeta_lucro && !m.referencia_venda_id && !m.referencia_pedido_compra_id && !CATEGORIAS_FORA_DAS_DESPESAS.has(m.categoria ?? "");
    if (ehDespesa) {
      const cat = m.categoria?.trim() || "Sem categoria";
      porCategoria.set(cat, (porCategoria.get(cat) ?? 0) - v);
    }
  }
  return {
    entradas: centavos(entradas),
    saidas: centavos(saidas),
    resultadoCaixa: centavos(entradas - saidas),
    despesas: [...porCategoria.entries()].map(([categoria, valor]) => ({ categoria, valor: centavos(valor) })).sort((a, b) => b.valor - a.valor),
  };
}

export interface Desvio {
  /** real − projetado: positivo = sobrou mais do que o previsto. */
  diferenca: number;
  /** Em relação ao projetado; `null` quando o projetado é zero. */
  pct: number | null;
  direcao: "acima" | "abaixo" | "igual";
}

/** Quanto a previsão errou. Menos de 1 centavo conta como acerto. */
export function desvioProjecao(projetado: number, real: number): Desvio {
  const diferenca = centavos(real - projetado);
  const pct = Math.abs(projetado) < 0.005 ? null : Math.round((diferenca / Math.abs(projetado)) * 1000) / 10;
  return { diferenca, pct, direcao: Math.abs(diferenca) < 0.005 ? "igual" : diferenca > 0 ? "acima" : "abaixo" };
}

export function mesAnterior(mesIso: string): string {
  const [a, m] = mesIso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10);
}

/** Os `n` meses (1º dia) que antecedem `mesIso`, do mais recente para o mais antigo. */
export function mesesAnteriores(mesIso: string, n: number): string[] {
  const lista: string[] = [];
  let atual = mesIso;
  for (let i = 0; i < n; i++) {
    atual = mesAnterior(atual);
    lista.push(atual);
  }
  return lista;
}

export interface PlanoFechamento {
  mesAtual: string;
  /** Ainda não existe linha do mês corrente: cria com a primeira foto. */
  criarAtual: boolean;
  /** Meses passados ainda abertos. `congelarSaldoAgora`: é o mês anterior e hoje é dia 1, então o saldo de agora é o do fim dele. */
  fechar: { mes: string; congelarSaldoAgora: boolean }[];
}

/** Decide o que o cron/ação deve fazer hoje, a partir do que já existe. */
export function planejarFechamentos(hoje: string, existentes: { mes: string; fechado_em: string | null }[]): PlanoFechamento {
  const mesAtual = inicioDoMes(hoje);
  const anterior = mesAnterior(mesAtual);
  const primeiroDia = hoje.slice(8, 10) === "01";
  return {
    mesAtual,
    criarAtual: !existentes.some((e) => e.mes.slice(0, 10) === mesAtual),
    fechar: existentes
      .filter((e) => !e.fechado_em && e.mes.slice(0, 10) < mesAtual)
      .map((e) => ({ mes: e.mes.slice(0, 10), congelarSaldoAgora: e.mes.slice(0, 10) === anterior && primeiroDia })),
  };
}

export interface CategoriaEmAlta {
  categoria: string;
  valor: number;
  /** Média dos meses anteriores em que a categoria existiu (0 se é nova). */
  media: number;
  /** `null` quando a categoria é nova (sem média para comparar). */
  variacaoPct: number | null;
}

/**
 * Despesas do mês contra a média dos meses anteriores: as que mais cresceram vêm primeiro
 * (e as novas, sem histórico, logo depois). É o insumo de "gastos que valem revisar".
 */
export function categoriasEmAlta(atual: DespesaCategoria[], anteriores: DespesaCategoria[][], limite = 8): CategoriaEmAlta[] {
  const meses = anteriores.length;
  const soma = new Map<string, number>();
  for (const mes of anteriores) for (const d of mes) soma.set(d.categoria, (soma.get(d.categoria) ?? 0) + d.valor);
  return atual
    .map((d) => {
      const media = meses > 0 ? centavos((soma.get(d.categoria) ?? 0) / meses) : 0;
      return { categoria: d.categoria, valor: d.valor, media, variacaoPct: media > 0 ? Math.round(((d.valor - media) / media) * 1000) / 10 : null };
    })
    .sort((a, b) => (b.variacaoPct ?? 1000) - (a.variacaoPct ?? 1000) || b.valor - a.valor)
    .slice(0, limite);
}

/** "outubro de 2026" a partir de 2026-10-01. */
export function rotuloMes(mesIso: string): string {
  const [a, m] = mesIso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export interface SaidaAvulsa {
  descricao: string;
  categoria: string | null;
  valor: number;
}

/** As maiores saídas avulsas do mês (sem venda, sem compra de mercadoria, sem devolução), da maior para a menor. */
export function maioresSaidas(movimentos: (MovimentoFonte & { descricao?: string | null })[], limite = 8): SaidaAvulsa[] {
  return movimentos
    .filter((m) => Number(m.valor) < 0 && m.afeta_lucro && !m.referencia_venda_id && !m.referencia_pedido_compra_id && !CATEGORIAS_FORA_DAS_DESPESAS.has(m.categoria ?? ""))
    .map((m) => ({ descricao: (m.descricao ?? "").trim() || "Sem descrição", categoria: m.categoria?.trim() || null, valor: centavos(-Number(m.valor)) }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, limite);
}

/** Uma linha de `fechamentos_mensais` já com números e com o JSON tipado. */
export interface FechamentoMes {
  id: string;
  /** Primeiro dia do mês (AAAA-MM-01). */
  mes: string;
  saldo_inicial: number;
  projetado_inicial: number;
  projetado_atual: number;
  saldo_real: number;
  fechado_em: string | null;
  detalhes: DetalhesMes;
  relatorio: (RelatorioMes & { gerado_em?: string }) | null;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Lê a linha do banco (`numeric` pode chegar como texto) sem confiar no formato do jsonb. */
export function lerFechamento(linha: Record<string, unknown>): FechamentoMes {
  const d = (linha.detalhes && typeof linha.detalhes === "object" ? linha.detalhes : {}) as Partial<DetalhesMes>;
  const rel = linha.relatorio && typeof linha.relatorio === "object" && !Array.isArray(linha.relatorio) ? (linha.relatorio as FechamentoMes["relatorio"]) : null;
  return {
    id: String(linha.id),
    mes: String(linha.mes).slice(0, 10),
    saldo_inicial: num(linha.saldo_inicial),
    projetado_inicial: num(linha.projetado_inicial),
    projetado_atual: num(linha.projetado_atual),
    saldo_real: num(linha.saldo_real),
    fechado_em: (linha.fechado_em as string | null) ?? null,
    detalhes: {
      entradas: num(d.entradas),
      saidas: num(d.saidas),
      resultadoCaixa: num(d.resultadoCaixa),
      despesas: Array.isArray(d.despesas) ? d.despesas.filter((x) => x && typeof x.categoria === "string").map((x) => ({ categoria: x.categoria, valor: num(x.valor) })) : [],
    },
    relatorio: rel && typeof rel.resumo === "string" ? rel : null,
  };
}

/**
 * Prompt, esquema e leitura da resposta do RELATÓRIO MENSAL do Financeiro.
 *
 * A IA não calcula nada: recebe saldo projetado × real, resultado do mês, despesas que
 * subiram e o que se gasta fixo, tudo já agregado no servidor (`lib/fechamento-servidor.ts`),
 * e devolve a análise. Não recebe dado de cliente final nem linha crua de venda.
 *
 * O cache (`ia_sugestoes.texto`) guarda a resposta CRUA até 6.000 caracteres; os limites de
 * tamanho abaixo mantêm o JSON bem dentro disso.
 */

import { hashTexto, lerObjetoJson, limparCampo, linhas, truncarEmPalavra } from "./texto";

export interface ContextoRelatorioIA {
  /** Ex.: "outubro de 2026". */
  mes: string;
  emAndamento: boolean;
  saldo: { inicial: number; projetadoInicial: number; projetadoAtual: number; real: number; desvioPct: number | null };
  caixa: { entradas: number; saidas: number; resultado: number };
  dre: { receitaBruta: number; taxasMarketplace: number; impostos: number; cmv: number; anuncios: number; despesas: number; lucroLiquido: number; pedidos: number } | null;
  mesesAnteriores: { mes: string; lucroLiquido: number | null; receitaBruta: number | null; desvioPct: number | null }[];
  despesasEmAlta: { categoria: string; valor: number; media: number; variacaoPct: number | null }[];
  despesasFixas: { nome: string; valor: number }[];
  maioresSaidas: { descricao: string; categoria: string | null; valor: number }[];
}

export interface GastoARevisar {
  titulo: string;
  detalhe: string;
  valor: number | null;
}
export interface AcaoDoPlano {
  acao: string;
  motivo: string;
}
export interface RelatorioMes {
  resumo: string;
  acertos: string[];
  previsao: string;
  gastosRevisar: GastoARevisar[];
  oportunidades: string[];
  plano: AcaoDoPlano[];
  metaSaldo: number | null;
}

const brl = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;
const pct = (n: number | null) => (n === null ? "sem base" : `${n.toFixed(1).replace(".", ",")}%`);

export function montarPromptRelatorio(ctx: ContextoRelatorioIA): string {
  const dre = ctx.dre;
  const dados = linhas([
    ["Mês analisado", `${limparCampo(ctx.mes, 40)}${ctx.emAndamento ? " (ainda em andamento)" : " (fechado)"}`],
    ["Saldo das contas no início", brl(ctx.saldo.inicial)],
    ["Saldo previsto para o fim do mês, na primeira previsão", brl(ctx.saldo.projetadoInicial)],
    ["Saldo previsto para o fim do mês, na previsão mais recente", brl(ctx.saldo.projetadoAtual)],
    [ctx.emAndamento ? "Saldo das contas hoje" : "Saldo real no fim do mês", brl(ctx.saldo.real)],
    [ctx.emAndamento ? "Quanto a previsão mudou desde a primeira" : "Diferença do saldo real contra a primeira previsão", pct(ctx.saldo.desvioPct)],
    ["Entradas no caixa", brl(ctx.caixa.entradas)],
    ["Saídas do caixa", brl(ctx.caixa.saidas)],
    ["Resultado de caixa", brl(ctx.caixa.resultado)],
    ["Receita bruta de vendas", dre ? brl(dre.receitaBruta) : null],
    ["Pedidos", dre ? String(dre.pedidos) : null],
    ["Taxas dos marketplaces", dre ? brl(dre.taxasMarketplace) : null],
    ["Impostos", dre ? brl(dre.impostos) : null],
    ["Custo das mercadorias vendidas", dre ? brl(dre.cmv) : null],
    ["Gasto com anúncios pagos", dre ? brl(dre.anuncios) : null],
    ["Despesas do negócio", dre ? brl(dre.despesas) : null],
    ["Lucro líquido do mês", dre ? brl(dre.lucroLiquido) : null],
  ]);

  const anteriores = ctx.mesesAnteriores
    .map((m) => `- ${limparCampo(m.mes, 30)}: lucro líquido ${m.lucroLiquido === null ? "sem dado" : brl(m.lucroLiquido)}, receita ${m.receitaBruta === null ? "sem dado" : brl(m.receitaBruta)}, previsão errou ${pct(m.desvioPct)}`)
    .join("\n");
  const emAlta = ctx.despesasEmAlta
    .map((d) => `- ${limparCampo(d.categoria, 60)}: ${brl(d.valor)} (média anterior ${brl(d.media)}, variação ${pct(d.variacaoPct)})`)
    .join("\n");
  const fixas = ctx.despesasFixas.map((d) => `- ${limparCampo(d.nome, 60)}: ${brl(d.valor)}`).join("\n");
  const saidas = ctx.maioresSaidas
    .map((s) => `- ${limparCampo(s.descricao, 60)}${s.categoria ? ` (${limparCampo(s.categoria, 40)})` : ""}: ${brl(s.valor)}`)
    .join("\n");

  return `Você é a Vixe, consultora financeira de um pequeno vendedor online brasileiro. Fale direto, em português simples, sem jargão, como quem quer ver o negócio crescer.

Números do mês (já calculados pelo sistema, estão certos):
${dados}
${anteriores ? `\nMeses anteriores:\n${anteriores}\n` : ""}${emAlta ? `\nDespesas por categoria contra a média dos meses anteriores:\n${emAlta}\n` : ""}${fixas ? `\nDespesas fixas cadastradas:\n${fixas}\n` : ""}${saidas ? `\nMaiores saídas avulsas do mês:\n${saidas}\n` : ""}
Responda em JSON com:
- resumo: 2 a 3 frases sobre como o mês foi, citando os números mais importantes (até 400 caracteres).
- acertos: de 1 a 3 coisas que foram bem (até 150 caracteres cada).
- previsao: onde a previsão de saldo acertou ou errou e o provável motivo (até 300 caracteres).
- gastos_revisar: de 0 a 4 gastos que valem revisar (subiram sem explicação, parecem duplicados ou pesam muito para o que entregam). Cada um com titulo (até 50), detalhe (até 160) e valor (número em reais ou null).
- oportunidades: de 1 a 3 formas de ganhar mais ou gastar melhor, olhando margem, taxas, anúncios e o que se repete entre os meses (até 150 caracteres cada).
- plano: de 3 a 4 ações para o próximo mês, cada uma com acao (até 100) e motivo (até 150).
- meta_saldo: o saldo que vale mirar no fim do próximo mês, em reais (número), ou null se faltar base.

Regras:
- Use SOMENTE os números e nomes fornecidos. Não invente valor, categoria, taxa, concorrente, meta de mercado nem dado que não está acima.
- Se algo não tem dado suficiente, diga isso em vez de supor.
- Só chame um gasto de desnecessário quando os números apontarem isso (subiu muito, é novo ou é grande frente à receita); caso contrário, sugira apenas revisar.
- ${ctx.emAndamento ? "O mês ainda não acabou: trate a análise como parcial e fale em ritmo, não em resultado final." : "O mês já fechou: fale em resultado final."}
- Sem emoji, sem markdown, sem HTML.`;
}

export function esquemaRelatorio() {
  return {
    type: "object",
    properties: {
      resumo: { type: "string" },
      acertos: { type: "array", items: { type: "string" } },
      previsao: { type: "string" },
      gastos_revisar: {
        type: "array",
        items: {
          type: "object",
          properties: { titulo: { type: "string" }, detalhe: { type: "string" }, valor: { type: ["number", "null"] } },
          required: ["titulo", "detalhe"],
        },
      },
      oportunidades: { type: "array", items: { type: "string" } },
      plano: {
        type: "array",
        items: { type: "object", properties: { acao: { type: "string" }, motivo: { type: "string" } }, required: ["acao", "motivo"] },
      },
      meta_saldo: { type: ["number", "null"] },
    },
    required: ["resumo", "acertos", "previsao", "gastos_revisar", "oportunidades", "plano"],
  };
}

function texto(v: unknown, max: number): string {
  return typeof v === "string" ? truncarEmPalavra(v.replace(/\s+/g, " ").trim(), max) : "";
}

function listaDeTextos(v: unknown, max: number, itens: number): string[] {
  const saida: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const t = texto(x, max);
    if (t) saida.push(t);
    if (saida.length >= itens) break;
  }
  return saida;
}

function numeroOuNulo(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Lê a resposta e devolve algo seguro para a tela. Nunca lança; campo ruim vira vazio. */
export function interpretarRelatorio(bruto: string): RelatorioMes {
  const obj = lerObjetoJson(bruto) ?? {};

  const gastosRevisar: GastoARevisar[] = [];
  for (const g of Array.isArray(obj.gastos_revisar) ? obj.gastos_revisar : []) {
    if (!g || typeof g !== "object") continue;
    const r = g as Record<string, unknown>;
    const titulo = texto(r.titulo, 50);
    const detalhe = texto(r.detalhe, 160);
    if (!titulo || !detalhe) continue;
    const valor = numeroOuNulo(r.valor);
    gastosRevisar.push({ titulo, detalhe, valor: valor !== null && valor >= 0 ? valor : null });
    if (gastosRevisar.length >= 4) break;
  }

  const plano: AcaoDoPlano[] = [];
  for (const p of Array.isArray(obj.plano) ? obj.plano : []) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const acao = texto(r.acao, 100);
    const motivo = texto(r.motivo, 150);
    if (!acao) continue;
    plano.push({ acao, motivo });
    if (plano.length >= 4) break;
  }

  return {
    resumo: texto(obj.resumo, 400),
    acertos: listaDeTextos(obj.acertos, 150, 3),
    previsao: texto(obj.previsao, 300),
    gastosRevisar,
    oportunidades: listaDeTextos(obj.oportunidades, 150, 3),
    plano,
    metaSaldo: numeroOuNulo(obj.meta_saldo),
  };
}

/** Relatório sem nada aproveitável: o modelo falhou e a vaga não volta (o token foi gasto). */
export const relatorioVazio = (r: RelatorioMes) => !r.resumo && r.plano.length === 0;

/** Centavos arredondados: variação de poeira não pode invalidar o cache. */
export function hashContextoRelatorio(ctx: ContextoRelatorioIA): string {
  const n = (v: number | null) => (v === null ? "" : Math.round(v).toString());
  return hashTexto(
    [
      "relatorio-v1",
      ctx.mes,
      ctx.emAndamento ? "1" : "0",
      n(ctx.saldo.inicial),
      n(ctx.saldo.projetadoInicial),
      n(ctx.saldo.projetadoAtual),
      n(ctx.saldo.real),
      n(ctx.caixa.entradas),
      n(ctx.caixa.saidas),
      ctx.dre ? [ctx.dre.receitaBruta, ctx.dre.taxasMarketplace, ctx.dre.cmv, ctx.dre.anuncios, ctx.dre.despesas, ctx.dre.lucroLiquido, ctx.dre.pedidos].map(n).join(",") : "",
      ctx.mesesAnteriores.map((m) => `${m.mes}:${n(m.lucroLiquido)}:${n(m.receitaBruta)}`).join(";"),
      ctx.despesasEmAlta.map((d) => `${d.categoria}:${n(d.valor)}`).join(";"),
      ctx.despesasFixas.map((d) => `${d.nome}:${n(d.valor)}`).join(";"),
      ctx.maioresSaidas.map((s) => `${s.descricao}:${n(s.valor)}`).join(";"),
    ].join("\u0001"),
  );
}

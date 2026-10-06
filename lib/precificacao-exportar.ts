/**
 * Tabelas de exportação da Precificação (histórico, produtos com variações e calculadora em
 * massa), no formato do `ExportarModal`: Excel (.xlsx), PDF, imagem ou CSV.
 *
 * Antes cada uma montava um CSV à mão, com o número em texto ("12.50" via `toFixed`) e,
 * nas duas últimas, cabeçalho com a chave interna ("precoSugerido", "novoLucro"). Aqui o
 * dinheiro e o percentual saem como NÚMERO tipado: no Excel somam, filtram e já aparecem
 * como "R$" e "%". Puro, coberto por `precificacao-exportar.test.ts`.
 */

import type { TabelaExport } from "./exportar";
import { hojeIsoBrasil } from "./format";
import type { AnuncioSalvo, PrecificacaoHist, VariacaoSalva } from "./precificacao-tipos";
import type { ResultadoLinhaMassa } from "./precificacao-massa";

/** Dinheiro no centavo e percentual em 4 casas (0,2846 = 28,46%): o banco guarda o preço
 * sem arredondar, e o CSV saía com "73,91304347826087". */
const rs = (n: number) => Math.round(n * 100) / 100;
const pct = (n: number) => Math.round(n * 10000) / 10000;
/** Lucro sobre o preço; 0 quando não há preço (evita NaN na planilha). */
const margem = (lucro: number, preco: number) => pct(preco > 0 ? lucro / preco : 0);
/** Lucro sobre o custo (o "markup" da calculadora). */
const markup = (lucro: number, custo: number) => pct(custo > 0 ? lucro / custo : 0);
/** `timestamptz` → dia no Brasil. `slice(0, 10)` dava o dia seguinte depois das 21h. */
const diaBrasil = (iso: string) => hojeIsoBrasil(new Date(iso));

export function tabelaPrecificacoes(lista: PrecificacaoHist[], subtitulo?: string): TabelaExport<PrecificacaoHist> {
  return {
    titulo: "Precificações",
    subtitulo,
    colunas: [
      { rotulo: "Data", tipo: "data", valor: (h) => diaBrasil(h.criado_em) },
      { rotulo: "Produto / kit", largura: 30, valor: (h) => h.produto_nome },
      { rotulo: "Canal", largura: 18, valor: (h) => h.canal ?? "" },
      { rotulo: "Título do anúncio", largura: 34, valor: (h) => h.titulo_anuncio ?? "" },
      { rotulo: "Custo", tipo: "moeda", valor: (h) => rs(h.custo) },
      { rotulo: "Comissão", tipo: "percentual", valor: (h) => pct(h.taxa_variavel_pct) },
      { rotulo: "Taxa fixa", tipo: "moeda", valor: (h) => rs(h.taxa_fixa) },
      { rotulo: "Imposto", tipo: "percentual", valor: (h) => pct(h.imposto_pct) },
      { rotulo: "Preço de venda", tipo: "moeda", valor: (h) => rs(h.preco_calculado) },
      { rotulo: "Lucro", tipo: "moeda", valor: (h) => rs(h.lucro) },
      { rotulo: "Margem", tipo: "percentual", valor: (h) => margem(h.lucro, h.preco_calculado) },
      { rotulo: "Markup sobre o custo", tipo: "percentual", valor: (h) => markup(h.lucro, h.custo) },
    ],
    linhas: lista,
  };
}

type LinhaVariacao = { a: AnuncioSalvo; v: VariacaoSalva };

export function tabelaVariacoes(anuncios: AnuncioSalvo[], subtitulo?: string): TabelaExport<LinhaVariacao> {
  return {
    titulo: "Produtos com variações",
    subtitulo,
    colunas: [
      { rotulo: "Data", tipo: "data", valor: (l) => diaBrasil(l.a.criado_em) },
      { rotulo: "Anúncio", largura: 30, valor: (l) => l.a.nome_anuncio },
      { rotulo: "Variação", largura: 16, valor: (l) => l.v.nome_variacao },
      { rotulo: "Multiplicador", tipo: "numero", valor: (l) => l.v.multiplicador },
      { rotulo: "Custo", tipo: "moeda", valor: (l) => rs(l.v.custo) },
      { rotulo: "Comissão", tipo: "percentual", valor: (l) => pct(l.v.taxa_variavel_pct) },
      { rotulo: "Taxa fixa", tipo: "moeda", valor: (l) => rs(l.v.taxa_fixa) },
      { rotulo: "Preço de venda", tipo: "moeda", valor: (l) => rs(l.v.preco_calculado) },
      { rotulo: "Lucro", tipo: "moeda", valor: (l) => rs(l.v.lucro) },
      { rotulo: "Margem", tipo: "percentual", valor: (l) => margem(l.v.lucro, l.v.preco_calculado) },
      { rotulo: "Markup sobre o custo", tipo: "percentual", valor: (l) => markup(l.v.lucro, l.v.custo) },
    ],
    linhas: anuncios.flatMap((a) => a.variacoes.map((v) => ({ a, v }))),
  };
}

export function tabelaEmMassa(resultados: ResultadoLinhaMassa[], subtitulo?: string): TabelaExport<ResultadoLinhaMassa> {
  return {
    titulo: "Precificação em massa",
    subtitulo,
    colunas: [
      { rotulo: "Loja", largura: 22, valor: (r) => (r.loja ? `${r.loja.canalNome} — ${r.loja.nome}` : "Manual") },
      { rotulo: "SKU", valor: (r) => r.linha.sku },
      { rotulo: "Produto", largura: 30, valor: (r) => r.linha.nome },
      { rotulo: "Custo", tipo: "moeda", valor: (r) => rs(r.linha.custo) },
      { rotulo: "Preço sugerido", tipo: "moeda", valor: (r) => rs(r.resultado.precoVenda) },
      { rotulo: "Preço atual", tipo: "moeda", valor: (r) => (r.linha.precoAtual > 0 ? rs(r.linha.precoAtual) : null) },
      { rotulo: "Diferença", tipo: "moeda", valor: (r) => (r.linha.precoAtual > 0 ? rs(r.diferenca) : null) },
      { rotulo: "Lucro esperado", tipo: "moeda", valor: (r) => rs(r.resultado.lucroLiquido) },
      { rotulo: "Margem", tipo: "percentual", valor: (r) => pct(r.resultado.margemEfetivaPct) },
    ],
    linhas: resultados,
  };
}

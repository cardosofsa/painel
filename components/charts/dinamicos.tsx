"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/Skeleton";
import { ALTURA_GRAFICO } from "./tema";

/**
 * Os gráficos, carregados sob demanda. **É daqui que as telas importam** — nunca do arquivo
 * do gráfico direto (`lib/importacoes-pesadas.test.ts` cobra isso).
 *
 * O Recharts (com o d3 que ele puxa) é das maiores dependências do cliente, e importado estático
 * ele entrava no JavaScript inicial do Dashboard, do Financeiro, de Vendas, da Precificação
 * e do Admin: a tela só ficava interativa depois de baixar e executar a biblioteca, mesmo
 * com o gráfico lá embaixo. Com `next/dynamic` ele vira um pedaço à parte, que desce em
 * paralelo depois que a tela já responde.
 *
 * `ssr: false` porque o gráfico não tem nada a desenhar no servidor: o
 * `ResponsiveContainer` mede a largura do pai no navegador. No lugar dele vai um esqueleto
 * com a altura exata do gráfico (`ALTURA_GRAFICO`), para a tela não pular quando ele chega.
 *
 * Funciona com a CSP: o `script-src` tem `'strict-dynamic'`, que confia nos pedaços que o
 * próprio runtime do Next (já carregado com nonce) busca.
 */
function esqueleto(altura: number) {
  function EsqueletoGrafico() {
    return (
      <div style={{ height: altura }} aria-hidden>
        <Skeleton className="h-full w-full rounded-md" />
      </div>
    );
  }
  return EsqueletoGrafico;
}

export type { PontoComparado } from "./VendasComparadasChart";

export const CashFlowChart = dynamic(() => import("./CashFlowChart").then((m) => m.CashFlowChart), {
  ssr: false,
  loading: esqueleto(ALTURA_GRAFICO.fluxoCaixa),
});

export const CategoryBarChart = dynamic(() => import("./CategoryBarChart").then((m) => m.CategoryBarChart), {
  ssr: false,
  loading: esqueleto(ALTURA_GRAFICO.categorias),
});

export const FaturamentoLucroChart = dynamic(() => import("./FaturamentoLucroChart").then((m) => m.FaturamentoLucroChart), {
  ssr: false,
  loading: esqueleto(ALTURA_GRAFICO.faturamentoLucro),
});

export const GrowthChart = dynamic(() => import("./GrowthChart").then((m) => m.GrowthChart), {
  ssr: false,
  loading: esqueleto(ALTURA_GRAFICO.crescimento),
});

export const PriceBreakdownChart = dynamic(() => import("./PriceBreakdownChart").then((m) => m.PriceBreakdownChart), {
  ssr: false,
  loading: esqueleto(ALTURA_GRAFICO.composicaoPreco),
});

export const PriceHistoryChart = dynamic(() => import("./PriceHistoryChart").then((m) => m.PriceHistoryChart), {
  ssr: false,
  loading: esqueleto(ALTURA_GRAFICO.historicoPreco),
});

export const SalesChart = dynamic(() => import("./SalesChart").then((m) => m.SalesChart), {
  ssr: false,
  loading: esqueleto(ALTURA_GRAFICO.vendas),
});

export const VendasComparadasChart = dynamic(() => import("./VendasComparadasChart").then((m) => m.VendasComparadasChart), {
  ssr: false,
  loading: esqueleto(ALTURA_GRAFICO.vendasComparadas),
});

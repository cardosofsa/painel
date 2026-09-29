"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { History } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { CalculadoraEmMassa } from "@/components/precificacao/CalculadoraEmMassa";
import { VariacoesView } from "@/components/precificacao/VariacoesView";
import { PainelEntradas } from "@/components/precificacao/PainelEntradas";
import { PainelTaxas } from "@/components/precificacao/PainelTaxas";
import { PainelModo } from "@/components/precificacao/PainelModo";
import { PainelConcorrentes } from "@/components/precificacao/PainelConcorrentes";
import { PainelResultado } from "@/components/precificacao/PainelResultado";
import { HistoricoPrecificacoes } from "@/components/precificacao/HistoricoPrecificacoes";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import {
  usePrecificacao,
  type PrecificacaoHist,
  type LojaOpcao,
  type AnuncioSalvo,
  type ProdutoOpcao,
} from "@/lib/precificacao-estado";
import type { Concorrente } from "@/lib/pricing";

export type { PrecificacaoHist, LojaOpcao, AnuncioSalvo, ProdutoOpcao, VariacaoSalva } from "@/lib/precificacao-estado";

const ABAS_PRECIFICACAO = [
  { value: "individual", label: "Individual" },
  { value: "variacoes", label: "Variações" },
  { value: "massa", label: "Em Massa" },
  { value: "historico", label: "Histórico" },
] as const satisfies readonly TabItem<"individual" | "variacoes" | "massa" | "historico">[];

/**
 * Calculadora de Precificação.
 *
 * O estado e os cálculos moram em `lib/precificacao-estado.ts` (hook `usePrecificacao`);
 * cada seção visual virou um componente em `components/precificacao/Painel*.tsx`. Este
 * arquivo só monta as abas e passa o `estado` adiante — era 1.575 linhas antes da divisão.
 */
export function PrecificacaoClient({
  historico,
  produtos,
  aliquotaDasPadrao,
  lojas,
  anuncios,
  concorrentesPorProduto,
  iaDisponivel,
}: {
  historico: PrecificacaoHist[];
  produtos: ProdutoOpcao[];
  aliquotaDasPadrao: number;
  lojas: LojaOpcao[];
  anuncios: AnuncioSalvo[];
  concorrentesPorProduto: Record<string, Concorrente[]>;
  /** Vem do servidor: `GEMINI_API_KEY` não pode ser lida no cliente. */
  iaDisponivel: boolean;
}) {
  const estado = usePrecificacao({ historico, produtos, aliquotaDasPadrao, lojas, anuncios, concorrentesPorProduto });
  const { visao, setVisao } = estado;

  return (
    <>
      <PageHeader title="Calculadora de Precificação" />

      {/* Estas quatro abas eram <button> cru: sem indicador, sem ARIA e sem teclado —
          na tela mais importante do produto, enquanto Admin e Configurações já usavam
          o <Tabs>. Duas telas do mesmo app navegavam de jeitos visualmente diferentes. */}
      <Tabs tabs={ABAS_PRECIFICACAO} value={visao} onChange={setVisao} className="mb-5" />

      {visao === "massa" && <CalculadoraEmMassa produtos={produtos} lojas={lojas} historico={historico} setVisao={setVisao} />}

      {visao === "variacoes" && (
        <VariacoesView
          produtos={produtos}
          lojas={lojas}
          anuncios={anuncios}
          aliquotaDasPadrao={aliquotaDasPadrao}
          confirm={estado.confirm}
          setVisao={setVisao}
          exportarAnunciosCsv={estado.exportarAnunciosCsv}
          iaDisponivel={iaDisponivel}
        />
      )}

      {visao === "individual" && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <PainelEntradas estado={estado} produtos={produtos} iaDisponivel={iaDisponivel} />
              <PainelTaxas estado={estado} lojas={lojas} />
              <PainelModo estado={estado} />
              <PainelConcorrentes estado={estado} />
            </div>

            <div className="space-y-5">
              <PainelResultado estado={estado} produtoVinculado={estado.produtoVinculado} />
            </div>
          </div>

          <Card className="mt-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-text-primary">Precificações Salvas</h2>
              <div className="flex items-center gap-3">
                <button onClick={estado.exportarHistoricoCsv} className="text-xs text-accent hover:underline">
                  Exportar CSV
                </button>
                <IconButton onClick={() => setVisao("historico")} aria-label="Ver histórico completo" title="Ver histórico completo">
                  <History size={14} />
                </IconButton>
              </div>
            </div>
            <div className="space-y-2">
              {historico
                .filter((h) => h.origem === "individual")
                .slice(0, 5)
                .map((h) => (
                  <div key={h.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2 text-sm">
                    <div>
                      <div className="text-text-primary">{h.produto_nome}</div>
                      <div className="text-xs text-text-tertiary">{new Date(h.criado_em).toLocaleDateString("pt-BR")}</div>
                    </div>
                    <span className="font-mono text-accent">{formatBRL(h.preco_calculado)}</span>
                  </div>
                ))}
              {historico.filter((h) => h.origem === "individual").length === 0 && (
                <p className="text-sm text-text-tertiary text-center py-4">Nenhuma precificação salva ainda.</p>
              )}
            </div>
          </Card>
        </>
      )}

      {visao === "historico" && <HistoricoPrecificacoes estado={estado} anuncios={anuncios} />}

      {estado.modaisExportacao}
      {estado.ConfirmDialog}
    </>
  );
}

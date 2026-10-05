import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatBRL } from "@/lib/format";
import type { ComparacaoPeriodos, FluxoProximo, ProdutoParado, ProdutoRanking } from "@/lib/vixe/insights";

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

function Variacao({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="text-xs text-text-tertiary">sem comparação</span>;
  const Icone = valor > 0.005 ? ArrowUpRight : valor < -0.005 ? ArrowDownRight : Minus;
  const cor = valor > 0.005 ? "text-positive" : valor < -0.005 ? "text-negative" : "text-text-tertiary";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${cor}`}>
      <Icone size={13} /> {valor > 0 ? "+" : ""}
      {pct(valor)}
    </span>
  );
}

function Indicador({ rotulo, valor, variacao }: { rotulo: string; valor: string; variacao: number | null }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-text-tertiary">{rotulo}</div>
      <div className="text-lg font-semibold font-mono tabular text-text-primary mt-0.5">{valor}</div>
      <Variacao valor={variacao} />
    </div>
  );
}

/** Frase-resumo da Vixe sobre o mês, feita por regra (sem IA). */
function resumo(p: ComparacaoPeriodos): string {
  const v = p.variacao;
  if (p.atual.vendas === 0) return "Nenhuma venda registrada nos últimos 30 dias.";
  if (v.faturamento == null) return `Nos últimos 30 dias foram ${p.atual.vendas} vendas, somando ${formatBRL(p.atual.faturamento)}.`;
  const direcao = v.faturamento >= 0 ? `subiu ${pct(v.faturamento)}` : `caiu ${pct(Math.abs(v.faturamento))}`;
  const lucro =
    v.lucro != null && Math.sign(v.lucro) !== Math.sign(v.faturamento)
      ? v.lucro >= 0
        ? " Mesmo assim o lucro cresceu: você está vendendo melhor."
        : " Mas o lucro caiu: vale olhar custos e descontos."
      : "";
  return `O faturamento ${direcao} em relação aos 30 dias anteriores.${lucro}`;
}

export function VixeInsights({
  periodos,
  ranking,
  parados,
  totalParado,
  fluxo,
  janelaParadoDias,
  falhas,
}: {
  periodos: ComparacaoPeriodos | null;
  ranking: ProdutoRanking[] | null;
  parados: ProdutoParado[] | null;
  totalParado: number;
  fluxo: FluxoProximo | null;
  janelaParadoDias: number;
  falhas: string[];
}) {
  return (
    <div className="space-y-5">
      {falhas.length > 0 && (
        <p className="text-xs text-negative border border-negative/30 bg-negative-soft rounded-md px-3 py-2">
          Parte dos dados não carregou ({falhas.join("; ")}). O que aparece abaixo está certo, mas pode estar incompleto.
        </p>
      )}

      {periodos && (
        <Card>
          <h3 className="font-semibold text-text-primary">Últimos 30 dias</h3>
          <p className="text-sm text-text-secondary mt-0.5 mb-3">{resumo(periodos)}</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Indicador rotulo="Faturamento" valor={formatBRL(periodos.atual.faturamento)} variacao={periodos.variacao.faturamento} />
            <Indicador rotulo="Lucro" valor={formatBRL(periodos.atual.lucro)} variacao={periodos.variacao.lucro} />
            <Indicador rotulo="Vendas" valor={String(periodos.atual.vendas)} variacao={periodos.variacao.vendas} />
            <Indicador rotulo="Ticket médio" valor={formatBRL(periodos.atual.ticketMedio)} variacao={periodos.variacao.ticketMedio} />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {ranking && (
          <Card>
            <h3 className="font-semibold text-text-primary mb-1">Quem traz o lucro</h3>
            <p className="text-xs text-text-tertiary mb-3">Lucro dos itens nos últimos 30 dias (preço menos custo, antes de taxas).</p>
            {ranking.length === 0 ? (
              <p className="text-sm text-text-tertiary">Nenhum item vendido no período.</p>
            ) : (
              <ul className="space-y-2.5">
                {ranking.map((r) => (
                  <li key={r.chave}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="text-text-primary truncate">{r.nome}</span>
                      <span className="font-mono tabular text-text-primary shrink-0">{formatBRL(r.lucro)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full bg-accent" style={{ width: `${Math.round(r.participacaoLucro * 100)}%` }} />
                      </div>
                      <span className="text-xs text-text-tertiary w-24 text-right shrink-0">
                        {r.quantidade} un · {pct(r.participacaoLucro)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {parados && (
          <Card>
            <h3 className="font-semibold text-text-primary mb-1">Dinheiro parado no estoque</h3>
            <p className="text-xs text-text-tertiary mb-3">
              Produtos com estoque que não venderam nada em {janelaParadoDias} dias
              {totalParado > 0 ? `: ${formatBRL(totalParado)} a preço de custo.` : "."}
            </p>
            {parados.length === 0 ? (
              <p className="text-sm text-text-tertiary">Tudo girando. Nenhum produto parado.</p>
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {parados.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3 py-1.5 text-sm">
                      <span className="text-text-primary truncate">{p.nome}</span>
                      <span className="text-text-secondary shrink-0">
                        {p.estoque} un · <span className="font-mono tabular">{formatBRL(p.capital)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text-tertiary mt-3">
                  Ideia: monte um kit, faça uma promoção ou divulgue com uma{" "}
                  <Link href="/vixe/textos" className="text-accent hover:underline">
                    legenda da Vixe
                  </Link>
                  .
                </p>
              </>
            )}
          </Card>
        )}
      </div>

      {fluxo && (
        <Card>
          <h3 className="font-semibold text-text-primary mb-1">Próximos 30 dias no caixa</h3>
          <p className="text-xs text-text-tertiary mb-3">Contas a receber (inclui crediário) e a pagar ainda em aberto.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-text-tertiary">A receber</div>
              <div className="text-lg font-semibold font-mono tabular text-positive">{formatBRL(fluxo.receber.ate30)}</div>
              <div className="text-xs text-text-tertiary">{formatBRL(fluxo.receber.ate7)} nos próximos 7 dias</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-text-tertiary">A pagar</div>
              <div className="text-lg font-semibold font-mono tabular text-negative">{formatBRL(fluxo.pagar.ate30)}</div>
              <div className="text-xs text-text-tertiary">{formatBRL(fluxo.pagar.ate7)} nos próximos 7 dias</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-text-tertiary">Saldo previsto</div>
              <div className={`text-lg font-semibold font-mono tabular ${fluxo.saldo30 >= 0 ? "text-text-primary" : "text-negative"}`}>{formatBRL(fluxo.saldo30)}</div>
              <div className="text-xs text-text-tertiary">sem contar o que já está atrasado</div>
            </div>
          </div>
          {(fluxo.receber.atrasado > 0 || fluxo.pagar.atrasado > 0) && (
            <p className="text-sm text-text-secondary mt-3">
              Atrasado: {formatBRL(fluxo.receber.atrasado)} a receber e {formatBRL(fluxo.pagar.atrasado)} a pagar.{" "}
              <Link href="/vixe" className="text-accent hover:underline">
                Ver nos alertas
              </Link>
            </p>
          )}
        </Card>
      )}

      {!periodos && !ranking && !parados && !fluxo && (
        <Card>
          <p className="text-sm text-text-secondary">Os insights usam Vendas, Estoque e Financeiro. Peça ao administrador para liberar essas abas.</p>
        </Card>
      )}
    </div>
  );
}

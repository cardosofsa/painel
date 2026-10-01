"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowRightLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { BarraFiltros, FiltroChips, FiltroSelect } from "@/components/ui/BarraFiltros";
import { MovimentacaoModal } from "@/components/estoque/MovimentacaoModal";
import { formatBRL, formatarDataHora } from "@/lib/format";

export interface ProdutoEstoque {
  id: string;
  sku: string;
  nome: string;
  custo: number;
  estoque: number;
  estoque_minimo: number;
  armazem_id: string | null;
  ativo?: boolean;
}

export interface Armazem {
  id: string;
  nome: string;
  endereco: string | null;
  lojas_abastecidas: string[];
}

export interface SaldoArmazem {
  produto_id: string;
  armazem_id: string;
  quantidade: number;
}

export interface Movimentacao {
  id?: string;
  produto_nome: string;
  tipo: "entrada" | "saida" | "transferencia";
  quantidade: number;
  motivo: string | null;
  data_movimentacao: string;
  armazem_id?: string | null;
  armazem_destino_id?: string | null;
}

const SITUACOES = ["Todos", "Repor", "OK"] as const;
type Situacao = (typeof SITUACOES)[number];

export function EstoqueClient({
  produtos,
  armazens,
  movimentacoes,
  saldos,
  porArmazem,
  reservado = {},
}: {
  /** produto → reservado em pedidos da esteira (0052). */
  reservado?: Record<string, number>;
  produtos: ProdutoEstoque[];
  armazens: Armazem[];
  movimentacoes: Movimentacao[];
  saldos: SaldoArmazem[];
  /** `false` antes da migração 0041: saldos derivados do armazém padrão, sem transferência. */
  porArmazem: boolean;
}) {
  const [modal, setModal] = useState<{ armazemId: string | null } | null>(null);
  const [busca, setBusca] = useState("");
  const [armazemFiltro, setArmazemFiltro] = useState("");
  const [situacao, setSituacao] = useState<Situacao>("Todos");

  const produtoPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const nomeArmazem = useMemo(() => new Map(armazens.map((a) => [a.id, a.nome])), [armazens]);

  const totalUnidades = produtos.reduce((acc, p) => acc + p.estoque, 0);
  const totalReservado = Object.values(reservado).reduce((a, n) => a + n, 0);
  const criticos = produtos.filter((p) => p.estoque <= p.estoque_minimo).length;
  const valorTotal = produtos.reduce((acc, p) => acc + p.estoque * p.custo, 0);

  /** Linhas por armazém já filtradas pela busca e pela situação (situação olha o total). */
  const porArmazemFiltrado = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const mapa = new Map<string, { produto: ProdutoEstoque; quantidade: number }[]>();
    for (const s of saldos) {
      if (s.quantidade <= 0) continue;
      const p = produtoPorId.get(s.produto_id);
      if (!p) continue;
      if (t && !p.nome.toLowerCase().includes(t) && !p.sku.toLowerCase().includes(t)) continue;
      const ok = p.estoque > p.estoque_minimo;
      if (situacao === "Repor" && ok) continue;
      if (situacao === "OK" && !ok) continue;
      mapa.set(s.armazem_id, [...(mapa.get(s.armazem_id) ?? []), { produto: p, quantidade: s.quantidade }]);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.produto.nome.localeCompare(b.produto.nome, "pt-BR"));
    return mapa;
  }, [saldos, produtoPorId, busca, situacao]);

  const armazensVisiveis = armazens.filter((a) => !armazemFiltro || a.id === armazemFiltro);
  const filtrosAtivos = (armazemFiltro ? 1 : 0) + (situacao === "Todos" ? 0 : 1);

  return (
    <>
      <PageHeader
        title="Armazéns & Estoque"
        actions={
          <Button variant="primary" onClick={() => setModal({ armazemId: armazemFiltro || null })} disabled={armazens.length === 0}>
            Registrar Movimentação
          </Button>
        }
      />

      {!porArmazem && (
        <p className="text-xs text-text-secondary border border-border bg-surface-2 rounded-md px-3 py-2 mb-4">
          Saldo por armazém e transferência ficam disponíveis depois de aplicar a migração 0041. Até lá, cada produto conta no armazém dele.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card>
          <CardEyebrow>Estoque Físico Total</CardEyebrow>
          <HeroMetric
            value={`${totalUnidades} un.`}
            accent
            caption={totalReservado > 0 ? `${totalReservado} reservado(s) em pedidos · ${totalUnidades - totalReservado} disponível(is)` : "nenhum reservado em pedidos"}
          />
        </Card>
        <Link href="/estoque/valor" className="group block rounded-lg focus-visible:outline-2 focus-visible:outline-accent" aria-label="Ver detalhes do valor em estoque">
          <Card className="h-full group-hover:border-accent transition-colors">
            <div className="flex items-center justify-between">
              <CardEyebrow>Valor Total em Estoque</CardEyebrow>
              <ChevronRight size={16} className="text-text-tertiary group-hover:text-accent" />
            </div>
            <HeroMetric value={formatBRL(valorTotal)} caption="por armazém, categoria, giro e parados" />
          </Card>
        </Link>
        <Card>
          <CardEyebrow>Reposição Necessária</CardEyebrow>
          <HeroMetric value={String(criticos)} caption="produtos no mínimo ou abaixo" />
        </Card>
        <Card>
          <CardEyebrow>Armazéns Ativos</CardEyebrow>
          <HeroMetric value={String(armazens.length)} />
        </Card>
      </div>

      <BarraFiltros
        busca={busca}
        onBusca={setBusca}
        placeholder="Buscar produto ou SKU…"
        ativos={filtrosAtivos}
        onLimpar={() => {
          setBusca("");
          setArmazemFiltro("");
          setSituacao("Todos");
        }}
        situacao={<FiltroChips rotulo="Situação" valor={situacao} onChange={setSituacao} opcoes={SITUACOES.map((s) => ({ valor: s, rotulo: s }))} />}
      >
        <FiltroSelect rotulo="Armazém" valor={armazemFiltro} onChange={setArmazemFiltro} opcoes={armazens.map((a) => ({ valor: a.id, rotulo: a.nome }))} />
      </BarraFiltros>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {armazensVisiveis.map((a) => {
            const linhas = porArmazemFiltrado.get(a.id) ?? [];
            const unidades = linhas.reduce((acc, l) => acc + l.quantidade, 0);
            const valor = linhas.reduce((acc, l) => acc + l.quantidade * l.produto.custo, 0);
            return (
              <Card key={a.id} padding="nenhum" className="overflow-hidden">
                <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-text-primary">{a.nome}</h2>
                    {a.endereco && <p className="text-sm text-text-secondary">{a.endereco}</p>}
                    {a.lojas_abastecidas.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {a.lojas_abastecidas.map((loja) => (
                          <span key={loja} className="text-xs bg-surface-2 text-text-secondary rounded-full px-2 py-0.5">
                            {loja}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-lg text-text-primary">{unidades} un.</div>
                    <div className="text-xs text-text-tertiary">
                      {linhas.length} produtos · {formatBRL(valor)}
                    </div>
                    <button onClick={() => setModal({ armazemId: a.id })} className="text-xs text-accent hover:underline mt-1">
                      Movimentar
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-border border-t border-border">
                  {linhas.map(({ produto: p, quantidade }) => {
                    const ok = p.estoque > p.estoque_minimo;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                        <div className="min-w-0">
                          <div className="text-text-primary truncate">{p.nome}</div>
                          <div className="text-xs text-text-tertiary font-mono truncate">{p.sku}</div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono text-text-secondary text-right">
                            {quantidade} un.
                            {quantidade !== p.estoque && <span className="text-text-tertiary"> / {p.estoque}</span>}
                            {(reservado[p.id] ?? 0) > 0 && (
                              <span className="block text-[11px] text-accent" title="Reservado por pedidos que ainda não saíram (Para Enviar / Para Reservar)">
                                {reservado[p.id]} reservado · {p.estoque - reservado[p.id]} disp.
                              </span>
                            )}
                          </span>
                          <StatusChip label={ok ? "OK" : "Repor"} tone={ok ? "positive" : "negative"} />
                        </div>
                      </div>
                    );
                  })}
                  {linhas.length === 0 && (
                    <div className="px-5 py-4 text-sm text-text-tertiary">{busca || situacao !== "Todos" ? "Nada com esses filtros aqui." : "Nenhum produto neste armazém ainda."}</div>
                  )}
                </div>
              </Card>
            );
          })}
          {armazens.length === 0 && (
            <Card>
              <p className="text-sm text-text-tertiary">Nenhum armazém cadastrado ainda. Adicione um em Configurações → Armazéns.</p>
            </Card>
          )}
        </div>

        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Histórico Recente</h2>
          <div className="space-y-4">
            {movimentacoes.slice(0, 10).map((m, i) => (
              <div key={m.id ?? i} className="flex items-start justify-between text-sm border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-text-primary truncate">{m.produto_nome}</div>
                  <div className="text-xs text-text-tertiary">
                    {m.tipo === "transferencia" ? (
                      <span className="inline-flex items-center gap-1">
                        {nomeArmazem.get(m.armazem_id ?? "") ?? "?"} <ArrowRight size={11} /> {nomeArmazem.get(m.armazem_destino_id ?? "") ?? "?"}
                      </span>
                    ) : (
                      [m.armazem_id ? nomeArmazem.get(m.armazem_id) : null, m.motivo].filter(Boolean).join(" · ")
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className={`font-mono ${m.tipo === "entrada" ? "text-positive" : m.tipo === "saida" ? "text-negative" : "text-text-secondary"}`}>
                    {m.tipo === "transferencia" ? <ArrowRightLeft size={12} className="inline mr-1" /> : m.tipo === "entrada" ? "+" : "-"}
                    {m.quantidade} un
                  </div>
                  <div className="text-xs text-text-tertiary">{formatarDataHora(m.data_movimentacao)}</div>
                </div>
              </div>
            ))}
            {movimentacoes.length === 0 && <p className="text-sm text-text-tertiary">Nenhuma movimentação ainda.</p>}
          </div>
        </Card>
      </div>

      {modal && (
        <MovimentacaoModal
          aberto
          onClose={() => setModal(null)}
          produtos={produtos}
          armazens={armazens}
          saldos={saldos}
          porArmazem={porArmazem}
          armazemInicial={modal.armazemId}
        />
      )}
    </>
  );
}

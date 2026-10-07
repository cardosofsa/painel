"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowRightLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, classesBotao } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { BarraFiltros, FiltroChips, FiltroSelect } from "@/components/ui/BarraFiltros";
import { Paginacao } from "@/components/ui/Paginacao";
import { MovimentacaoModal } from "@/components/estoque/MovimentacaoModal";
import { formatBRL, formatarDataHora } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { useListaNaUrl } from "@/lib/hooks/useListaNaUrl";
import type { FiltroEstoque } from "@/lib/listas";
import type { TotaisArmazem } from "@/lib/estoque-lista";
import { dadosMovimentacao } from "./actions";

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

/** Chips de situação: "" = todos; os outros são o valor da URL (`?situacao=`). */
const SITUACOES: { valor: FiltroEstoque["situacao"]; rotulo: string }[] = [
  { valor: "", rotulo: "Todos" },
  { valor: "repor", rotulo: "Repor" },
  { valor: "ok", rotulo: "OK" },
];

type DadosModal = { produtos: ProdutoEstoque[]; saldos: SaldoArmazem[]; porArmazem: boolean };

export function EstoqueClient({
  filtro,
  total,
  produtos,
  saldos,
  totaisArmazem,
  resumo,
  armazens,
  movimentacoes,
  porArmazem,
  reservado = {},
}: {
  /** Busca, filtros e página que o servidor usou (vêm da URL). */
  filtro: FiltroEstoque;
  /** Quantos produtos passam nos filtros (todas as páginas). */
  total: number;
  /** Só os produtos da página atual. */
  produtos: ProdutoEstoque[];
  /** Saldos dos produtos da página (só os > 0, já no armazém do filtro). */
  saldos: SaldoArmazem[];
  /** Por armazém, com os filtros, somando todas as páginas. */
  totaisArmazem: Record<string, TotaisArmazem>;
  /** Cards: da conta inteira. */
  resumo: { unidades: number; valorTotal: number; criticos: number; reservado: number };
  /** produto da página → reservado em pedidos da esteira (0052). */
  reservado?: Record<string, number>;
  armazens: Armazem[];
  movimentacoes: Movimentacao[];
  /** `false` antes da migração 0041: saldos derivados do armazém padrão, sem transferência. */
  porArmazem: boolean;
}) {
  const [modal, setModal] = useState<{ armazemId: string | null; dados: DadosModal } | null>(null);
  // `null` = nada abrindo; "" = o botão geral; id = o "Movimentar" daquele armazém.
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const lista = useListaNaUrl(filtro);
  const { armazem: armazemFiltro, situacao } = lista.atuais;
  const busca = filtro.q;

  const produtoPorId = useMemo(() => new Map(produtos.map((p) => [p.id, p])), [produtos]);
  const nomeArmazem = useMemo(() => new Map(armazens.map((a) => [a.id, a.nome])), [armazens]);

  const totalUnidades = resumo.unidades;
  const totalReservado = resumo.reservado;
  const criticos = resumo.criticos;
  const valorTotal = resumo.valorTotal;

  /** Linhas da página por armazém (busca e situação já vieram aplicadas pelo servidor). */
  const porArmazemFiltrado = useMemo(() => {
    const mapa = new Map<string, { produto: ProdutoEstoque; quantidade: number }[]>();
    for (const s of saldos) {
      const p = produtoPorId.get(s.produto_id);
      if (!p) continue;
      mapa.set(s.armazem_id, [...(mapa.get(s.armazem_id) ?? []), { produto: p, quantidade: s.quantidade }]);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.produto.nome.localeCompare(b.produto.nome, "pt-BR"));
    return mapa;
  }, [saldos, produtoPorId]);

  const armazensVisiveis = armazens.filter((a) => !armazemFiltro || a.id === armazemFiltro);
  const filtrosAtivos = (armazemFiltro ? 1 : 0) + (situacao ? 1 : 0);

  /** O modal escolhe entre todos os produtos: a lista inteira e os saldos vêm na hora. */
  function abrirMovimentacao(armazemId: string | null) {
    setAbrindo(armazemId ?? "");
    void executarComToast(dadosMovimentacao(), { erro: "Não foi possível abrir a movimentação" }).then((r) => {
      setAbrindo(null);
      if (r.ok) setModal({ armazemId, dados: r.dado });
    });
  }

  return (
    <>
      <PageHeader
        title="Armazéns & Estoque"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/estoque/inventario" className={classesBotao({ variant: "secondary" })}>
              <ClipboardCheck size={15} aria-hidden /> Inventário
            </Link>
            <Button variant="primary" onClick={() => abrirMovimentacao(armazemFiltro || null)} disabled={armazens.length === 0} loading={abrindo === ""}>
              Registrar Movimentação
            </Button>
          </div>
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
        busca={lista.texto}
        onBusca={lista.setTexto}
        placeholder="Buscar produto, SKU ou código de barras…"
        ativos={filtrosAtivos}
        onLimpar={() => lista.limpar({ armazem: null, situacao: null })}
        situacao={<FiltroChips rotulo="Situação" valor={situacao} onChange={(v) => lista.navegar({ situacao: v })} opcoes={SITUACOES} />}
      >
        <FiltroSelect rotulo="Armazém" valor={armazemFiltro} onChange={(v) => lista.navegar({ armazem: v })} opcoes={armazens.map((a) => ({ valor: a.id, rotulo: a.nome }))} />
      </BarraFiltros>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className={`lg:col-span-2 space-y-5 transition-opacity ${lista.pendente ? "opacity-60" : ""}`}>
          {armazensVisiveis.map((a) => {
            const linhas = porArmazemFiltrado.get(a.id) ?? [];
            // Total do armazém com os filtros, de todas as páginas (a lista abaixo é só a página).
            const { unidades, produtos: qtdProdutos, valor } = totaisArmazem[a.id] ?? { unidades: 0, produtos: 0, valor: 0 };
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
                      {qtdProdutos} produtos · {formatBRL(valor)}
                    </div>
                    <button onClick={() => abrirMovimentacao(a.id)} disabled={abrindo !== null} className="text-xs text-accent hover:underline mt-1 disabled:opacity-50">
                      {abrindo === a.id ? "Abrindo…" : "Movimentar"}
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
                    <div className="px-5 py-4 text-sm text-text-tertiary">
                      {qtdProdutos > 0
                        ? "Os produtos deste armazém estão nas outras páginas."
                        : busca || filtro.situacao
                          ? "Nada com esses filtros aqui."
                          : "Nenhum produto neste armazém ainda."}
                    </div>
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
          {armazens.length > 0 && total > 0 && (
            <Card padding="nenhum" className="overflow-hidden">
              <Paginacao pagina={filtro.pagina} total={total} onPagina={lista.irPara} carregando={lista.pendente} unidade="produtos com saldo" />
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
          produtos={modal.dados.produtos}
          armazens={armazens}
          saldos={modal.dados.saldos}
          porArmazem={modal.dados.porArmazem}
          armazemInicial={modal.armazemId}
        />
      )}
    </>
  );
}

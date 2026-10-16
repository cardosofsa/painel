"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Trophy } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { formatBRL } from "@/lib/format";
import type { TabelaExport } from "@/lib/exportar";
import {
  rankearAnuncios,
  resumirRanking,
  type AnuncioCadastrado,
  type Criterio,
  type LinhaRanking,
  type PedidoRanking,
} from "@/lib/marketplace/ranking-anuncios";

const PERIODOS = [7, 30, 90, 180] as const;
const CRITERIOS: { value: Criterio; label: string }[] = [
  { value: "receita", label: "Faturamento" },
  { value: "unidades", label: "Unidades" },
  { value: "lucro", label: "Lucro" },
  { value: "margem", label: "Margem" },
];
type Visao = "todos" | "vendendo" | "parados";

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function Kpi({ rotulo, valor, apoio }: { rotulo: string; valor: string; apoio?: string }) {
  return (
    <Card>
      <CardEyebrow>{rotulo}</CardEyebrow>
      <div className="text-xl font-semibold font-mono tabular text-text-primary mt-1">{valor}</div>
      {apoio && <div className="text-xs mt-0.5 text-text-tertiary">{apoio}</div>}
    </Card>
  );
}

const COR_CLASSE = { A: "text-positive", B: "text-text-secondary", C: "text-text-tertiary" } as const;

/**
 * Ranking dos anúncios da Shopee: o que mais vende, o que mais dá lucro e o que está parado.
 * Tudo sai dos pedidos já sincronizados (nenhuma chamada nova à API): a visita e a conversão
 * por anúncio não estão aqui.
 */
export function RankingAnunciosClient({
  pedidos,
  anuncios,
  lojas,
  agoraIso,
  diasJanela,
  semDados,
}: {
  pedidos: PedidoRanking[];
  anuncios: AnuncioCadastrado[];
  lojas: { id: string; nome: string }[];
  agoraIso: string;
  diasJanela: number;
  semDados: boolean;
}) {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [criterio, setCriterio] = useState<Criterio>("receita");
  const [visao, setVisao] = useState<Visao>("todos");
  const [loja, setLoja] = useState("");
  const [exportando, setExportando] = useState(false);

  const linhas = useMemo(() => {
    const fim = new Date(agoraIso);
    const inicio = new Date(fim);
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - (dias - 1));
    const daLoja = <T extends { loja_id: string }>(x: T[]) => (loja ? x.filter((i) => i.loja_id === loja) : x);
    return rankearAnuncios(daLoja(pedidos), daLoja(anuncios), inicio, fim, criterio);
  }, [pedidos, anuncios, loja, dias, criterio, agoraIso]);

  const resumo = useMemo(() => resumirRanking(linhas), [linhas]);
  const visiveis = useMemo(
    () => linhas.filter((l) => (visao === "todos" ? true : visao === "vendendo" ? l.receita > 0 : l.receita <= 0)),
    [linhas, visao],
  );
  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "";
  const semCusto = linhas.some((l) => l.custoIncompleto);
  const temAnuncios = anuncios.length > 0;

  const tabela: TabelaExport<LinhaRanking> = {
    titulo: `Ranking de anúncios — últimos ${dias} dias`,
    colunas: [
      { rotulo: "Posição", tipo: "inteiro", valor: (l) => l.posicao || null },
      { rotulo: "Anúncio", largura: 44, valor: (l) => l.nome },
      { rotulo: "Loja", valor: (l) => nomeLoja(l.lojaId) },
      { rotulo: "Pedidos", tipo: "inteiro", valor: (l) => l.pedidos },
      { rotulo: "Unidades", tipo: "inteiro", valor: (l) => l.unidades },
      { rotulo: "Faturamento", tipo: "moeda", valor: (l) => l.receita },
      { rotulo: "Lucro", tipo: "moeda", valor: (l) => l.lucro },
      { rotulo: "Margem", tipo: "percentual", valor: (l) => l.margem },
      { rotulo: "Cancel./devol.", tipo: "percentual", valor: (l) => l.taxaProblema },
      { rotulo: "Classe", valor: (l) => l.classe ?? "Parado" },
    ],
    linhas: visiveis,
  };

  return (
    <>
      <Link href="/vendas" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} /> Vendas
      </Link>
      <PageHeader
        title="Ranking de anúncios"
        descricao="Quais anúncios da Shopee mais vendem, mais dão lucro e quais estão parados, a partir dos pedidos sincronizados."
        actions={
          <Button variant="secondary" onClick={() => setExportando(true)} disabled={visiveis.length === 0}>
            Exportar
          </Button>
        }
      />

      {semDados ? (
        <Card>
          <EmptyState icon={Trophy} title="Pedidos da Shopee ainda não estão disponíveis" description="Conecte a loja e sincronize os pedidos em Vendas para ver o ranking." />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {PERIODOS.map((p) => (
              <Chip key={p} ativo={dias === p} onClick={() => setDias(p)}>
                {p} dias
              </Chip>
            ))}
            <select
              aria-label="Ordenar por"
              className="ml-auto h-8 rounded-md border border-border bg-surface-1 px-2 text-sm text-text-primary"
              value={criterio}
              onChange={(e) => setCriterio(e.target.value as Criterio)}
            >
              {CRITERIOS.map((c) => (
                <option key={c.value} value={c.value}>
                  Ordenar por {c.label.toLowerCase()}
                </option>
              ))}
            </select>
            {lojas.length > 1 && (
              <select aria-label="Loja" className="h-8 rounded-md border border-border bg-surface-1 px-2 text-sm text-text-primary" value={loja} onChange={(e) => setLoja(e.target.value)}>
                <option value="">Todas as lojas</option>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Kpi rotulo="Faturamento" valor={formatBRL(resumo.receita)} apoio={`${resumo.pedidos} pedidos · ${resumo.unidades} un.`} />
            <Kpi rotulo="Lucro" valor={formatBRL(resumo.lucro)} apoio={resumo.receita > 0 ? `margem ${pct(resumo.lucro / resumo.receita)}` : undefined} />
            <Kpi rotulo="Anúncios vendendo" valor={String(resumo.comVenda)} apoio={`de ${resumo.anuncios} no período`} />
            <Kpi rotulo="Anúncios parados" valor={temAnuncios ? String(resumo.parados) : "—"} apoio={temAnuncios ? "sem venda no período" : "detecte os anúncios em Produtos"} />
          </div>

          {semCusto && (
            <p className="text-xs text-text-secondary mb-3">
              ⚠ Alguns anúncios têm item sem produto vinculado (custo desconhecido): o lucro e a margem deles estão acima do real. Marcados com “*”. Vincule em Produtos › Mapeamento de anúncio.
            </p>
          )}

          <div className="flex flex-wrap gap-2 mb-3">
            <Chip ativo={visao === "todos"} onClick={() => setVisao("todos")}>
              Todos ({resumo.anuncios})
            </Chip>
            <Chip ativo={visao === "vendendo"} onClick={() => setVisao("vendendo")}>
              Vendendo ({resumo.comVenda})
            </Chip>
            <Chip ativo={visao === "parados"} onClick={() => setVisao("parados")} titulo="Anúncios cadastrados que não tiveram nenhuma venda no período">
              Parados ({resumo.parados})
            </Chip>
          </div>

          <Card>
            {visiveis.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title={visao === "parados" ? "Nenhum anúncio parado" : "Sem vendas no período"}
                description={`Nada para mostrar nos últimos ${dias} dias. Os pedidos carregados vão até ${diasJanela} dias atrás.`}
              />
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th align="center">#</Th>
                    <Th>Anúncio</Th>
                    <Th align="right">Pedidos</Th>
                    <Th align="right">Unid.</Th>
                    <Th align="right">Faturamento</Th>
                    <Th align="right">Lucro</Th>
                    <Th align="right">Margem</Th>
                    <Th align="right" secundaria>
                      Cancel./devol.
                    </Th>
                    <Th align="center" secundaria>
                      Classe
                    </Th>
                  </tr>
                </Thead>
                <tbody>
                  {visiveis.map((l) => (
                    <Tr key={l.chave}>
                      <Td align="center" mono>
                        {l.posicao || "—"}
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2 min-w-[14rem]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {l.imagemUrl && <img src={l.imagemUrl} alt="" width={32} height={32} className="rounded-sm object-cover shrink-0 h-8 w-8" loading="lazy" />}
                          <div className="min-w-0">
                            <div className="text-text-primary truncate max-w-[24rem]" title={l.nome}>
                              {l.nome}
                            </div>
                            <div className="text-xs text-text-tertiary">
                              {[lojas.length > 1 ? nomeLoja(l.lojaId) : "", l.variacoes > 1 ? `${l.variacoes} variações vendidas` : ""].filter(Boolean).join(" · ")}
                              {l.link && (
                                <a href={l.link} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex align-middle text-text-secondary hover:text-text-primary" aria-label="Abrir anúncio na Shopee">
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td align="right" mono>
                        {l.pedidos}
                      </Td>
                      <Td align="right" mono>
                        {l.unidades}
                      </Td>
                      <Td align="right" mono>
                        {formatBRL(l.receita)}
                      </Td>
                      <Td align="right" mono>
                        {l.receita > 0 ? formatBRL(l.lucro) : "—"}
                        {l.custoIncompleto && <span title="Custo incompleto: algum item sem produto vinculado"> *</span>}
                      </Td>
                      <Td align="right" mono>
                        {l.margem == null ? "—" : pct(l.margem)}
                      </Td>
                      <Td align="right" mono secundaria>
                        {l.taxaProblema == null ? "—" : pct(l.taxaProblema)}
                      </Td>
                      <Td align="center" secundaria>
                        {l.classe ? <span className={`font-medium ${COR_CLASSE[l.classe]}`}>{l.classe}</span> : <span className="text-text-tertiary">Parado</span>}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <p className="text-xs text-text-tertiary mt-3">
            Classe A = anúncios que juntos fazem os primeiros 80% do faturamento; B, até 95%; C, o restante. “Anúncio” agrupa todas as variações. Cancelados e devolvidos não entram no faturamento. O lucro do pedido é repartido entre os itens pelo valor de cada um.
          </p>
        </>
      )}

      {exportando && <ExportarModal aberto onClose={() => setExportando(false)} titulo="Exportar ranking de anúncios" escopos={[{ id: "todos", rotulo: "Lista exibida", quantidade: visiveis.length }]} montar={() => tabela} />}
    </>
  );
}

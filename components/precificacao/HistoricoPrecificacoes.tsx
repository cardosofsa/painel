"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal, campoBase } from "@/components/ui/Modal";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { RowMenu } from "@/components/ui/RowMenu";
import { Chip } from "@/components/ui/Chip";
import { formatBRL, formatarMargemPct, classeValor } from "@/lib/format";
import { DetalhamentoPrecificacao } from "@/components/precificacao/resultado-compartilhado";
import type { EstadoPrecificacao, AnuncioSalvo, PrecificacaoHist } from "@/lib/precificacao-estado";
import type { RowMenuAction } from "@/components/ui/RowMenu";
import { ExportarPrecificacoesModal, ExportarVariacoesModal } from "@/components/precificacao/ExportarPrecificacoes";

/**
 * A aba "Histórico" inteira: sub-abas Precificações / Produtos com Variações. Extraído de
 * `PrecificacaoClient.tsx` — ver comentário em `PainelEntradas.tsx`.
 */
export function HistoricoPrecificacoes({
  estado,
  anuncios,
  acoesLigarProduto,
  empresa = null,
  paginacao,
}: {
  /** A tela abre com as 50 mais recentes; daqui busca as mais antigas. */
  paginacao?: { temMais: boolean; carregando: boolean; carregarMais: () => void; carregarTudo: () => void };
  empresa?: { nome: string | null; logoUrl: string | null } | null;
  estado: EstadoPrecificacao;
  anuncios: AnuncioSalvo[];
  /** Vincular / aplicar preço / criar produto — definidas uma vez em PrecificacaoClient
   * pra não duplicar a lógica entre o card "Precificações Salvas" e esta tabela. */
  acoesLigarProduto: (h: PrecificacaoHist) => RowMenuAction[];
}) {
  const {
    subAbaHistorico,
    setSubAbaHistorico,
    filtroHistoricoTexto,
    setFiltroHistoricoTexto,
    filtroHistoricoDataIni,
    setFiltroHistoricoDataIni,
    filtroHistoricoDataFim,
    setFiltroHistoricoDataFim,
    historicoFiltrado,
    historicoDetalhe,
    setHistoricoDetalhe,
    setMostrarDetalheHistorico,
    mostrarDetalheHistorico,
    resumoDoHistorico,
    duplicarHistorico,
    removerHistorico,
    setPendenteExport,
    setPendenteImagem,
    anuncioExpandidoHistorico,
    setAnuncioExpandidoHistorico,
    excluirAnuncioHistorico,
    criarProdutosDaVariacao,
    historico,
  } = estado;
  // Marcar várias e exportar só elas (como em Compras). Some ao trocar de filtro? Não: a
  // pessoa pode marcar, buscar outra coisa e marcar mais.
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [exportando, setExportando] = useState<"precificacoes" | "variacoes" | null>(null);
  const [anunciosExportar, setAnunciosExportar] = useState<AnuncioSalvo[] | null>(null);
  const alternar = (id: string) => setSelecionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const todasFiltradasMarcadas = historicoFiltrado.length > 0 && historicoFiltrado.every((h) => selecionadas.includes(h.id));

  return (
    <>
      <div className="flex gap-2 mb-5">
        <Chip onClick={() => setSubAbaHistorico("precificacoes")} ativo={subAbaHistorico === "precificacoes"}>
          Precificações
        </Chip>
        <Chip onClick={() => setSubAbaHistorico("produtos")} ativo={subAbaHistorico === "produtos"}>
          Produtos com Variações
        </Chip>
      </div>

      {subAbaHistorico === "precificacoes" && (
        <>
          <Card padding="nenhum" className="overflow-hidden">
            <div className="px-5 pt-5 pb-4 flex items-center justify-between flex-wrap gap-3">
              <h2 className="text-base font-semibold text-text-primary">Histórico de Precificações</h2>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  value={filtroHistoricoTexto}
                  onChange={(e) => setFiltroHistoricoTexto(e.target.value)}
                  placeholder="Buscar por produto…"
                  aria-label="Buscar por produto"
                  className={`${campoBase} h-8 text-xs w-40`}
                />
                <input
                  type="date"
                  value={filtroHistoricoDataIni}
                  onChange={(e) => setFiltroHistoricoDataIni(e.target.value)}
                  aria-label="De"
                  className={`${campoBase} h-8 text-xs`}
                />
                <input
                  type="date"
                  value={filtroHistoricoDataFim}
                  onChange={(e) => setFiltroHistoricoDataFim(e.target.value)}
                  aria-label="Até"
                  className={`${campoBase} h-8 text-xs`}
                />
                <Button variant="secondary" size="sm" onClick={() => setExportando("precificacoes")}>
                  <Download size={14} /> Exportar
                </Button>
              </div>
            </div>
            {selecionadas.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-accent-soft px-5 py-2.5">
                <span className="text-sm text-accent font-medium">
                  {selecionadas.length} {selecionadas.length === 1 ? "selecionada" : "selecionadas"}
                </span>
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={() => setExportando("precificacoes")}>
                    <Download size={14} /> Exportar selecionadas
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelecionadas([])}>
                    Limpar seleção
                  </Button>
                </div>
              </div>
            )}
            <Table>
              <Thead>
                <tr>
                  <Th>
                    <input
                      type="checkbox"
                      aria-label="Selecionar todas desta lista"
                      className="w-4 h-4 accent-accent"
                      checked={todasFiltradasMarcadas}
                      onChange={(e) =>
                        setSelecionadas((s) =>
                          e.target.checked ? Array.from(new Set([...s, ...historicoFiltrado.map((h) => h.id)])) : s.filter((id) => !historicoFiltrado.some((h) => h.id === id)),
                        )
                      }
                    />
                  </Th>
                  <Th>Data</Th>
                  <Th>Produto / Kit</Th>
                  <Th>Canal</Th>
                  <Th align="right">Custo</Th>
                  <Th align="right">Preço Venda</Th>
                  <Th align="right">Lucro</Th>
                  <Th align="right">Margem</Th>
                  <Th align="right"></Th>
                </tr>
              </Thead>
              <tbody>
                {historicoFiltrado.map((h) => (
                  <Tr key={h.id}>
                    <Td>
                      <input type="checkbox" aria-label={`Selecionar ${h.produto_nome}`} className="w-4 h-4 accent-accent" checked={selecionadas.includes(h.id)} onChange={() => alternar(h.id)} />
                    </Td>
                    <Td mono>{new Date(h.criado_em).toLocaleDateString("pt-BR")}</Td>
                    <Td>{h.produto_nome}</Td>
                    <Td className="text-text-secondary">{h.canal ?? "—"}</Td>
                    <Td align="right" mono>
                      {formatBRL(h.custo)}
                    </Td>
                    <Td align="right" mono className="text-accent">
                      {formatBRL(h.preco_calculado)}
                    </Td>
                    <Td align="right" mono>
                      {formatBRL(h.lucro)}
                    </Td>
                    <Td align="right" mono className={classeValor(h.lucro)}>
                      {formatarMargemPct(h.lucro, h.preco_calculado)}
                    </Td>
                    <Td align="right">
                      <RowMenu
                        actions={[
                          { label: "Ver", onClick: () => { setHistoricoDetalhe(h); setMostrarDetalheHistorico(false); } },
                          { label: "Duplicar", onClick: () => duplicarHistorico(h) },
                          ...acoesLigarProduto(h),
                          { label: "Remover", onClick: () => removerHistorico(h), destructive: true },
                        ]}
                      />
                    </Td>
                  </Tr>
                ))}
                {historicoFiltrado.length === 0 && (
                  <tr>
                    {/* Sem colSpan a mensagem ficava espremida na primeira coluna. */}
                    <td colSpan={9} className="text-sm text-text-tertiary text-center py-8">
                      Nenhuma precificação encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
            {paginacao?.temMais && (
              <div className="flex flex-wrap items-center justify-center gap-2 px-5 py-4 border-t border-border">
                <span className="text-xs text-text-tertiary">
                  Mostrando as {historico.length} mais recentes. A busca, o filtro de data e a exportação valem para as que estão carregadas.
                </span>
                <Button variant="secondary" size="sm" loading={paginacao.carregando} onClick={paginacao.carregarMais}>
                  Carregar mais 50
                </Button>
                <Button variant="ghost" size="sm" disabled={paginacao.carregando} onClick={paginacao.carregarTudo}>
                  Carregar tudo
                </Button>
              </div>
            )}
          </Card>

          <Modal open={!!historicoDetalhe} onClose={() => setHistoricoDetalhe(null)} title={historicoDetalhe?.produto_nome ?? ""}>
            {historicoDetalhe && (
              <div className="space-y-4">
                <div className="text-center py-2">
                  <div className="text-xs text-text-tertiary mb-1">Preço de Venda</div>
                  <div className="font-mono text-3xl font-semibold text-accent">{formatBRL(historicoDetalhe.preco_calculado)}</div>
                </div>
                <div className="text-sm space-y-1.5 border-t border-border pt-3">
                  <div className="flex justify-between text-text-secondary">
                    <span>Data</span>
                    <span className="font-mono text-text-primary">
                      {new Date(historicoDetalhe.criado_em).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  {historicoDetalhe.canal && (
                    <div className="flex justify-between text-text-secondary">
                      <span>Canal</span>
                      <span className="text-text-primary">{historicoDetalhe.canal}</span>
                    </div>
                  )}
                  {historicoDetalhe.titulo_anuncio && (
                    <div className="flex justify-between text-text-secondary">
                      <span>Título do Anúncio</span>
                      <span className="text-text-primary text-right">{historicoDetalhe.titulo_anuncio}</span>
                    </div>
                  )}

                  <DetalhamentoPrecificacao
                    aberto={mostrarDetalheHistorico}
                    onToggle={() => setMostrarDetalheHistorico((v) => !v)}
                    componentes={historicoDetalhe.componentes}
                    custoTotal={historicoDetalhe.custo}
                    taxaVariavelValor={historicoDetalhe.preco_calculado * historicoDetalhe.taxa_variavel_pct}
                    taxaVariavelPct={historicoDetalhe.taxa_variavel_pct}
                    taxaFixa={historicoDetalhe.taxa_fixa}
                    taxaAdicionalValor={historicoDetalhe.preco_calculado * historicoDetalhe.taxa_adicional_pct}
                    taxaAdicionalPct={historicoDetalhe.taxa_adicional_pct}
                    taxaExtraCalculada={
                      historicoDetalhe.taxa_extra_tipo === "percentual"
                        ? historicoDetalhe.preco_calculado * ((historicoDetalhe.taxa_extra_valor ?? 0) / 100)
                        : historicoDetalhe.taxa_extra_tipo === "fixo"
                          ? (historicoDetalhe.taxa_extra_valor ?? 0)
                          : 0
                    }
                    impostoValor={historicoDetalhe.preco_calculado * historicoDetalhe.imposto_pct}
                    impostoPct={historicoDetalhe.imposto_pct}
                  />

                  <div className="flex justify-between font-medium pt-1.5 border-t border-border">
                    <span className="text-text-primary">Lucro líquido</span>
                    <span className={`font-mono ${classeValor(historicoDetalhe.lucro)}`}>
                      {/* `formatarMargemPct` já traz o "%": saía "(+28,0%%)". */}
                      {formatBRL(historicoDetalhe.lucro)} ({formatarMargemPct(historicoDetalhe.lucro, historicoDetalhe.preco_calculado)})
                    </span>
                  </div>
                  {historicoDetalhe.anuncio && historicoDetalhe.anuncio.valor > 0 && (
                    <div className="flex justify-between text-xs text-text-tertiary">
                      <span>Anúncio pago por venda</span>
                      <span className="font-mono">
                        {historicoDetalhe.anuncio.tipo === "percentual" ? `${historicoDetalhe.anuncio.valor}% do preço` : formatBRL(historicoDetalhe.anuncio.valor)}
                      </span>
                    </div>
                  )}
                </div>

                {historicoDetalhe.estrategia && (
                  <div className="rounded-md border border-border p-3 text-sm space-y-2">
                    <div className="text-xs font-medium text-text-tertiary uppercase">Estratégia da Vixe (salva)</div>
                    {historicoDetalhe.estrategia.diagnostico && <p className="text-text-primary">{historicoDetalhe.estrategia.diagnostico}</p>}
                    <ul className="list-disc pl-4 space-y-1 text-text-secondary">
                      {historicoDetalhe.estrategia.estrategias.map((e) => (
                        <li key={e.titulo}>
                          <span className="text-text-primary font-medium">{e.titulo}:</span> {e.detalhe}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    className="flex-1"
                    onClick={() => setPendenteExport({ acao: "copiar", dados: resumoDoHistorico(historicoDetalhe) })}
                  >
                    Copiar
                  </Button>
                  <Button
                    variant="primary"
                    className="flex-1"
                    onClick={() => setPendenteExport({ acao: "whatsapp", dados: resumoDoHistorico(historicoDetalhe) })}
                  >
                    Enviar WhatsApp
                  </Button>
                </div>
                <Button variant="secondary" className="w-full" onClick={() => setPendenteImagem(resumoDoHistorico(historicoDetalhe))}>
                  Imagem
                </Button>
              </div>
            )}
          </Modal>
        </>
      )}

      {subAbaHistorico === "produtos" && (
        <Card padding="nenhum" className="overflow-hidden">
          <div className="px-5 pt-5 pb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">Produtos com Variações</h2>
            <Button variant="secondary" size="sm" onClick={() => setExportando("variacoes")} disabled={anuncios.length === 0}>
              <Download size={14} /> Exportar
            </Button>
          </div>
          <div className="divide-y divide-border">
            {anuncios.map((a) => (
              <div key={a.id} className="p-4">
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setAnuncioExpandidoHistorico((v) => (v === a.id ? null : a.id))}
                    className="text-sm font-medium text-text-primary hover:text-accent text-left"
                  >
                    {a.nome_anuncio}{" "}
                    <span className="text-text-tertiary font-normal">
                      ({a.variacoes.length} variações · {new Date(a.criado_em).toLocaleDateString("pt-BR")})
                    </span>
                  </button>
                  <RowMenu
                    actions={[
                      {
                        label: anuncioExpandidoHistorico === a.id ? "Ver menos" : "Ver mais",
                        onClick: () => setAnuncioExpandidoHistorico((v) => (v === a.id ? null : a.id)),
                      },
                      { label: "Criar produtos a partir das variações", onClick: () => criarProdutosDaVariacao(a) },
                      { label: "Exportar este anúncio", onClick: () => setAnunciosExportar([a]) },
                      { label: "Remover", onClick: () => excluirAnuncioHistorico(a), destructive: true },
                    ]}
                  />
                </div>
                {anuncioExpandidoHistorico === a.id && (
                  <div className="mt-3 border border-border rounded-md divide-y divide-border">
                    {a.variacoes.map((v) => (
                      <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-text-primary">{v.nome_variacao}</span>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-text-secondary">custo {formatBRL(v.custo)}</span>
                          <span className="font-mono text-accent">{formatBRL(v.preco_calculado)}</span>
                          <span className={`font-mono ${classeValor(v.lucro)}`}>{formatarMargemPct(v.lucro, v.preco_calculado)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {anuncios.length === 0 && (
              <p className="text-sm text-text-tertiary text-center py-8">Nenhum produto com variações salvo ainda.</p>
            )}
          </div>
        </Card>
      )}
      {exportando === "precificacoes" && (
        <ExportarPrecificacoesModal
          onClose={() => setExportando(null)}
          empresa={empresa}
          grupos={[
            { id: "selecionadas", rotulo: "Selecionadas", lista: historico.filter((h) => selecionadas.includes(h.id)) },
            { id: "filtradas", rotulo: "Desta lista", lista: historicoFiltrado },
            { id: "todas", rotulo: "Todas carregadas", lista: historico },
          ]}
        />
      )}
      {exportando === "variacoes" && (
        <ExportarVariacoesModal onClose={() => setExportando(null)} empresa={empresa} grupos={[{ id: "todos", rotulo: "Todos os anúncios", lista: anuncios }]} />
      )}
      {anunciosExportar && (
        <ExportarVariacoesModal onClose={() => setAnunciosExportar(null)} empresa={empresa} grupos={[{ id: "este", rotulo: anunciosExportar[0]?.nome_anuncio ?? "Anúncio", lista: anunciosExportar }]} />
      )}
    </>
  );
}

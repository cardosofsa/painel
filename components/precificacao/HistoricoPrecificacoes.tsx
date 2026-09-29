"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { RowMenu } from "@/components/ui/RowMenu";
import { Chip } from "@/components/ui/Chip";
import { formatBRL, formatarMargemPct, classeValor } from "@/lib/format";
import { DetalhamentoPrecificacao } from "@/components/precificacao/resultado-compartilhado";
import type { EstadoPrecificacao, AnuncioSalvo, PrecificacaoHist } from "@/lib/precificacao-estado";
import type { RowMenuAction } from "@/components/ui/RowMenu";

/**
 * A aba "Histórico" inteira: sub-abas Precificações / Produtos com Variações. Extraído de
 * `PrecificacaoClient.tsx` — ver comentário em `PainelEntradas.tsx`.
 */
export function HistoricoPrecificacoes({
  estado,
  anuncios,
  acoesLigarProduto,
}: {
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
    exportarHistoricoCsv,
    duplicarHistorico,
    removerHistorico,
    setPendenteExport,
    setPendenteImagem,
    anuncioExpandidoHistorico,
    setAnuncioExpandidoHistorico,
    excluirAnuncioHistorico,
    exportarAnunciosCsv,
    criarProdutosDaVariacao,
  } = estado;

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
                  className="h-8 px-3 bg-surface-1 border border-border rounded-md text-xs text-text-primary outline-none focus:border-accent w-40"
                />
                <input
                  type="date"
                  value={filtroHistoricoDataIni}
                  onChange={(e) => setFiltroHistoricoDataIni(e.target.value)}
                  className="h-8 px-2 bg-surface-1 border border-border rounded-md text-xs text-text-primary outline-none focus:border-accent"
                />
                <input
                  type="date"
                  value={filtroHistoricoDataFim}
                  onChange={(e) => setFiltroHistoricoDataFim(e.target.value)}
                  className="h-8 px-2 bg-surface-1 border border-border rounded-md text-xs text-text-primary outline-none focus:border-accent"
                />
                <button onClick={exportarHistoricoCsv} className="text-xs text-accent hover:underline shrink-0">
                  Exportar CSV
                </button>
              </div>
            </div>
            <Table>
              <Thead>
                <tr>
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
                  <Tr>
                    <Td align="center" className="text-text-tertiary text-center py-8">
                      Nenhuma precificação encontrada.
                    </Td>
                  </Tr>
                )}
              </tbody>
            </Table>
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
                      {formatBRL(historicoDetalhe.lucro)} (
                      {formatarMargemPct(historicoDetalhe.lucro, historicoDetalhe.preco_calculado)}
                      %)
                    </span>
                  </div>
                </div>

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
            <button onClick={exportarAnunciosCsv} className="text-xs text-accent hover:underline">
              Exportar CSV
            </button>
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
    </>
  );
}

"use client";

import { Fragment, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { campoBase } from "@/components/ui/Modal";
import { PriceBreakdownChart } from "@/components/charts/dinamicos";
import { DetalhamentoPrecificacao, SimuladorPreco, type ResumoExport } from "@/components/precificacao/resultado-compartilhado";
import { formatBRL, formatarMargemPct, classeValor } from "@/lib/format";
import type { ModoCalculo } from "@/lib/pricing";
import type { ResultadoVariacao, VariacaoLinha } from "@/lib/precificacao-variacoes";

const NUM = `${campoBase} text-right tabular`;

/** Tabela editável de variações, com o detalhamento de cada uma ao expandir. */
export function TabelaVariacoes({
  variacoes,
  modo,
  parametroPadrao,
  calcular,
  impostoPct,
  taxaAdicionalPct,
  resumoDe,
  onCopiar,
  onWhatsapp,
  onImagem,
  onAdicionar,
  onRemover,
  onAtualizar,
  onSalvar,
  salvando,
  podeSalvar,
}: {
  variacoes: VariacaoLinha[];
  modo: ModoCalculo;
  parametroPadrao: number;
  calcular: (v: VariacaoLinha) => ResultadoVariacao;
  impostoPct: number;
  taxaAdicionalPct: number;
  resumoDe: (v: VariacaoLinha) => ResumoExport;
  onCopiar: (dados: ResumoExport) => void;
  onWhatsapp: (dados: ResumoExport) => void;
  onImagem: (dados: ResumoExport) => void;
  onAdicionar: () => void;
  onRemover: (id: string) => void;
  onAtualizar: (id: string, campo: keyof VariacaoLinha, valor: string) => void;
  onSalvar: () => void;
  salvando: boolean;
  podeSalvar: boolean;
}) {
  const [expandida, setExpandida] = useState<string | null>(null);
  const rotuloParametro =
    modo === "margem" ? "Margem %" : modo === "markup" ? "Markup %" : modo === "lucro" ? "Lucro (R$)" : "Preço (R$)";

  return (
    <Card padding="nenhum" className="overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">Variações</h3>
        <button onClick={onAdicionar} className="text-sm text-accent hover:underline">
          + Adicionar Variação
        </button>
      </div>
      <Table>
        <Thead>
          <tr>
            <Th>Nome</Th>
            <Th align="right">Multiplicador</Th>
            <Th align="right">Custo (R$)</Th>
            <Th align="right">{rotuloParametro}</Th>
            <Th align="right">Preço Sugerido</Th>
            <Th align="right">Lucro</Th>
            <Th align="right">Margem</Th>
            <Th></Th>
            <Th></Th>
          </tr>
        </Thead>
        <tbody>
          {variacoes.map((v) => {
            const r = calcular(v);
            const { custo, resultado, taxas } = r;
            const aberta = expandida === v.id;
            return (
              <Fragment key={v.id}>
                <Tr>
                  <Td>
                    <input
                      value={v.nome}
                      onChange={(e) => onAtualizar(v.id, "nome", e.target.value)}
                      className={`${campoBase} w-40`}
                      aria-label="Nome da variação"
                    />
                  </Td>
                  <Td align="right">
                    <input
                      type="number"
                      min={1}
                      value={v.multiplicador}
                      onChange={(e) => onAtualizar(v.id, "multiplicador", e.target.value)}
                      className={`${NUM} w-20`}
                      aria-label="Multiplicador"
                    />
                  </Td>
                  <Td align="right">
                    <input
                      type="number"
                      step="0.01"
                      value={v.custoManual ?? custo}
                      onChange={(e) => onAtualizar(v.id, "custoManual", e.target.value)}
                      className={`${NUM} w-28`}
                      aria-label="Custo"
                    />
                  </Td>
                  <Td align="right">
                    <input
                      type="number"
                      step={modo === "margem" || modo === "markup" ? "0.1" : "0.01"}
                      value={v.parametroOverride ?? parametroPadrao}
                      onChange={(e) => onAtualizar(v.id, "parametroOverride", e.target.value)}
                      className={`${NUM} w-24`}
                      aria-label={rotuloParametro}
                    />
                  </Td>
                  <Td align="right" mono className="text-accent">
                    {formatBRL(resultado.precoVenda)}
                  </Td>
                  <Td align="right" mono>
                    {formatBRL(resultado.lucroLiquido)}
                  </Td>
                  <Td align="right" mono className={classeValor(resultado.lucroLiquido)}>
                    {formatarMargemPct(resultado.lucroLiquido, resultado.precoVenda)}
                  </Td>
                  <Td align="right">
                    <button
                      onClick={() => setExpandida(aberta ? null : v.id)}
                      className="text-text-tertiary hover:text-text-primary"
                      aria-label={aberta ? "Recolher detalhes" : "Ver detalhes"}
                    >
                      {aberta ? "▲" : "▾"}
                    </button>
                  </Td>
                  <Td align="right">
                    <button
                      onClick={() => onRemover(v.id)}
                      className="text-text-tertiary hover:text-negative px-1"
                      aria-label="Remover variação"
                    >
                      ×
                    </button>
                  </Td>
                </Tr>
                {aberta && (
                  <tr>
                    <td colSpan={9} className="bg-surface-2/40 px-5 py-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <Card className={resultado.viavel ? "" : "border-negative/30 bg-negative-soft"}>
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-medium text-text-tertiary uppercase">Resultado — {v.nome}</span>
                            <StatusChip label={resultado.viavel ? "Viável" : "Inviável"} tone={resultado.viavel ? "positive" : "negative"} />
                          </div>
                          <div className="text-center py-4">
                            <div className="text-xs text-text-tertiary mb-1">Preço de Venda Recomendado</div>
                            <div className="font-mono text-4xl font-semibold text-accent">{formatBRL(resultado.precoVenda)}</div>
                          </div>
                          <div className="pt-4 border-t border-border text-sm space-y-1.5">
                            <DetalhamentoPrecificacao
                              aberto
                              onToggle={() => {}}
                              componentes={null}
                              custoTotal={resultado.custoTotal}
                              taxaVariavelValor={resultado.taxaVariavelValor}
                              taxaVariavelPct={taxas.taxaVariavelPct}
                              taxaFixa={taxas.taxaFixa}
                              taxaAdicionalValor={resultado.taxaAdicionalValor}
                              taxaAdicionalPct={taxaAdicionalPct / 100}
                              taxaExtraCalculada={resultado.taxaExtraCalculada}
                              impostoValor={resultado.impostoValor}
                              impostoPct={impostoPct / 100}
                            />
                            <div className="flex justify-between font-medium pt-1.5 border-t border-border">
                              <span className="text-text-primary">Lucro líquido</span>
                              <span className={`font-mono ${resultado.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
                                {formatBRL(resultado.lucroLiquido)} ({(resultado.margemEfetivaPct * 100).toFixed(1)}%)
                              </span>
                            </div>
                            <div className="flex justify-between text-text-tertiary text-xs">
                              <span>Markup sobre custo</span>
                              <span className="font-mono">{(resultado.markupSobreCustoPct * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="mt-3">
                            <SimuladorPreco custoTotal={resultado.custoTotal} taxas={taxas} />
                          </div>
                          <div className="flex gap-2 mt-4">
                            <Button variant="secondary" className="flex-1" onClick={() => onCopiar(resumoDe(v))}>
                              Copiar
                            </Button>
                            <Button variant="secondary" className="flex-1" onClick={() => onWhatsapp(resumoDe(v))}>
                              Enviar WhatsApp
                            </Button>
                          </div>
                          <Button variant="secondary" className="w-full mt-2" onClick={() => onImagem(resumoDe(v))}>
                            Imagem
                          </Button>
                        </Card>
                        <Card>
                          <span className="text-xs font-medium text-text-tertiary uppercase block mb-2">Composição do Preço</span>
                          <PriceBreakdownChart
                            data={[
                              { nome: "Custo", valor: resultado.custoTotal },
                              {
                                nome: "Taxas da plataforma",
                                valor: taxas.taxaFixa + resultado.taxaVariavelValor + resultado.taxaAdicionalValor + resultado.taxaExtraCalculada,
                              },
                              { nome: "Imposto", valor: resultado.impostoValor },
                              { nome: "Lucro líquido", valor: Math.max(0, resultado.lucroLiquido) },
                            ]}
                          />
                        </Card>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </Table>
      <div className="p-4 border-t border-border">
        <Button variant="primary" onClick={onSalvar} loading={salvando} disabled={!podeSalvar}>
          Salvar Anúncio
        </Button>
      </div>
    </Card>
  );
}

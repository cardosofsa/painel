"use client";

import { useMemo, useState } from "react";
import { ArrowLeftRight, Upload } from "lucide-react";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { StatusChip } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { formatBRL, formatarDataIso } from "@/lib/format";
import { lerPlanilha } from "@/lib/importar";
import { executarComToast } from "@/lib/acao-cliente";
import { interpretarRelatorioRepasses, situacaoRepasse, type RepasseLido, type SituacaoRepasse } from "@/lib/marketplace/relatorios-financeiros";
import { conciliarRepasses, type ResultadoConciliacao } from "@/app/(painel)/financeiro/resultado-actions";

export interface PedidoRepasse {
  id: string;
  numero: string;
  loja: string;
  pago_em: string | null;
  repasse: number;
  repasse_recebido: number | null;
  repasse_recebido_em: string | null;
  /** Status do pedido e liberação do escrow (0085). */
  status?: string | null;
  escrow_liberado_em?: string | null;
}

const SITUACAO: Record<SituacaoRepasse, { rotulo: string; tom: "positive" | "negative" | "neutral" }> = {
  conciliado: { rotulo: "Conferido", tom: "positive" },
  divergente: { rotulo: "Diferente", tom: "negative" },
  aguardando: { rotulo: "Aguardando", tom: "neutral" },
};

const FILTROS: { id: SituacaoRepasse | "todos"; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "divergente", rotulo: "Diferentes" },
  { id: "aguardando", rotulo: "Aguardando" },
  { id: "conciliado", rotulo: "Conferidos" },
];

/**
 * Financeiro → Repasses: o que cada marketplace deveria pagar por pedido × o que pagou de
 * verdade (relatório importado ou baixa automática da sincronização, 0087). Repasse nunca
 * "atrasa": a plataforma libera ou estorna.
 */
export function AbaRepasses({ pedidos, contas, repassesOk }: { pedidos: PedidoRepasse[]; contas: { id: string; nome: string }[]; repassesOk: boolean }) {
  const [filtro, setFiltro] = useState<SituacaoRepasse | "todos">("todos");
  const [importando, setImportando] = useState(false);

  const comSituacao = useMemo(() => pedidos.map((p) => ({ ...p, situacao: situacaoRepasse(p) })), [pedidos]);
  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: comSituacao.length };
    for (const p of comSituacao) c[p.situacao] = (c[p.situacao] ?? 0) + 1;
    return c;
  }, [comSituacao]);

  if (!repassesOk) {
    return (
      <Card className="text-sm text-text-secondary">
        A conciliação de repasses precisa da migração <span className="font-mono">0066_dre_anuncios_repasses.sql</span>. Aplique no Supabase e recarregue.
      </Card>
    );
  }

  const lista = filtro === "todos" ? comSituacao : comSituacao.filter((p) => p.situacao === filtro);
  const aReceber = comSituacao.filter((p) => p.repasse_recebido === null).reduce((s, p) => s + p.repasse, 0);
  const aguardando = comSituacao.filter((p) => p.situacao === "aguardando");
  const diferenca = comSituacao.filter((p) => p.situacao === "divergente").reduce((s, p) => s + ((p.repasse_recebido ?? 0) - p.repasse), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardEyebrow>A receber dos marketplaces</CardEyebrow>
          <HeroMetric value={formatBRL(aReceber)} caption={`${comSituacao.filter((p) => p.repasse_recebido === null).length} pedido(s) sem repasse conferido`} />
        </Card>
        <Card>
          <CardEyebrow>Aguardando liberação</CardEyebrow>
          <HeroMetric value={formatBRL(aguardando.reduce((s, p) => s + p.repasse, 0))} caption={`${aguardando.length} pedido(s): a baixa é automática quando a Shopee libera`} />
        </Card>
        <Card>
          <CardEyebrow>Diferença nos conferidos</CardEyebrow>
          <HeroMetric value={formatBRL(diferenca)} caption={diferenca < 0 ? "recebeu menos do que o esperado" : "recebido − esperado"} />
        </Card>
      </div>

      <Card padding="nenhum" className="overflow-hidden">
        <div className="px-5 pt-5 pb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Repasses por pedido</h2>
            <p className="text-xs text-text-tertiary">Importe o relatório de valores liberados da plataforma: cada pedido é conferido e o dinheiro entra na conta.</p>
          </div>
          <Button variant="primary" onClick={() => setImportando(true)}>
            <Upload size={14} /> Importar relatório de repasses
          </Button>
        </div>
        <div className="flex gap-2 flex-wrap px-5 pb-4">
          {FILTROS.map((f) => (
            <Chip key={f.id} ativo={filtro === f.id} onClick={() => setFiltro(f.id)}>
              {f.rotulo} {contagem[f.id] ? `(${contagem[f.id]})` : ""}
            </Chip>
          ))}
        </div>
        {lista.length === 0 ? (
          <EmptyState icon={ArrowLeftRight} title="Nada por aqui" description="Pedidos pagos dos marketplaces dos últimos 4 meses aparecem aqui com o repasse esperado." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Loja</Th>
                <Th>Pago em</Th>
                <Th align="right">Esperado</Th>
                <Th align="right">Recebido</Th>
                <Th align="right">Diferença</Th>
                <Th>Situação</Th>
              </tr>
            </Thead>
            <tbody>
              {lista.slice(0, 300).map((p) => {
                const dif = p.repasse_recebido === null ? null : p.repasse_recebido - p.repasse;
                return (
                  <Tr key={p.id}>
                    <Td mono>{p.numero}</Td>
                    <Td className="text-text-secondary">{p.loja}</Td>
                    <Td mono>{p.pago_em ? formatarDataIso(p.pago_em.slice(0, 10)) : "—"}</Td>
                    <Td align="right" mono>
                      {formatBRL(p.repasse)}
                    </Td>
                    <Td align="right" mono>
                      {p.repasse_recebido === null ? "—" : formatBRL(p.repasse_recebido)}
                      {p.repasse_recebido_em && <div className="text-[11px] text-text-tertiary">{formatarDataIso(p.repasse_recebido_em)}</div>}
                    </Td>
                    <Td align="right" mono className={dif !== null && Math.abs(dif) > 0.05 ? (dif < 0 ? "text-negative" : "text-positive") : "text-text-tertiary"}>
                      {dif === null ? "—" : formatBRL(dif)}
                    </Td>
                    <Td>
                      <StatusChip label={SITUACAO[p.situacao].rotulo} tone={SITUACAO[p.situacao].tom} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
        {lista.length > 300 && <p className="px-5 py-3 text-xs text-text-tertiary">Mostrando os 300 primeiros. Use os filtros para achar o resto.</p>}
      </Card>

      {importando && <ImportarRepassesModal contas={contas} onClose={() => setImportando(false)} />}
    </div>
  );
}

function ImportarRepassesModal({ contas, onClose }: { contas: { id: string; nome: string }[]; onClose: () => void }) {
  const [lidos, setLidos] = useState<{ repasses: RepasseLido[]; total: number; erros: { linha: number; mensagem: string }[] } | null>(null);
  const [contaId, setContaId] = useState(contas[0]?.id ?? "");
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoConciliacao[] | null>(null);

  async function ler(file: File) {
    setLendo(true);
    try {
      setLidos(interpretarRelatorioRepasses(await lerPlanilha(file)));
      setResultado(null);
    } finally {
      setLendo(false);
    }
  }

  async function conciliar() {
    if (!lidos || lidos.repasses.length === 0 || !contaId) return;
    setSalvando(true);
    const r = await executarComToast(conciliarRepasses({ conta_id: contaId, itens: lidos.repasses }), { erro: "Erro ao conciliar" });
    setSalvando(false);
    if (r.ok) setResultado(r.dado);
  }

  const resumo = resultado
    ? {
        conciliado: resultado.filter((r) => r.status === "conciliado").length,
        divergente: resultado.filter((r) => r.status === "divergente"),
        nao: resultado.filter((r) => r.status === "nao_encontrado"),
        ja: resultado.filter((r) => r.status === "ja_conciliado").length,
      }
    : null;

  return (
    <Modal open onClose={onClose} title="Importar relatório de repasses" width="max-w-lg">
      {resumo ? (
        <div className="space-y-3 text-sm">
          <p className="text-text-primary">
            <strong>{resumo.conciliado}</strong> conferido(s) · <strong className={resumo.divergente.length ? "text-negative" : ""}>{resumo.divergente.length}</strong> com diferença ·{" "}
            <strong>{resumo.nao.length}</strong> não encontrado(s){resumo.ja ? ` · ${resumo.ja} já conferido(s) antes` : ""}.
          </p>
          {resumo.divergente.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
              {resumo.divergente.map((d) => (
                <div key={d.numero} className="flex justify-between px-3 py-1.5 font-mono text-xs">
                  <span>{d.numero}</span>
                  <span>
                    esperado {formatBRL(d.esperado ?? 0)} · recebido {formatBRL(d.recebido)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {resumo.nao.length > 0 && <p className="text-xs text-text-secondary">Não encontrados: pedidos que ainda não foram importados ou sincronizados no Sertão ({resumo.nao.slice(0, 5).map((n) => n.numero).join(", ")}{resumo.nao.length > 5 ? "…" : ""}).</p>}
          <Button variant="primary" className="w-full" onClick={onClose}>
            Fechar
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-secondary">
            Shopee: Minha Renda → Renda liberada → Exportar. Mercado Livre: Relatórios de liberações (Mercado Pago). O arquivo precisa ter o número do pedido e o valor liberado.
          </p>
          <CampoArquivo onArquivo={ler} disabled={lendo} rotulo={lendo ? "Lendo…" : "Escolher relatório"} aceita=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
          {lidos && (
            <>
              {lidos.erros.slice(0, 5).map((e) => (
                <p key={`${e.linha}-${e.mensagem}`} className="text-xs text-negative">
                  Linha {e.linha}: {e.mensagem}
                </p>
              ))}
              {lidos.repasses.length > 0 && (
                <p className="text-sm text-text-primary">
                  {lidos.repasses.length} pedido(s) · <strong>{formatBRL(lidos.total)}</strong> liberado(s)
                </p>
              )}
              <FormField label="Conta onde o dinheiro caiu">
                <select className={inputClass} value={contaId} onChange={(e) => setContaId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </FormField>
            </>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" className="flex-1" onClick={conciliar} loading={salvando} disabled={!lidos || lidos.repasses.length === 0 || !contaId}>
              Conferir e dar baixa
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

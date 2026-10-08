"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Equal, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import { desvioProjecao, rotuloMes, type FechamentoMes } from "@/lib/fechamento-mensal";
import type { RelatorioMes } from "@/lib/ia/prompts-relatorio";
import { atualizarHistoricoFinanceiro, gerarRelatorioMes } from "@/app/(painel)/financeiro/fechamento-actions";

type RelatorioComData = RelatorioMes & { gerado_em?: string };

const inicial = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Diferença em palavras (a cor sozinha não basta). Mês fechado: saldo real contra o previsto.
 * Mês aberto ainda não tem "real" do fim do mês: mostra quanto a previsão mudou desde o início.
 */
function Desvio({ inicial, atual, aberto }: { inicial: number; atual: number; aberto: boolean }) {
  const d = desvioProjecao(inicial, atual);
  const Icone = d.direcao === "acima" ? ArrowUp : d.direcao === "abaixo" ? ArrowDown : Equal;
  const cor = d.direcao === "acima" ? "text-positive" : d.direcao === "abaixo" ? "text-negative" : "text-text-secondary";
  const pct = d.pct !== null ? ` (${Math.abs(d.pct).toFixed(1).replace(".", ",")}%)` : "";
  const valor = formatBRL(Math.abs(d.diferenca));
  const texto = aberto
    ? d.direcao === "igual"
      ? "Previsão sem mudança"
      : `Previsão ${d.direcao === "acima" ? "subiu" : "caiu"} ${valor}${pct}`
    : d.direcao === "igual"
      ? "Bateu com o previsto"
      : `${valor} ${d.direcao === "acima" ? "acima" : "abaixo"} do previsto${pct}`;
  return (
    <span className={`inline-flex items-center gap-1 ${cor}`}>
      <Icone size={14} aria-hidden /> {texto}
    </span>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{titulo}</h4>
      {children}
    </section>
  );
}

function Lista({ itens }: { itens: string[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1 text-sm text-text-primary">
      {itens.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function Relatorio({ r }: { r: RelatorioComData }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-primary">{r.resumo}</p>
      {r.acertos.length > 0 && (
        <Secao titulo="O que foi bem">
          <Lista itens={r.acertos} />
        </Secao>
      )}
      {r.previsao && (
        <Secao titulo="Previsão × realidade">
          <p className="text-sm text-text-primary">{r.previsao}</p>
        </Secao>
      )}
      {r.gastosRevisar.length > 0 && (
        <Secao titulo="Gastos que valem revisar">
          <ul className="space-y-2">
            {r.gastosRevisar.map((g) => (
              <li key={g.titulo} className="rounded-md border border-border p-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-text-primary">{g.titulo}</span>
                  {g.valor !== null && <span className="font-mono text-negative shrink-0">{formatBRL(g.valor)}</span>}
                </div>
                <p className="text-text-secondary mt-0.5">{g.detalhe}</p>
              </li>
            ))}
          </ul>
        </Secao>
      )}
      {r.oportunidades.length > 0 && (
        <Secao titulo="Como ganhar mais">
          <Lista itens={r.oportunidades} />
        </Secao>
      )}
      {r.plano.length > 0 && (
        <Secao titulo="Plano para o próximo mês">
          <ol className="list-decimal pl-5 space-y-1.5 text-sm text-text-primary">
            {r.plano.map((p) => (
              <li key={p.acao}>
                <span className="font-medium">{p.acao}</span>
                {p.motivo && <span className="text-text-secondary"> — {p.motivo}</span>}
              </li>
            ))}
          </ol>
          {r.metaSaldo !== null && (
            <p className="text-sm text-text-secondary pt-1">
              Meta de saldo para o fim do próximo mês: <span className="font-mono text-text-primary">{formatBRL(r.metaSaldo)}</span>
            </p>
          )}
        </Secao>
      )}
    </div>
  );
}

/**
 * Histórico mensal do saldo (projetado × real) e a análise do mês feita pela IA. Montado só
 * quando aberto (o pai usa `{aberto && <AnaliseMesModal … />}`), então o estado nasce limpo a
 * cada abertura.
 */
export function AnaliseMesModal({
  onClose,
  fechamentos,
  mesAtual,
  iaDisponivel,
}: {
  onClose: () => void;
  fechamentos: FechamentoMes[];
  /** Primeiro dia do mês corrente (AAAA-MM-01). */
  mesAtual: string;
  iaDisponivel: boolean;
}) {
  const [selecionado, setSelecionado] = useState(fechamentos.find((f) => f.mes === mesAtual)?.mes ?? fechamentos[0]?.mes ?? mesAtual);
  const [gerados, setGerados] = useState<Record<string, RelatorioComData>>({});
  const [meta, setMeta] = useState<{ usadas: number; limite: number; doCache: boolean; provedorRotulo: string | null } | null>(null);
  const [pendente, startTransition] = useTransition();

  const f = fechamentos.find((x) => x.mes === selecionado) ?? null;
  const relatorio = f ? (gerados[f.mes] ?? f.relatorio) : null;
  const aberto = !!f && !f.fechado_em;

  function gerar(mes: string) {
    startTransition(async () => {
      const r = await executarComToast(gerarRelatorioMes(mes), { erro: "Não foi possível gerar a análise. Tente de novo." });
      if (!r.ok) return;
      setGerados((g) => ({ ...g, [mes]: r.dado.relatorio }));
      setMeta({ usadas: r.dado.usadas, limite: r.dado.limite, doCache: r.dado.doCache, provedorRotulo: r.dado.provedorRotulo });
    });
  }

  function comecar() {
    startTransition(async () => {
      await executarComToast(atualizarHistoricoFinanceiro(), { sucesso: "Histórico iniciado com o saldo de hoje", erro: "Não foi possível iniciar o histórico." });
    });
  }

  return (
    <Modal open onClose={onClose} title="Histórico e análise do mês" width="max-w-3xl">
      {fechamentos.length === 0 || !f ? (
        <div className="space-y-3 text-sm">
          <p className="text-text-secondary">
            Ainda não há meses guardados. O sistema registra o saldo e a previsão de cada mês todo dia, e o mês fecha sozinho no dia 1º. Comece agora com o saldo de hoje.
          </p>
          <Button onClick={comecar} disabled={pendente}>
            {pendente ? "Guardando…" : "Começar histórico"}
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <Table>
            <Thead>
              <Tr>
                <Th>Mês</Th>
                <Th align="right">Previsto</Th>
                <Th align="right">Real</Th>
                <Th>Diferença</Th>
              </Tr>
            </Thead>
            <tbody>
              {fechamentos.map((x) => (
                <Tr key={x.mes} selecionada={x.mes === selecionado}>
                  <Td>
                    <button type="button" className="text-left text-text-primary hover:underline" onClick={() => setSelecionado(x.mes)} aria-current={x.mes === selecionado}>
                      {inicial(rotuloMes(x.mes))}
                    </button>
                    {!x.fechado_em && <span className="ml-1.5"><StatusChip label="Em andamento" tone="neutral" /></span>}
                  </Td>
                  <Td align="right" mono>{formatBRL(x.projetado_inicial)}</Td>
                  <Td align="right" mono>{x.fechado_em ? formatBRL(x.saldo_real) : "—"}</Td>
                  <Td><Desvio inicial={x.projetado_inicial} atual={x.fechado_em ? x.saldo_real : x.projetado_atual} aberto={!x.fechado_em} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>

          <div className="rounded-md border border-border bg-surface-1 p-4 space-y-3">
            <h3 className="text-base font-semibold text-text-primary">{inicial(rotuloMes(f.mes))}</h3>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <dt className="text-xs text-text-tertiary">Saldo no início</dt>
                <dd className="font-mono text-text-primary">{formatBRL(f.saldo_inicial)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-tertiary">Previsto para o fim</dt>
                <dd className="font-mono text-text-primary">{formatBRL(f.projetado_inicial)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-tertiary">{aberto ? "Saldo hoje" : "Saldo no fim"}</dt>
                <dd className="font-mono text-text-primary">{formatBRL(f.saldo_real)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-tertiary">{aberto ? "Previsão de hoje" : "Resultado de caixa"}</dt>
                <dd className="font-mono text-text-primary">{formatBRL(aberto ? f.projetado_atual : f.detalhes.resultadoCaixa)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-tertiary">Entradas</dt>
                <dd className="font-mono text-positive">{formatBRL(f.detalhes.entradas)}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-tertiary">Saídas</dt>
                <dd className="font-mono text-negative">{formatBRL(f.detalhes.saidas)}</dd>
              </div>
            </dl>
            {f.detalhes.despesas.length > 0 && (
              <p className="text-xs text-text-secondary">
                Maiores despesas: {f.detalhes.despesas.slice(0, 4).map((d) => `${d.categoria} ${formatBRL(d.valor)}`).join(" · ")}
              </p>
            )}
          </div>

          {iaDisponivel ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="text-base font-semibold text-text-primary flex items-center gap-2">
                  <Sparkles size={16} className="text-accent" aria-hidden /> Análise com IA
                </h3>
                <Button size="sm" variant={relatorio ? "secondary" : "primary"} onClick={() => gerar(f.mes)} disabled={pendente}>
                  {pendente ? "Analisando…" : relatorio ? "Gerar de novo" : "Analisar este mês"}
                </Button>
              </div>
              {aberto && <p className="text-xs text-text-tertiary">O mês ainda não acabou: a análise é parcial e pode mudar até o fim.</p>}
              {relatorio ? (
                <>
                  <Relatorio r={relatorio} />
                  <p className="text-xs text-text-tertiary">
                    {relatorio.gerado_em ? `Gerada em ${new Date(relatorio.gerado_em).toLocaleDateString("pt-BR")}. ` : ""}
                    {meta ? (meta.doCache ? "Sem mudança nos números: veio do cache e não gastou geração. " : "") : ""}
                    {meta?.provedorRotulo ? `IA: ${meta.provedorRotulo}. ` : ""}
                    A IA só usa os números acima: confira antes de decidir.
                  </p>
                </>
              ) : (
                <p className="text-sm text-text-secondary">Resultado, despesas que subiram e o que dá para melhorar no próximo mês, em linguagem simples.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-tertiary">A análise com IA fica disponível quando a IA estiver ligada (Configurações → IA).</p>
          )}
        </div>
      )}
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/Badge";
import { dataLocal, formatBRL } from "@/lib/format";
import { CAMADAS, agruparRepasses, gradeDoMes, type ItemDoDia } from "@/lib/calendario-dashboard";
import { contadoresDoDia, contasDoMes, resumoDoMes, type ContaCalendario, type ContaCalendarioFonte, type StatusContaCalendario } from "@/lib/calendario-contas";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
// Mesmas cores do calendário do Dashboard.
const COR = {
  pagar: CAMADAS.find((c) => c.id === "pagar")!.cor,
  receber: CAMADAS.find((c) => c.id === "receber")!.cor,
};
const inicialMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nomeMes = (ano: number, mes: number) => inicialMaiuscula(new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
const diaPorExtenso = (iso: string) => inicialMaiuscula(dataLocal(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const STATUS: Record<StatusContaCalendario, { rotulo: string; tom: "positive" | "negative" | "neutral" }> = {
  pendente: { rotulo: "Pendente", tom: "neutral" },
  vencida: { rotulo: "Vencida", tom: "negative" },
  paga: { rotulo: "Paga", tom: "positive" },
};
const rotuloStatus = (c: ContaCalendario) => (c.status === "paga" && c.tipo === "receber" ? "Recebida" : STATUS[c.status].rotulo);
const ORIGEM: Record<ContaCalendario["origem"], string | null> = { conta: null, parcela: "Crediário", fixa: "Despesa fixa" };

/**
 * Calendário só de contas, na aba "Calendário" do Financeiro: a pagar (contas, parcelas de
 * compra, dívidas e despesas fixas projetadas) e a receber (contas, crediário e repasses,
 * estes juntos por dia). Os dados chegam prontos da página (12 meses para trás e para frente).
 */
export function CalendarioContas({ contas, hoje }: { contas: ContaCalendarioFonte[]; hoje: string }) {
  const [anoHoje, mesHoje] = hoje.split("-").map(Number);
  const [ano, setAno] = useState(anoHoje);
  const [mes, setMes] = useState(mesHoje);
  const [selecionado, setSelecionado] = useState(hoje);

  const porDia = contasDoMes(contas, ano, mes, hoje);
  const resumo = resumoDoMes(porDia);
  const grade = gradeDoMes(ano, mes);
  const doDia = agruparRepasses(porDia[selecionado] ?? [], true);

  function irPara(a: number, m: number) {
    setAno(a);
    setMes(m);
    setSelecionado(a === anoHoje && m === mesHoje ? hoje : `${a}-${String(m).padStart(2, "0")}-01`);
  }
  const mudarMes = (delta: number) => {
    const d = new Date(ano, mes - 1 + delta, 1);
    irPara(d.getFullYear(), d.getMonth() + 1);
  };

  return (
    <Card padding="nenhum" className="overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <CardTitle className="flex items-center gap-2">
          <CalendarDays size={18} className="text-accent" /> Calendário de contas
        </CardTitle>
        <CardSubtitle>Vencimentos a pagar (inclui despesas fixas e dívidas) e a receber, dia a dia.</CardSubtitle>
      </div>

      {/* Resumo do mês */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-5 pb-4">
        <Resumo titulo="A pagar no mês" cor={COR.pagar} classeValor="text-negative" t={resumo.pagar} verbo="paga" />
        <Resumo titulo="A receber no mês" cor={COR.receber} classeValor="text-positive" t={resumo.receber} verbo="recebida" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] border-t border-border">
        <div className="p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <IconButton aria-label="Mês anterior" onClick={() => mudarMes(-1)}>
              <ChevronLeft size={16} />
            </IconButton>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary" aria-live="polite">
                {nomeMes(ano, mes)}
              </span>
              {(ano !== anoHoje || mes !== mesHoje) && (
                <Button variant="ghost" size="sm" onClick={() => irPara(anoHoje, mesHoje)}>
                  Hoje
                </Button>
              )}
            </div>
            <IconButton aria-label="Próximo mês" onClick={() => mudarMes(1)}>
              <ChevronRight size={16} />
            </IconButton>
          </div>

          <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Contas de ${nomeMes(ano, mes)}`}>
            {SEMANA.map((d, i) => (
              <div key={d} className={`text-center text-xs font-medium pb-1 ${i === 0 || i === 6 ? "text-text-tertiary" : "text-text-secondary"}`}>
                {d}
              </div>
            ))}
            {grade.map((dia, i) => {
              if (!dia) return <div key={`vazio-${i}`} aria-hidden />;
              const lista = porDia[dia] ?? [];
              const c = contadoresDoDia(lista);
              const ativo = dia === selecionado;
              const partes = [
                c.pagar.qtd ? `${plural(c.pagar.qtd, "a pagar", "a pagar")} · ${formatBRL(c.pagar.total)}` : null,
                c.receber.qtd ? `${plural(c.receber.qtd, "a receber", "a receber")} · ${formatBRL(c.receber.total)}` : null,
                c.pagas ? plural(c.pagas, "quitada", "quitadas") : null,
              ].filter(Boolean);
              return (
                <button
                  key={dia}
                  type="button"
                  role="gridcell"
                  aria-selected={ativo}
                  aria-label={`${diaPorExtenso(dia)}${partes.length ? `: ${partes.join(", ")}` : ""}`}
                  onClick={() => setSelecionado(dia)}
                  className={`flex flex-col items-stretch text-left rounded-md border min-h-12 sm:min-h-16 p-1 sm:p-1.5 transition-colors ${
                    ativo ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"
                  }`}
                >
                  <span className={`text-xs font-mono self-start rounded px-1 ${dia === hoje ? "bg-accent text-accent-on font-semibold" : "text-text-secondary"}`}>
                    {Number(dia.slice(8))}
                  </span>
                  {/* Celular: pontos. Tela maior: "N · R$". */}
                  <span className="flex gap-0.5 mt-1 sm:hidden">
                    {c.pagar.qtd > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: COR.pagar }} />}
                    {c.receber.qtd > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: COR.receber }} />}
                    {c.pagas > 0 && c.pagar.qtd + c.receber.qtd === 0 && <span className="w-1.5 h-1.5 rounded-full bg-text-tertiary" />}
                  </span>
                  <span className="hidden sm:flex flex-col gap-0.5 mt-1 min-w-0 text-xs leading-4">
                    {c.pagar.qtd > 0 && (
                      <span className={`truncate ${c.pagar.vencida ? "text-negative font-medium" : "text-text-primary"}`}>
                        <Ponto cor={COR.pagar} />
                        {c.pagar.qtd} · {formatBRL(c.pagar.total)}
                      </span>
                    )}
                    {c.receber.qtd > 0 && (
                      <span className={`truncate ${c.receber.vencida ? "text-negative font-medium" : "text-text-primary"}`}>
                        <Ponto cor={COR.receber} />
                        {c.receber.qtd} · {formatBRL(c.receber.total)}
                      </span>
                    )}
                    {c.pagas > 0 && <span className="truncate text-text-tertiary">{plural(c.pagas, "quitada", "quitadas")}</span>}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3 text-xs text-text-secondary">
            <span className="inline-flex items-center">
              <Ponto cor={COR.pagar} /> A pagar
            </span>
            <span className="inline-flex items-center">
              <Ponto cor={COR.receber} /> A receber
            </span>
            <span className="inline-flex items-center text-negative">Em vermelho: vencida</span>
          </div>
        </div>

        <section aria-label="Contas do dia" className="border-t lg:border-t-0 lg:border-l border-border p-5 bg-surface-1">
          <h3 className="text-sm font-semibold text-text-primary mb-2">{diaPorExtenso(selecionado)}</h3>
          {doDia.length === 0 ? (
            <p className="text-sm text-text-tertiary">Nenhuma conta vence neste dia.</p>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto overscroll-contain pr-1">
              {doDia.map((item) => (item.tipo === "repasses" ? <GrupoRepasses key={item.id} grupo={item} /> : <LinhaConta key={item.id} c={item.evento} />))}
            </ul>
          )}
        </section>
      </div>
    </Card>
  );
}

function Ponto({ cor }: { cor: string }) {
  return <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ background: cor }} aria-hidden />;
}

function Resumo({
  titulo,
  cor,
  classeValor,
  t,
  verbo,
}: {
  titulo: string;
  cor: string;
  classeValor: string;
  t: { total: number; quantidade: number; vencidas: number; pagas: number };
  verbo: string;
}) {
  const abertas = t.quantidade - t.pagas;
  return (
    <div className="rounded-md border border-border bg-surface-1 p-3" style={{ borderLeft: `3px solid ${cor}` }}>
      <div className="text-xs text-text-secondary">{titulo}</div>
      <div className={`font-mono text-lg font-semibold ${classeValor}`}>{formatBRL(t.total)}</div>
      <div className="text-xs text-text-tertiary mt-0.5">
        {plural(abertas, "em aberto", "em aberto")}
        {t.vencidas > 0 && <span className="text-negative"> · {plural(t.vencidas, "vencida", "vencidas")}</span>}
        {t.pagas > 0 && ` · ${t.pagas} ${verbo}${t.pagas === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}

function LinhaConta({ c }: { c: ContaCalendario }) {
  const origem = ORIGEM[c.origem];
  return (
    <li className="rounded-md border border-border p-2.5 text-sm" style={{ borderLeft: `3px solid ${COR[c.tipo]}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`font-medium ${c.status === "paga" ? "text-text-secondary" : "text-text-primary"}`}>{c.descricao}</div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <StatusChip label={rotuloStatus(c)} tone={STATUS[c.status].tom} />
            <span className="text-xs text-text-tertiary">
              {c.tipo === "pagar" ? "A pagar" : "A receber"}
              {origem ? ` · ${origem}` : ""}
            </span>
          </div>
        </div>
        <span className={`font-mono text-sm shrink-0 ${c.status === "paga" ? "text-text-tertiary" : c.tipo === "pagar" ? "text-negative" : "text-positive"}`}>{formatBRL(c.valor)}</span>
      </div>
    </li>
  );
}

function GrupoRepasses({ grupo }: { grupo: Extract<ItemDoDia<ContaCalendario>, { tipo: "repasses" }> }) {
  const vencidas = grupo.eventos.filter((e) => e.status === "vencida").length;
  const pagas = grupo.eventos.filter((e) => e.status === "paga").length;
  return (
    <li className="rounded-md border border-border text-sm" style={{ borderLeft: `3px solid ${COR.receber}` }}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-2 p-2.5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="font-medium text-text-primary">Repasses {grupo.loja}</div>
            <div className="text-xs text-text-secondary mt-0.5">
              {plural(grupo.eventos.length, "pedido", "pedidos")}
              {vencidas > 0 && <span className="text-negative"> · {plural(vencidas, "vencido", "vencidos")}</span>}
              {pagas > 0 && ` · ${plural(pagas, "recebido", "recebidos")}`}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="font-mono text-sm text-positive">{formatBRL(grupo.total)}</span>
            <ChevronDown size={14} className="text-text-tertiary transition-transform group-open:rotate-180" aria-hidden />
          </div>
        </summary>
        <ul className="border-t border-border px-2.5 py-2 space-y-1">
          {grupo.eventos.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-text-secondary">
                Pedido {e.repasse?.pedido} · {rotuloStatus(e)}
              </span>
              <span className="font-mono text-text-primary shrink-0">{formatBRL(e.valor)}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { Button } from "@/components/ui/Button";
import { atalhoDoPeriodo, dataDoDia, diasDoMes, periodoDoAtalho, rotuloPeriodo, ROTULO_ATALHO, somarDias, type AtalhoPeriodo, type Periodo } from "@/lib/periodo";
import { hojeIsoBrasil } from "@/lib/format";

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/**
 * "Vendas de hoje" + "Selecionar período": atalhos (7 dias, 30 dias, este mês...) acima de
 * um calendário de intervalo (clica no início e no fim). `limiteDias` trava a data mais
 * antiga ao que a tela carregou.
 */
export function SeletorPeriodo({ valor, onChange, limiteDias }: { valor: Periodo; onChange: (p: Periodo) => void; limiteDias?: number }) {
  const atalho = atalhoDoPeriodo(valor);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(periodoDoAtalho("hoje"))}
        className={`h-9 rounded-md border px-3 text-sm ${atalho === "hoje" ? "border-accent bg-accent-soft text-accent font-medium" : "border-border bg-surface-1 hover:bg-surface-2"}`}
      >
        Vendas de hoje
      </button>
      <Popover
        ativo={atalho !== "hoje"}
        rotulo={
          <>
            <CalendarDays size={14} /> {atalho && atalho !== "hoje" ? ROTULO_ATALHO[atalho] : atalho === "hoje" ? "Selecionar período" : rotuloPeriodo(valor)}
          </>
        }
      >
        {(fechar) => <Calendario valor={valor} limiteDias={limiteDias} onAplicar={(p) => (onChange(p), fechar())} />}
      </Popover>
    </div>
  );
}

function Calendario({ valor, onAplicar, limiteDias }: { valor: Periodo; onAplicar: (p: Periodo) => void; limiteDias?: number }) {
  const hoje = hojeIsoBrasil();
  const minimo = limiteDias ? somarDias(hoje, -limiteDias) : null;
  const [mes, setMes] = useState(() => {
    const d = dataDoDia(valor.fim);
    return { ano: d.getFullYear(), m: d.getMonth() };
  });
  const [inicio, setInicio] = useState<string | null>(valor.inicio);
  const [fim, setFim] = useState<string | null>(valor.fim);

  function clicar(dia: string) {
    if (!inicio || fim) {
      setInicio(dia);
      setFim(null);
    } else if (dia < inicio) {
      setFim(inicio);
      setInicio(dia);
    } else setFim(dia);
  }

  function mudarMes(delta: number) {
    setMes(({ ano, m }) => {
      const d = new Date(ano, m + delta, 1);
      return { ano: d.getFullYear(), m: d.getMonth() };
    });
  }

  const atalhos: AtalhoPeriodo[] = ["7d", "30d", "mes", "ontem", "mes_passado"];
  const dias = diasDoMes(mes.ano, mes.m);
  const ate = fim ?? inicio;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {atalhos.map((a) => (
          <button key={a} type="button" onClick={() => onAplicar(periodoDoAtalho(a))} className="text-xs rounded-full border border-border px-2.5 py-1 hover:border-accent hover:text-accent">
            {ROTULO_ATALHO[a]}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => mudarMes(-1)} aria-label="Mês anterior" className="p-1 rounded hover:bg-surface-2">
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-medium text-text-primary capitalize">
          {MESES[mes.m]} {mes.ano}
        </span>
        <button type="button" onClick={() => mudarMes(1)} aria-label="Próximo mês" className="p-1 rounded hover:bg-surface-2">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-text-tertiary mb-1">
        {SEMANA.map((s, i) => (
          <span key={i}>{s}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {dias.map((d, i) => {
          if (!d) return <span key={i} />;
          const fora = d > hoje || (minimo != null && d < minimo);
          const ponta = d === inicio || d === ate;
          const dentro = inicio && ate && d > inicio && d < ate;
          return (
            <button
              key={d}
              type="button"
              disabled={fora}
              onClick={() => clicar(d)}
              className={`h-8 rounded text-xs font-mono ${ponta ? "bg-accent text-accent-on font-semibold" : dentro ? "bg-accent-soft text-accent" : "hover:bg-surface-2 text-text-primary"} disabled:text-text-tertiary/40 disabled:hover:bg-transparent`}
            >
              {Number(d.slice(8))}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-border">
        <span className="text-xs text-text-secondary">{inicio ? rotuloPeriodo({ inicio, fim: ate ?? inicio }) : "Escolha o início"}</span>
        <Button size="sm" variant="primary" disabled={!inicio} onClick={() => inicio && onAplicar({ inicio, fim: ate ?? inicio })}>
          Aplicar
        </Button>
      </div>
      {minimo && <p className="text-[10px] text-text-tertiary mt-1">Até {limiteDias} dias atrás aqui. Períodos maiores: Relatórios.</p>}
    </div>
  );
}

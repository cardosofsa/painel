import { CalendarDays } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { proximasDatas } from "@/lib/calendario-comercial";
import { feriadosDoAno, naUf } from "@/lib/feriados";
import { diasAte } from "@/lib/calendario-dashboard";
import { dataLocal, hojeIsoBrasil } from "@/lib/format";
import { acoesDaData } from "@/lib/calendario-acoes";
import { AcoesData } from "@/components/calendario/AcoesData";

type Linha = { id: string; nome: string; data: string; faltam: number; preparar: boolean; texto: string; feriado: boolean };

/**
 * Próximas datas que vendem (11.6), com quanto falta e o que preparar — e os feriados
 * nacionais e do estado no mesmo período: Correios e bancos fechados mudam o prazo de envio.
 */
export function CalendarioComercial({ hoje, janela = 60, uf = null }: { hoje: Date; janela?: number; uf?: string | null }) {
  // `proximasDatas` conta pelo relógio local, que no servidor é UTC: depois das 21h
  // "faltam 5 dias" virava 4. Passa a meia-noite local do dia de hoje no Brasil.
  const hojeIso = hojeIsoBrasil(hoje);
  const ano = Number(hojeIso.slice(0, 4));
  const comerciais: Linha[] = proximasDatas(dataLocal(hojeIso), janela).map((d) => ({
    id: d.id,
    nome: d.nome,
    data: d.data,
    faltam: d.faltam,
    preparar: d.preparar,
    texto: `${d.preparar ? "Hora de preparar: " : ""}${d.dica}`,
    feriado: false,
  }));
  const feriados: Linha[] = [...feriadosDoAno(ano, uf), ...feriadosDoAno(ano + 1, uf)]
    .map((f) => ({ f, faltam: diasAte(hojeIso, f.data) }))
    .filter(({ f, faltam }) => faltam >= 0 && faltam <= janela && f.tipo !== "facultativo")
    .map(({ f, faltam }) => ({
      id: `feriado-${f.data}-${f.nome}`,
      nome: f.nome,
      data: f.data,
      faltam,
      preparar: false,
      texto: `${f.tipo === "estadual" ? `Feriado ${naUf(f.uf ?? "") ?? `em ${f.uf}`}` : "Feriado nacional"}: Correios e bancos fechados, confira o prazo de envio.`,
      feriado: true,
    }));
  const datas = [...comerciais, ...feriados].sort((a, b) => a.faltam - b.faltam || Number(b.feriado) - Number(a.feriado));
  if (!datas.length) return null;
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={16} className="text-accent" />
        <h3 className="text-sm font-medium text-text-primary">Próximas datas: comércio e feriados</h3>
      </div>
      <ul className="space-y-2">
        {datas.map((d) => (
          <li key={d.id} className="flex items-start gap-3 text-sm">
            <span
              className={`shrink-0 w-16 text-center rounded-md px-1.5 py-1 text-xs font-mono ${
                d.feriado ? "bg-negative-soft text-negative" : d.preparar ? "bg-accent-soft text-accent font-semibold" : "bg-surface-2 text-text-secondary"
              }`}
            >
              {d.faltam === 0 ? "hoje" : `${d.faltam} dia${d.faltam > 1 ? "s" : ""}`}
            </span>
            <div className="min-w-0">
              <div className="text-text-primary font-medium">
                {d.nome}{" "}
                <span className="text-xs font-normal text-text-tertiary">{dataLocal(d.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
              </div>
              <div className="text-xs text-text-secondary">{d.texto}</div>
              {!d.feriado && <AcoesData acoes={acoesDaData(d)} />}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { formatBRL } from "@/lib/format";
import type { LojaOpcao } from "@/lib/precificacao-tipos";

/**
 * Blocos que as abas da Precificação compartilham (Individual, Variações, Kits e Em Massa):
 * "Onde vende", "Como quer lucrar", o passo numerado e o quadro de métrica. Antes cada aba
 * desenhava a sua versão (chips, select, rótulos diferentes para a mesma coisa).
 */

/** Termos fixos: o mesmo texto de ajuda em todas as abas. */
export const DICA_MARGEM = "Margem: quanto do preço de venda sobra de lucro (lucro ÷ preço). 28% num preço de R$ 100 = R$ 28.";
export const DICA_MARKUP = "Markup: quanto o lucro representa sobre o custo (lucro ÷ custo). 50% num custo de R$ 10 = R$ 5.";

/** Cartões e segmentos são pequenos: duas/três colunas já no celular (exceção da regra de grade).
 * Setas movem a escolha num grupo de rádio feito de botões (padrão WAI-ARIA). */
function teclasRadio<T>(opcoes: T[], atual: number, escolher: (o: T) => void) {
  return (e: KeyboardEvent<HTMLDivElement>) => {
    const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!passo || opcoes.length === 0) return;
    e.preventDefault();
    const i = ((atual < 0 ? 0 : atual) + passo + opcoes.length) % opcoes.length;
    escolher(opcoes[i]);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[i]?.focus();
  };
}

/** Uma etapa do cartão de configuração: número, título e o resumo do que foi escolhido. */
export function Passo({ n, titulo, resumo, ultimo = false, children }: { n: number; titulo: string; resumo?: string | null; ultimo?: boolean; children: ReactNode }) {
  return (
    <section className={`p-5 ${ultimo ? "" : "border-b border-border"}`} aria-labelledby={`passo-${n}-${titulo}`}>
      <div className="flex items-center gap-3 mb-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent text-xs font-semibold font-mono" aria-hidden="true">
          {n}
        </span>
        <h3 id={`passo-${n}-${titulo}`} className="text-sm font-semibold text-text-primary">
          {titulo}
        </h3>
        {resumo && <span className="ml-auto text-xs text-text-secondary truncate">{resumo}</span>}
      </div>
      {children}
    </section>
  );
}

/** O que a loja cobra, em uma linha ("comissão por faixa" ou "14% + R$ 4,00"). */
/** O mínimo de uma loja que os blocos usam (a aba Em Massa tem um tipo de loja mais enxuto). */
export type LojaDoBloco = Pick<LojaOpcao, "id" | "nome" | "canalNome" | "tipoTaxa" | "faixas" | "comissaoPct" | "taxaFixa">;

export function textoTaxasLoja(l: LojaDoBloco): string {
  return l.tipoTaxa === "faixas" && l.faixas.length ? "comissão por faixa" : `${l.comissaoPct}% + ${formatBRL(l.taxaFixa)}`;
}

/**
 * "Onde vende": um cartão por loja cadastrada e a opção sem loja (taxas à mão, venda direta…).
 * `lojaId` nulo = a opção sem loja está escolhida.
 */
export function OndeVende({
  lojas,
  lojaId,
  onEscolher,
  semLoja = { titulo: "Taxas à mão", sub: "Digite comissão e tarifa" },
  rotulo = "Onde vende",
}: {
  lojas: LojaDoBloco[];
  lojaId: string | null;
  onEscolher: (id: string | null) => void;
  /** A opção sem loja; `null` esconde (quando só loja faz sentido). */
  semLoja?: { titulo: string; sub: string } | null;
  rotulo?: string;
}) {
  const opcoes: (string | null)[] = [...lojas.map((l) => l.id), ...(semLoja ? [null] : [])];
  const setas = teclasRadio(opcoes, opcoes.indexOf(lojaId), onEscolher);
  return (
    <div onKeyDown={setas} className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={rotulo}>
      {lojas.map((l) => (
        <OpcaoCartao key={l.id} ativa={lojaId === l.id} titulo={l.nome} sub={`${l.canalNome} · ${textoTaxasLoja(l)}`} onClick={() => onEscolher(l.id)} />
      ))}
      {/* Número ímpar de opções: a última ocupa a linha toda, para a grade fechar alinhada. */}
      {semLoja && <OpcaoCartao ativa={lojaId === null} titulo={semLoja.titulo} sub={semLoja.sub} onClick={() => onEscolher(null)} className={opcoes.length % 2 === 1 ? "col-span-2" : ""} />}
      {lojas.length === 0 && <p className="text-xs text-text-tertiary col-span-2">Nenhuma loja cadastrada ainda. Cadastre em Configurações → Canais de Venda.</p>}
    </div>
  );
}

function OpcaoCartao({ ativa, titulo, sub, onClick, className = "" }: { ativa: boolean; titulo: string; sub: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativa}
      tabIndex={ativa ? 0 : -1}
      onClick={onClick}
      className={`${className} min-w-0 rounded-lg border px-3 py-2.5 text-left transition-colors duration-[--duracao-rapida] ${ativa ? "border-accent bg-accent-soft" : "border-border hover:border-border-forte hover:bg-surface-2"}`}
    >
      <span className="block text-sm font-medium text-text-primary truncate">{titulo}</span>
      <span className="block text-xs text-text-secondary truncate">{sub}</span>
    </button>
  );
}

export interface ModoOpcao<M extends string> {
  id: M;
  rotulo: string;
  /** Rótulo do campo do valor ("Margem líquida (%)"). */
  campo: string;
  casas?: number;
  dica?: string;
}

/** "Como quer lucrar": seletor segmentado do modo e o campo do valor. */
export function ComoLucrar<M extends string>({
  modos,
  modo,
  onModo,
  valor,
  onValor,
  rotulo = "Forma de calcular",
}: {
  modos: ModoOpcao<M>[];
  modo: M;
  onModo: (m: M) => void;
  valor: number;
  onValor: (n: number) => void;
  rotulo?: string;
}) {
  const atual = modos.find((m) => m.id === modo) ?? modos[0];
  const setas = teclasRadio(
    modos.map((m) => m.id),
    modos.findIndex((m) => m.id === modo),
    onModo,
  );
  const colunas = modos.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_12rem] gap-3 items-end">
      <div>
        <span className="block text-xs font-medium text-text-secondary mb-1.5">{rotulo}</span>
        <div onKeyDown={setas} className={`grid ${colunas} gap-1 rounded-lg bg-surface-2 p-1`} role="radiogroup" aria-label={rotulo}>
          {modos.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={modo === m.id}
              tabIndex={modo === m.id ? 0 : -1}
              onClick={() => onModo(m.id)}
              className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-[--duracao-rapida] ${modo === m.id ? "bg-surface-1 text-text-primary shadow-elev-1" : "text-text-secondary hover:text-text-primary"}`}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="flex items-center gap-1 text-xs font-medium text-text-secondary mb-1.5">
          {atual.campo}
          {atual.dica && <InfoTooltip text={atual.dica} />}
        </span>
        <CampoNumero value={valor} onChange={onValor} min={0} casas={atual.casas ?? 2} />
      </label>
    </div>
  );
}

/** Os quatro modos do motor de preço, com rótulo curto e o termo fixo de margem/markup. */
export const MODOS_PRECO = [
  { id: "margem", rotulo: "Margem", campo: "Margem líquida (%)", dica: DICA_MARGEM },
  { id: "markup", rotulo: "Markup", campo: "Markup sobre o custo (%)", dica: DICA_MARKUP },
  { id: "lucro", rotulo: "Lucro (R$)", campo: "Lucro por venda (R$)" },
  { id: "preco", rotulo: "Preço fixo", campo: "Preço de venda (R$)" },
] as const satisfies readonly ModoOpcao<"margem" | "markup" | "lucro" | "preco">[];

/** Quadro pequeno de número (lucro, margem, markup), com a explicação do termo. */
export function Metrica({ rotulo, valor, classe = "text-text-primary", dica }: { rotulo: string; valor: string; classe?: string; dica?: string }) {
  return (
    // Rótulo numa linha só: os valores dos quadros lado a lado ficam na mesma altura.
    <div className="flex flex-col justify-between gap-0.5 rounded-md bg-surface-2 px-2.5 py-2 min-w-0">
      <dt className="flex items-center gap-1 text-xs text-text-tertiary min-w-0">
        <span className="truncate">{rotulo}</span>
        {dica && <span className="shrink-0"><InfoTooltip text={dica} /></span>}
      </dt>
      <dd className={`font-mono text-sm font-medium truncate ${classe}`}>{valor}</dd>
    </div>
  );
}

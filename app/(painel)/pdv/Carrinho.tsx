"use client";

import { useState } from "react";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClass } from "@/components/ui/Modal";
import { formatBRL } from "@/lib/format";
import type { ItemCarrinho } from "./tipos";
import { Chip } from "@/components/ui/Chip";
import { CotarFretePdv } from "./CotarFretePdv";

export type DescontoTipo = "valor" | "percentual";

export interface EstadoCarrinho {
  itens: ItemCarrinho[];
  descontoTipo: DescontoTipo;
  descontoEntrada: number;
  valorEntrega: number;
  observacao: string;
}

/** Desconto em reais, já resolvido a partir do tipo e travado no subtotal. */
export function calcularDesconto(estado: EstadoCarrinho, subtotal: number): number {
  const bruto =
    estado.descontoTipo === "percentual" ? (subtotal * estado.descontoEntrada) / 100 : estado.descontoEntrada;
  return Math.min(Math.max(bruto, 0), subtotal);
}

export function calcularSubtotal(itens: ItemCarrinho[]): number {
  return itens.reduce((acc, i) => acc + i.preco_unitario * i.quantidade, 0);
}

export function Carrinho({
  estado,
  onEstado,
  onAlterarQuantidade,
  onAlterarPreco,
  onAlterarGarantia,
  onRemover,
  onLimpar,
  onFinalizar,
  freteConectado = false,
  descontoAberto,
  onDescontoAberto,
}: {
  /** Desconto aberto controlado de fora (atalho F8). Sem isso, o estado é local. */
  descontoAberto?: boolean;
  onDescontoAberto?: (aberto: boolean) => void;
  /** Melhor Envio conectado (0055): mostra "Cotar" na entrega. */
  freteConectado?: boolean;
  estado: EstadoCarrinho;
  onEstado: (parcial: Partial<EstadoCarrinho>) => void;
  onAlterarQuantidade: (produtoId: string, quantidade: number) => void;
  onAlterarPreco: (produtoId: string, preco: number) => void;
  onAlterarGarantia: (produtoId: string, dias: number | null) => void;
  onRemover: (produtoId: string) => void;
  onLimpar: () => void;
  onFinalizar: () => void;
}) {
  const [descontoLocal, setDescontoLocal] = useState(false);
  const mostrarDesconto = descontoAberto ?? descontoLocal;
  const setMostrarDesconto = (f: (v: boolean) => boolean) => {
    const novo = f(mostrarDesconto);
    if (onDescontoAberto) onDescontoAberto(novo);
    else setDescontoLocal(novo);
  };
  const [mostrarEntrega, setMostrarEntrega] = useState(false);
  const [mostrarObservacao, setMostrarObservacao] = useState(false);

  const subtotal = calcularSubtotal(estado.itens);
  const desconto = calcularDesconto(estado, subtotal);
  const total = subtotal - desconto + estado.valorEntrega;
  const totalItens = estado.itens.reduce((acc, i) => acc + i.quantidade, 0);

  if (estado.itens.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState
          icon={ShoppingCart}
          title="Carrinho vazio"
          description="Toque num produto para começar a venda, ou use o leitor de código de barras."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <h3 className="text-sm font-semibold text-text-primary">Carrinho</h3>
        <span className="text-xs text-text-tertiary">
          {totalItens} {totalItens === 1 ? "item" : "itens"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 -mx-0.5 px-0.5 pb-1">
        {estado.itens.map((item) => {
          const excedeu = item.quantidade >= item.estoque_disponivel;
          return (
            <div key={item.produto_id} className="rounded-lg bg-surface-2 border border-border p-3">
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="min-w-0">
                  <div className="text-sm text-text-primary font-medium leading-snug">{item.nome}</div>
                  <div className="text-xs text-text-tertiary font-mono mt-0.5">{item.sku}</div>
                </div>
                <button
                  onClick={() => onRemover(item.produto_id)}
                  className="w-6 h-6 rounded-md text-text-tertiary hover:text-negative hover:bg-negative-soft flex items-center justify-center shrink-0 transition-colors"
                  aria-label={`Remover ${item.nome}`}
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-0.5 rounded-md border border-border bg-surface-1 p-0.5">
                  <button
                    onClick={() => onAlterarQuantidade(item.produto_id, item.quantidade - 1)}
                    className="w-7 h-7 rounded text-text-secondary hover:text-text-primary hover:bg-surface-3 flex items-center justify-center transition-colors"
                    aria-label="Diminuir quantidade"
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-8 text-center font-mono text-sm text-text-primary tabular-nums">{item.quantidade}</span>
                  <button
                    onClick={() => onAlterarQuantidade(item.produto_id, item.quantidade + 1)}
                    disabled={excedeu}
                    className="w-7 h-7 rounded text-text-secondary hover:text-text-primary hover:bg-surface-3 flex items-center justify-center transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed"
                    aria-label="Aumentar quantidade"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1 h-7 pl-2 pr-1.5 bg-surface-1 border border-border rounded-md focus-within:border-accent">
                    <span className="text-xs text-text-tertiary">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.preco_unitario}
                      onChange={(e) => onAlterarPreco(item.produto_id, Number(e.target.value) || 0)}
                      className="w-16 bg-transparent text-sm text-right font-mono text-text-primary outline-none"
                    />
                  </div>
                  <span className="w-20 text-right font-mono text-sm text-text-primary font-medium">
                    {formatBRL(item.preco_unitario * item.quantidade)}
                  </span>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs">
                {item.garantia_dias == null ? (
                  <button
                    type="button"
                    onClick={() => onAlterarGarantia(item.produto_id, 90)}
                    className="text-text-tertiary hover:text-accent"
                  >
                    + Garantia
                  </button>
                ) : (
                  <>
                    <span className="text-text-secondary">Garantia</span>
                    <input
                      type="number"
                      min="1"
                      max="3650"
                      value={item.garantia_dias}
                      onChange={(e) => {
                        const n = Math.floor(Number(e.target.value));
                        onAlterarGarantia(item.produto_id, n >= 1 ? Math.min(n, 3650) : 1);
                      }}
                      className="w-14 h-6 px-1.5 bg-surface-1 border border-border rounded-md text-right font-mono text-text-primary outline-none focus:border-accent"
                      aria-label="Garantia em dias"
                    />
                    <span className="text-text-tertiary">dias</span>
                    <button
                      type="button"
                      onClick={() => onAlterarGarantia(item.produto_id, null)}
                      className="text-text-tertiary hover:text-negative"
                      aria-label="Remover garantia"
                    >
                      <X size={12} />
                    </button>
                  </>
                )}
              </div>

              {excedeu && (
                <div className="text-xs text-negative mt-2 flex items-center gap-1">
                  Estoque disponível: {item.estoque_disponivel}. Não dá pra vender mais que isso.
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-3 mt-1 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <Chip onClick={() => setMostrarDesconto((v) => !v)} ativo={desconto > 0} titulo="Desconto (F8)">
            {desconto > 0 ? `Desconto: ${formatBRL(desconto)}` : "Dar desconto"}
          </Chip>
          <Chip onClick={() => setMostrarEntrega((v) => !v)} ativo={estado.valorEntrega > 0}>
            {estado.valorEntrega > 0 ? `Entrega: ${formatBRL(estado.valorEntrega)}` : "Entrega"}
          </Chip>
          <Chip onClick={() => setMostrarObservacao((v) => !v)} ativo={estado.observacao.trim() !== ""}>
            Observação
          </Chip>
          <button
            onClick={onLimpar}
            className="h-7 px-2.5 rounded-md text-xs border border-border text-negative hover:bg-negative-soft flex items-center gap-1 ml-auto transition-colors"
          >
            <Trash2 size={12} />
            Esvaziar
          </button>
        </div>

        {mostrarDesconto && (
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border overflow-hidden">
              {(["valor", "percentual"] as DescontoTipo[]).map((t) => (
                <button
                  key={t}
                  onClick={() => onEstado({ descontoTipo: t })}
                  className={`h-8 px-2.5 text-xs transition-colors ${
                    estado.descontoTipo === t ? "bg-accent-soft text-accent" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {t === "valor" ? "R$" : "%"}
                </button>
              ))}
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={estado.descontoEntrada || ""}
              onChange={(e) => onEstado({ descontoEntrada: Number(e.target.value) || 0 })}
              placeholder="0,00"
              data-pdv-desconto=""
              aria-label="Valor do desconto"
              className="flex-1 h-8 px-2 bg-surface-1 border border-border rounded-md text-sm text-right font-mono text-text-primary outline-none focus:border-accent"
            />
          </div>
        )}

        {mostrarEntrega && (
          <input
            type="number"
            step="0.01"
            min="0"
            value={estado.valorEntrega || ""}
            onChange={(e) => onEstado({ valorEntrega: Number(e.target.value) || 0 })}
            placeholder="Valor da entrega"
            className={inputClass}
          />
        )}
        {mostrarEntrega && freteConectado && <CotarFretePdv itens={estado.itens} subtotal={subtotal} onEscolher={(valor) => onEstado({ valorEntrega: valor })} />}

        {mostrarObservacao && (
          <textarea
            value={estado.observacao}
            onChange={(e) => onEstado({ observacao: e.target.value })}
            placeholder="Observação da venda"
            className={`${inputClass} h-16 py-2 resize-none`}
          />
        )}

        <div className="rounded-lg bg-surface-2 border border-border p-3 space-y-1 text-sm">
          <div className="flex justify-between text-text-secondary">
            <span>Subtotal</span>
            <span className="font-mono">{formatBRL(subtotal)}</span>
          </div>
          {desconto > 0 && (
            <div className="flex justify-between text-negative">
              <span>Desconto</span>
              <span className="font-mono">− {formatBRL(desconto)}</span>
            </div>
          )}
          {estado.valorEntrega > 0 && (
            <div className="flex justify-between text-text-secondary">
              <span>Entrega</span>
              <span className="font-mono">{formatBRL(estado.valorEntrega)}</span>
            </div>
          )}
          <div className="flex justify-between items-baseline text-text-primary font-semibold pt-1.5 mt-1 border-t border-border">
            <span className="text-sm">Total</span>
            <span className="font-mono text-xl">{formatBRL(total)}</span>
          </div>
        </div>

        <Button variant="primary" className="w-full h-11 text-base" onClick={onFinalizar} title="Cobrar (F4)" aria-keyshortcuts="F4">
          Finalizar Venda
        </Button>
      </div>
    </div>
  );
}

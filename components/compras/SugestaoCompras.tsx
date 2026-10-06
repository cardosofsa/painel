"use client";

import { useMemo, useState } from "react";
import { PackageCheck, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { campoBase } from "@/components/ui/Modal";
import { formatBRL } from "@/lib/format";
import type { LinhaSugestao } from "@/lib/compras";
import type { ItemPedidoInput } from "@/app/(painel)/compras/actions";

/**
 * Sugestão de Compras: o que está abaixo do mínimo ou acabando, já descontado o que foi
 * pedido e não chegou. Agrupa por fornecedor do cadastro e abre o pedido já preenchido.
 */
export function SugestaoCompras({
  linhas,
  fornecedores,
  onCriarPedido,
}: {
  linhas: LinhaSugestao[];
  fornecedores: { id: string; nome: string }[];
  onCriarPedido: (fornecedorId: string | null, itens: ItemPedidoInput[]) => void;
}) {
  const [qtd, setQtd] = useState<Record<string, number>>(() => Object.fromEntries(linhas.map((l) => [l.produto.id, l.sugerido])));
  const [fora, setFora] = useState<Set<string>>(new Set());
  const nomeFornecedor = useMemo(() => new Map(fornecedores.map((f) => [f.id, f.nome])), [fornecedores]);

  const grupos = useMemo(() => {
    const m = new Map<string, LinhaSugestao[]>();
    for (const l of linhas) {
      const chave = l.produto.fornecedor_id && nomeFornecedor.has(l.produto.fornecedor_id) ? l.produto.fornecedor_id : "";
      m.set(chave, [...(m.get(chave) ?? []), l]);
    }
    return [...m.entries()].sort(([a], [b]) => (a ? nomeFornecedor.get(a)! : "~").localeCompare(b ? nomeFornecedor.get(b)! : "~", "pt-BR"));
  }, [linhas, nomeFornecedor]);

  if (linhas.length === 0) {
    return (
      <Card>
        <EmptyState icon={PackageCheck} title="Nada para comprar agora" description="Nenhum produto abaixo do mínimo ou acabando antes de um pedido novo chegar, contando o que já foi pedido." />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Produtos abaixo do mínimo ou que acabam antes de um pedido novo chegar (prazo do fornecedor + 7 dias de folga), na previsão de venda das próximas semanas (as últimas 12 semanas de todos os canais, seguindo a tendência). A quantidade cobre o prazo + 30 dias. O que já está pedido e não chegou é descontado.
      </p>
      {grupos.map(([fornecedorId, itens]) => {
        const escolhidos = itens.filter((l) => !fora.has(l.produto.id) && (qtd[l.produto.id] ?? 0) > 0);
        const total = escolhidos.reduce((s, l) => s + (qtd[l.produto.id] ?? 0) * l.produto.custo, 0);
        return (
          <Card key={fornecedorId || "sem"} padding="nenhum" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
              <div>
                <div className="font-semibold text-text-primary">{fornecedorId ? nomeFornecedor.get(fornecedorId) : "Sem fornecedor no cadastro"}</div>
                <div className="text-xs text-text-tertiary">
                  {escolhidos.length} de {itens.length} itens · {formatBRL(total)}
                </div>
              </div>
              <Button
                variant="primary"
                disabled={escolhidos.length === 0}
                onClick={() =>
                  onCriarPedido(
                    fornecedorId || null,
                    escolhidos.map((l) => ({ produto_id: l.produto.id, produto_nome: l.produto.nome, quantidade: qtd[l.produto.id] ?? l.sugerido, custo_unitario: l.produto.custo })),
                  )
                }
              >
                Criar pedido
              </Button>
            </div>
            <div className="divide-y divide-border">
              {itens.map((l) => (
                <label key={l.produto.id} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 px-4 py-2.5 text-sm">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-accent"
                    checked={!fora.has(l.produto.id)}
                    onChange={() =>
                      setFora((f) => {
                        const n = new Set(f);
                        if (n.has(l.produto.id)) n.delete(l.produto.id);
                        else n.add(l.produto.id);
                        return n;
                      })
                    }
                  />
                  <div className="min-w-0">
                    <div className="text-text-primary truncate">{l.produto.nome}</div>
                    <div className="text-xs text-text-tertiary">
                      {l.motivo === "abaixo_minimo" ? "Abaixo do mínimo" : "Acabando"} · estoque {l.produto.estoque} / mín. {l.produto.estoque_minimo}
                      {l.emAberto > 0 && ` · ${l.emAberto} já pedidos`}
                    </div>
                    <div className="text-xs text-text-tertiary">
                      {l.porDia > 0 ? `vende ~${(l.porDia * 7).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}/semana${l.ritmo === "cadastro" ? " (do cadastro)" : ""}` : "sem vendas recentes"}
                      {l.tendencia === "subindo" && (
                        <span className="inline-flex items-center gap-0.5 text-positive font-medium" title="As vendas estão subindo nas últimas semanas: a previsão já conta com isso">
                          {" "}
                          <TrendingUp size={12} aria-hidden /> subindo
                        </span>
                      )}
                      {l.tendencia === "caindo" && (
                        <span className="inline-flex items-center gap-0.5 text-text-secondary" title="As vendas estão caindo nas últimas semanas: a previsão pede menos">
                          {" "}
                          <TrendingDown size={12} aria-hidden /> caindo
                        </span>
                      )}
                      {l.diasCobertura !== null && (
                        <span className={l.diasCobertura <= l.prazo ? "text-negative font-medium" : ""}>
                          {` · acaba em ${Math.max(0, Math.floor(l.diasCobertura))} dia(s)`}
                          {l.pedirAte ? ` · peça até ${new Date(`${l.pedirAte}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : ""}
                        </span>
                      )}
                      {` · entrega em ${l.prazo} dia(s)`}
                    </div>
                  </div>
                  <span className="text-xs text-text-tertiary font-mono hidden sm:inline">{formatBRL(l.produto.custo)}</span>
                  <input
                    type="number"
                    min={0}
                    aria-label={`Quantidade a comprar de ${l.produto.nome}`}
                    className={`${campoBase} w-20 text-right`}
                    value={qtd[l.produto.id] ?? 0}
                    onChange={(e) => setQtd((q) => ({ ...q, [l.produto.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                  />
                </label>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { PackageCheck } from "lucide-react";
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
        <EmptyState icon={PackageCheck} title="Nada para comprar agora" description="Nenhum produto abaixo do mínimo ou acabando nos próximos 14 dias, contando o que já foi pedido." />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        Produtos abaixo do mínimo ou que acabam em até 14 dias no ritmo de saída. O que já está pedido e não chegou é descontado.
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

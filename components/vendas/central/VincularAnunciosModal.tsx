"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { executarComToast } from "@/lib/acao-cliente";
import type { PedidoMarketplaceSalvo } from "@/lib/marketplace/pedidos-servidor";
import { vincularAnuncioPedidos } from "@/app/(painel)/vendas/central-actions";

interface Pendente {
  lojaId: string;
  loja: string;
  sku: string;
  nome: string;
  quantidade: number;
  pedidos: number;
}

/**
 * Anúncios da Shopee que entraram (pela API ou planilha) sem produto vinculado. Escolher o
 * produto grava o vínculo, recalcula o lucro desses pedidos e baixa o estoque que faltou.
 */
export function VincularAnunciosModal({
  pedidos,
  lojas,
  produtos,
  onClose,
}: {
  pedidos: PedidoMarketplaceSalvo[];
  lojas: { id: string; nome: string }[];
  produtos: { id: string; nome: string; sku: string | null }[];
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [escolha, setEscolha] = useState<Record<string, string>>({});
  const nomeLoja = new Map(lojas.map((l) => [l.id, l.nome]));
  const itensProduto = useMemo(() => produtos.map((p) => ({ id: p.id, rotulo: p.nome, detalhe: p.sku ?? undefined, busca: p.sku ?? "" })), [produtos]);

  const pendentes = useMemo(() => {
    const m = new Map<string, Pendente>();
    for (const p of pedidos) {
      if (p.status === "cancelado" || p.status === "devolvido") continue;
      for (const i of p.pedidos_marketplace_itens) {
        if (i.produto_id) continue;
        const sku = (i.sku || "").trim();
        if (!sku) continue;
        const k = `${p.loja_id}|${sku.toLowerCase()}`;
        const atual = m.get(k) ?? { lojaId: p.loja_id, loja: nomeLoja.get(p.loja_id) ?? "Loja", sku, nome: i.variacao ? `${i.nome} · ${i.variacao}` : i.nome, quantidade: 0, pedidos: 0 };
        atual.quantidade += i.quantidade;
        atual.pedidos += 1;
        m.set(k, atual);
      }
    }
    return [...m.entries()].sort((a, b) => b[1].quantidade - a[1].quantidade);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nomeLoja deriva de `lojas`
  }, [pedidos, lojas]);

  function vincular(chave: string, p: Pendente) {
    const produto = escolha[chave];
    if (!produto) return toast.error("Escolha o produto.");
    startTransition(async () => {
      const r = await executarComToast(vincularAnuncioPedidos(p.lojaId, p.sku, produto), { erro: "Erro ao vincular" });
      if (r.ok) {
        setFeitos((s) => new Set(s).add(chave));
        toast.success(`${p.sku} vinculado: ${r.dado.pedidos} pedido(s) recalculado(s)${r.dado.baixas ? `, ${r.dado.baixas} baixa(s) no estoque` : ""}.`);
      }
    });
  }

  const restantes = pendentes.filter(([k]) => !feitos.has(k));

  return (
    <Modal open onClose={onClose} title="Vincular anúncios a produtos" width="max-w-2xl">
      <p className="text-sm text-text-secondary mb-4">
        Estes anúncios chegaram com um SKU que não bate com nenhum produto. Sem vínculo, o pedido fica sem custo (lucro maior que o real) e sem baixa no estoque. O vínculo vale para os próximos pedidos também.
      </p>
      {restantes.length === 0 ? (
        <p className="text-sm text-positive text-center py-6">Tudo vinculado.</p>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {restantes.map(([k, p]) => (
            <div key={k} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center border border-border rounded-md p-2.5">
              <div className="min-w-0">
                <div className="text-sm text-text-primary truncate" title={p.nome}>
                  {p.nome}
                </div>
                <div className="text-[11px] text-text-tertiary truncate">
                  <span className="font-mono">{p.sku}</span> · {p.loja} · {p.quantidade} un. em {p.pedidos} pedido(s)
                </div>
              </div>
              <Combobox itens={itensProduto} valor={escolha[k] ?? null} onChange={(id) => setEscolha((e) => ({ ...e, [k]: id ?? "" }))} placeholder="Produto do SERTÃO…" />
              <Button size="sm" variant="primary" loading={pending} disabled={!escolha[k]} onClick={() => vincular(k, p)}>
                Vincular
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardEyebrow, HeroMetric } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { formatBRL, formatarDataHora } from "@/lib/format";
import { registrarMovimentacaoEstoque } from "./actions";
import { executarComToast } from "@/lib/acao-cliente";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";

export interface ProdutoEstoque {
  id: string;
  sku: string;
  nome: string;
  custo: number;
  estoque: number;
  estoque_minimo: number;
  armazem_id: string | null;
}

export interface Armazem {
  id: string;
  nome: string;
  endereco: string | null;
  lojas_abastecidas: string[];
}

export interface Movimentacao {
  produto_nome: string;
  tipo: "entrada" | "saida";
  quantidade: number;
  motivo: string | null;
  data_movimentacao: string;
}

export function EstoqueClient({
  produtos,
  armazens,
  movimentacoes,
}: {
  produtos: ProdutoEstoque[];
  armazens: Armazem[];
  movimentacoes: Movimentacao[];
}) {
  const [pending, startTransition] = useTransition();
  const [modalAberto, setModalAberto] = useState(false);
  const [movProdutoId, setMovProdutoId] = useState(produtos[0]?.id ?? "");
  const [movTipo, setMovTipo] = useState<"entrada" | "saida">("entrada");
  const [movQtd, setMovQtd] = useState(1);
  const [movMotivo, setMovMotivo] = useState("");
  const sujo = useFormularioSujo(
    { movProdutoId, movTipo, movQtd, movMotivo },
    { movProdutoId: produtos[0]?.id ?? "", movTipo: "entrada", movQtd: 1, movMotivo: "" },
  );

  const totalUnidades = produtos.reduce((acc, p) => acc + p.estoque, 0);
  const criticos = produtos.filter((p) => p.estoque <= p.estoque_minimo).length;
  const valorTotal = produtos.reduce((acc, p) => acc + p.estoque * p.custo, 0);

  function registrar() {
    if (!movProdutoId) {
      toast.error("Escolha o produto da movimentação.");
      return;
    }
    if (movQtd <= 0) {
      toast.error("A quantidade precisa ser maior que zero.");
      return;
    }
    startTransition(async () => {
      const r = await executarComToast(registrarMovimentacaoEstoque({ produtoId: movProdutoId, tipo: movTipo, quantidade: movQtd, motivo: movMotivo || (movTipo === "entrada" ? "Entrada manual" : "Saída manual") }), { erro: "Erro ao registrar movimentação" });
      if (r.ok) {
        setModalAberto(false);
        setMovQtd(1);
        setMovMotivo("");
        toast.success("Movimentação registrada");
      }
    });
  }

  return (
    <>
      <PageHeader
        title="Armazéns & Estoque"
        actions={<Button variant="primary" onClick={() => setModalAberto(true)}>Registrar Movimentação</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card>
          <CardEyebrow>Estoque Físico Total</CardEyebrow>
          <HeroMetric value={`${totalUnidades} un.`} accent />
        </Card>
        <Card>
          <CardEyebrow>Valor Total em Estoque</CardEyebrow>
          <HeroMetric value={formatBRL(valorTotal)} />
        </Card>
        <Card>
          <CardEyebrow>Reposição Necessária</CardEyebrow>
          <HeroMetric value={String(criticos)} caption="produtos no mínimo ou abaixo" />
        </Card>
        <Card>
          <CardEyebrow>Armazéns Ativos</CardEyebrow>
          <HeroMetric value={String(armazens.length)} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {armazens.map((a) => {
            const produtosDoArmazem = produtos.filter((p) => p.armazem_id === a.id);
            const unidades = produtosDoArmazem.reduce((acc, p) => acc + p.estoque, 0);
            return (
              <Card key={a.id} padding="nenhum" className="overflow-hidden">
                <div className="px-5 pt-5 pb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-text-primary">{a.nome}</h2>
                    <p className="text-sm text-text-secondary">{a.endereco}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {a.lojas_abastecidas.map((loja) => (
                        <span key={loja} className="text-xs bg-surface-2 text-text-secondary rounded-full px-2 py-0.5">
                          {loja}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-lg text-text-primary">{unidades} un.</div>
                    <div className="text-xs text-text-tertiary">{produtosDoArmazem.length} produtos</div>
                  </div>
                </div>
                <div className="divide-y divide-border border-t border-border">
                  {produtosDoArmazem.map((p) => {
                    const ok = p.estoque > p.estoque_minimo;
                    return (
                      <div key={p.id} className="flex items-center justify-between px-5 py-2.5 text-sm">
                        <div>
                          <div className="text-text-primary">{p.nome}</div>
                          <div className="text-xs text-text-tertiary font-mono">{p.sku}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-text-secondary">{p.estoque} un.</span>
                          <StatusChip label={ok ? "OK" : "Repor"} tone={ok ? "positive" : "negative"} />
                        </div>
                      </div>
                    );
                  })}
                  {produtosDoArmazem.length === 0 && (
                    <div className="px-5 py-4 text-sm text-text-tertiary">Nenhum produto neste armazém ainda.</div>
                  )}
                </div>
              </Card>
            );
          })}
          {armazens.length === 0 && (
            <Card>
              <p className="text-sm text-text-tertiary">
                Nenhum armazém cadastrado ainda. Adicione um em Configurações → Armazéns.
              </p>
            </Card>
          )}
        </div>

        <Card>
          <h2 className="text-base font-semibold text-text-primary mb-4">Histórico Recente</h2>
          <div className="space-y-4">
            {movimentacoes.slice(0, 8).map((m, i) => (
              <div key={i} className="flex items-start justify-between text-sm border-b border-border pb-3 last:border-0 last:pb-0">
                <div>
                  <div className="text-text-primary">{m.produto_nome}</div>
                  <div className="text-xs text-text-tertiary">{m.motivo}</div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className={`font-mono ${m.tipo === "entrada" ? "text-positive" : "text-negative"}`}>
                    {m.tipo === "entrada" ? "+" : "-"}
                    {m.quantidade} un
                  </div>
                  <div className="text-xs text-text-tertiary">{formatarDataHora(m.data_movimentacao)}</div>
                </div>
              </div>
            ))}
            {movimentacoes.length === 0 && <p className="text-sm text-text-tertiary">Nenhuma movimentação ainda.</p>}
          </div>
        </Card>
      </div>

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title="Registrar Movimentação" sujo={sujo}>
        <FormField label="Produto">
          <select className={inputClass} value={movProdutoId} onChange={(e) => setMovProdutoId(e.target.value)}>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Tipo">
            <select className={inputClass} value={movTipo} onChange={(e) => setMovTipo(e.target.value as "entrada" | "saida")}>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </FormField>
          <FormField label="Quantidade">
            <input
              type="number"
              min={1}
              className={inputClass}
              value={movQtd}
              onChange={(e) => setMovQtd(Number(e.target.value) || 0)}
            />
          </FormField>
        </div>
        <FormField label="Motivo">
          <input className={inputClass} value={movMotivo} onChange={(e) => setMovMotivo(e.target.value)} placeholder="Ex: ajuste, venda, avaria" />
        </FormField>

        <div className="flex gap-2 mt-5">
          <Button variant="secondary" className="flex-1" onClick={() => setModalAberto(false)} disabled={pending}>
            Cancelar
          </Button>
          {/* `loading` também desabilita (ver Button.tsx): sem isso, dois cliques rápidos
              gravavam duas movimentações e o estoque saía dobrado. */}
          <Button variant="primary" className="flex-1" onClick={registrar} loading={pending}>
            Registrar
          </Button>
        </div>
      </Modal>
    </>
  );
}

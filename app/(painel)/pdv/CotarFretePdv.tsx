"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import type { Cotacao } from "@/lib/frete/tipos";
import { cotarFretePdv } from "@/app/(painel)/vendas/frete-actions";
import type { ItemCarrinho } from "./tipos";

/** PDV com entrega: cota pelo Melhor Envio e põe o valor escolhido como entrega. */
export function CotarFretePdv({ itens, subtotal, onEscolher }: { itens: ItemCarrinho[]; subtotal: number; onEscolher: (valor: number) => void }) {
  const [pending, startTransition] = useTransition();
  const [cep, setCep] = useState("");
  const [opcoes, setOpcoes] = useState<(Cotacao & { gratis: boolean })[] | null>(null);

  function cotar() {
    startTransition(async () => {
      const r = await executarComToast(
        cotarFretePdv(
          cep,
          itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
          subtotal,
        ),
        { erro: "Erro ao cotar o frete" },
      );
      if (!r.ok) return;
      setOpcoes(r.dado.opcoes);
      if (r.dado.semMedida.length) toast.warning(`Sem peso/medidas: ${r.dado.semMedida.slice(0, 3).join(", ")}. Usei uma caixinha padrão.`);
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <input className={`${inputClass} flex-1`} inputMode="numeric" value={cep} onChange={(e) => (setCep(e.target.value), setOpcoes(null))} placeholder="CEP do cliente" aria-label="CEP para cotar o frete" />
        <Button size="sm" variant="secondary" loading={pending} onClick={cotar} disabled={cep.replace(/\D/g, "").length !== 8 || !itens.length}>
          Cotar
        </Button>
      </div>
      {opcoes?.length === 0 && <p className="text-xs text-text-tertiary">Nenhum serviço atende este CEP.</p>}
      {opcoes?.map((o) => (
        <button
          key={o.servicoId}
          type="button"
          onClick={() => onEscolher(o.valor)}
          className="w-full flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-xs hover:bg-surface-2"
        >
          <span className="text-text-primary">
            {o.transportadora} {o.servico}
            {o.prazoDias ? <span className="text-text-tertiary"> · {o.prazoDias}d</span> : null}
          </span>
          <span className="font-mono">{o.gratis ? "Grátis" : formatBRL(o.valor)}</span>
        </button>
      ))}
    </div>
  );
}

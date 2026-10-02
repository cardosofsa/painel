"use client";

import { useState } from "react";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import type { ItemCarrinhoVitrine } from "@/lib/vitrine-pedido";

/** Opção devolvida por /api/vitrine/frete (assinada pelo servidor; volta igual no pedido). */
export interface OpcaoFrete {
  slug: string;
  cep: string;
  servicoId: number;
  servico: string;
  valor: number;
  prazoDias: number | null;
  gratis: boolean;
  expira: number;
  assinatura: string;
}

/**
 * Frete no checkout da vitrine (0055): com o CEP completo, cota pelo Melhor Envio da loja
 * e o cliente escolhe. Loja sem frete configurado: o bloco simplesmente não aparece.
 */
export function FreteVitrine({
  slug,
  cep,
  itens,
  subtotal,
  escolhido,
  onEscolher,
}: {
  slug: string;
  cep: string | null;
  itens: ItemCarrinhoVitrine[];
  subtotal: number;
  escolhido: OpcaoFrete | null;
  onEscolher: (o: OpcaoFrete | null) => void;
}) {
  const [estado, setEstado] = useState<{ cep: string; opcoes: OpcaoFrete[]; erro: string | null; ativo: boolean } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const digitos = (cep ?? "").replace(/\D/g, "");
  if (digitos.length !== 8 || (estado && !estado.ativo)) return null;
  const atual = estado?.cep === digitos ? estado : null;

  async function calcular() {
    setCarregando(true);
    onEscolher(null);
    try {
      const r = await fetch("/api/vitrine/frete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, cep: digitos, subtotal, itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })) }),
      });
      const j = (await r.json().catch(() => ({}))) as { ativo?: boolean; opcoes?: OpcaoFrete[]; erro?: string };
      setEstado({ cep: digitos, ativo: !!j.ativo, opcoes: j.opcoes ?? [], erro: j.erro ?? (r.ok ? null : "Não foi possível calcular o frete.") });
      if (j.opcoes?.length) onEscolher(j.opcoes[0]);
    } catch {
      setEstado({ cep: digitos, ativo: true, opcoes: [], erro: "Sem conexão para calcular o frete." });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
          <Truck size={15} className="text-accent" /> Frete
        </span>
        {!atual && (
          <Button size="sm" variant="secondary" loading={carregando} onClick={calcular}>
            Calcular frete
          </Button>
        )}
      </div>
      {atual?.erro && <p className="text-xs text-text-tertiary mt-2">{atual.erro}</p>}
      {atual && !atual.erro && atual.opcoes.length === 0 && <p className="text-xs text-text-tertiary mt-2">Nenhuma entrega disponível para este CEP. Combine com a loja.</p>}
      {atual && atual.opcoes.length > 0 && (
        <div className="mt-2 space-y-1.5" role="radiogroup" aria-label="Opções de frete">
          {atual.opcoes.map((o) => (
            <button
              key={o.servicoId}
              type="button"
              role="radio"
              aria-checked={escolhido?.servicoId === o.servicoId}
              onClick={() => onEscolher(o)}
              className={`w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm ${escolhido?.servicoId === o.servicoId ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
            >
              <span className="text-text-primary">
                {o.servico}
                {o.prazoDias ? <span className="text-text-tertiary"> · {o.prazoDias} dia(s) úteis</span> : null}
              </span>
              <span className="font-mono font-medium text-text-primary">{o.gratis ? "Grátis" : formatBRL(o.valor)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

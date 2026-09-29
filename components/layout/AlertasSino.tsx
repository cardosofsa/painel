"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, ShoppingCart, Check } from "lucide-react";
import { executarComToast } from "@/lib/acao-cliente";
import { marcarAlertaLido, marcarTodosAlertasLidos } from "@/app/(painel)/alertas-actions";

export interface AlertaSino {
  id: string;
  mensagem: string;
  produto_id: string | null;
  criado_em: string;
}

/**
 * Sino da barra do topo: alertas pendentes de estoque mínimo. Cada um tem duas saídas —
 * marcar como lido (ignora) ou abrir um pedido de compra já com o produto preenchido.
 */
export function AlertasSino({ alertas }: { alertas: AlertaSino[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  function lido(id: string) {
    startTransition(async () => {
      await executarComToast(marcarAlertaLido(id), { erro: "Erro ao marcar o alerta" });
    });
  }

  function todosLidos() {
    startTransition(async () => {
      await executarComToast(marcarTodosAlertasLidos(), { erro: "Erro ao marcar os alertas" });
    });
  }

  function criarPedido(a: AlertaSino) {
    if (!a.produto_id) return;
    setAberto(false);
    startTransition(async () => {
      // Foi tratado: sai do sino. Quando a compra chegar, o estoque sobe e o gatilho do
      // banco resolve o alerta de vez.
      await marcarAlertaLido(a.id);
      router.push(`/compras?novo=${a.produto_id}`);
    });
  }

  const total = alertas.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label={total > 0 ? `${total} alerta(s) de estoque` : "Sem alertas"}
        className="relative w-8 h-8 rounded-md flex items-center justify-center text-text-secondary hover:bg-surface-2 hover:text-text-primary"
      >
        <Bell size={16} />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-negative text-white text-[10px] font-semibold flex items-center justify-center tabular">
            {total > 9 ? "9+" : total}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] bg-surface-1 border border-border rounded-md shadow-elev-2 text-sm z-30">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="font-medium text-text-primary">Alertas</span>
            {total > 1 && (
              <button onClick={todosLidos} disabled={pending} className="text-xs text-accent hover:underline disabled:opacity-50">
                Marcar todos como lidos
              </button>
            )}
          </div>
          {total === 0 ? (
            <p className="px-3 py-6 text-center text-text-tertiary">Nenhum alerta por enquanto.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-border">
              {alertas.map((a) => (
                <li key={a.id} className="px-3 py-2.5">
                  <p className="text-text-primary leading-snug">{a.mensagem}</p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => criarPedido(a)}
                      disabled={pending || !a.produto_id}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-accent text-accent-on text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
                    >
                      <ShoppingCart size={12} />
                      Adicionar pedido de compra
                    </button>
                    <button
                      onClick={() => lido(a.id)}
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs text-text-secondary hover:bg-surface-2 disabled:opacity-50"
                    >
                      <Check size={12} />
                      Marcar como lido
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

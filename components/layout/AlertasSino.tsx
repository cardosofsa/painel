"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ShoppingCart, Check, ArrowRight, Package, MessageCircle, Send } from "lucide-react";
import { IconeMarca } from "@/components/ui/IconeMarca";
import { executarComToast } from "@/lib/acao-cliente";
import { marcarAlertaLido, marcarTodosAlertasLidos } from "@/app/(painel)/alertas-actions";
import { marcarMensagemEnviada } from "@/app/(painel)/vixe/mensagens/actions";
import { linkWhatsapp, ROTULO_ASSUNTO, type MensagemPendente } from "@/lib/whatsapp";

export interface AlertaSino {
  id: string;
  mensagem: string;
  produto_id: string | null;
  criado_em: string;
  /** 0050: estoque_minimo (padrão), pedido_catalogo ou pedido_marketplace. */
  tipo?: string;
  link?: string | null;
  canal?: string | null;
}

/**
 * Sino da barra do topo: pedidos novos (catálogo, Shopee) e estoque mínimo. Pedido leva ao
 * pedido em Vendas; estoque abre um pedido de compra com o produto preenchido. Os dois
 * podem ser só marcados como lidos.
 *
 * Também cada aviso de WhatsApp de Vixe → Mensagens vira uma notificação: enviar ou pular
 * grava em `mensagens_enviadas` (0061) e ele sai daqui e de lá.
 */
export function AlertasSino({ alertas, mensagens = [], verVixe = false }: { alertas: AlertaSino[]; mensagens?: MensagemPendente[]; verVixe?: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  // Some na hora; a revalidação do layout confirma em seguida.
  const [feitas, setFeitas] = useState<Set<string>>(new Set());
  const whatsapp = mensagens.filter((m) => !feitas.has(m.chave));

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

  function concluirMensagem(chave: string) {
    setFeitas((s) => new Set(s).add(chave));
    startTransition(async () => {
      const r = await executarComToast(marcarMensagemEnviada(chave), { erro: "Erro ao registrar a mensagem" });
      // Não ficou registrada: volta para o sino, senão reapareceria só no próximo carregamento.
      if (!r.ok)
        setFeitas((s) => {
          const n = new Set(s);
          n.delete(chave);
          return n;
        });
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

  function abrirPedido(a: AlertaSino) {
    setAberto(false);
    startTransition(async () => {
      await marcarAlertaLido(a.id);
      router.push(a.link || "/vendas");
    });
  }

  const total = alertas.length + whatsapp.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label={total > 0 ? `${total} aviso(s)` : "Sem avisos"}
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
            <span className="font-medium text-text-primary">Avisos</span>
            {alertas.length > 1 && (
              <button onClick={todosLidos} disabled={pending} className="text-xs text-accent hover:underline disabled:opacity-50">
                Marcar todos como lidos
              </button>
            )}
          </div>
          {total === 0 ? (
            <p className="px-3 py-6 text-center text-text-tertiary">Nenhum aviso por enquanto.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y divide-border">
              {alertas.map((a) => {
                const pedido = a.tipo === "pedido_catalogo" || a.tipo === "pedido_marketplace";
                return (
                <li key={a.id} className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    {pedido ? (
                      <IconeMarca nome={a.canal} tamanho={18} className="mt-0.5" fallback={<Package size={16} className="text-accent shrink-0 mt-0.5" />} />
                    ) : (
                      <ShoppingCart size={15} className="text-negative shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-text-primary leading-snug">{a.mensagem}</p>
                      <p className="text-[11px] text-text-tertiary mt-0.5">{new Date(a.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {pedido ? (
                      <button
                        onClick={() => abrirPedido(a)}
                        disabled={pending}
                        className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-accent text-accent-on text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
                      >
                        <ArrowRight size={12} />
                        Abrir pedido
                      </button>
                    ) : (
                    <button
                      onClick={() => criarPedido(a)}
                      disabled={pending || !a.produto_id}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-accent text-accent-on text-xs font-medium hover:bg-accent-hover disabled:opacity-50"
                    >
                      <ShoppingCart size={12} />
                      Adicionar pedido de compra
                    </button>
                    )}
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
                );
              })}
              {whatsapp.map((m) => (
                <li key={m.chave} className="px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <MessageCircle size={15} className="text-positive shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-text-primary leading-snug">
                        {ROTULO_ASSUNTO[m.assunto]}: {m.cliente || "Cliente"} <span className="font-mono text-xs text-text-tertiary">{m.referencia}</span>
                      </p>
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{m.texto}</p>
                      <p className="text-[11px] text-text-tertiary mt-0.5">{new Date(m.quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <a
                      href={linkWhatsapp(m.whatsapp, m.texto)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => concluirMensagem(m.chave)}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-accent text-accent-on text-xs font-medium hover:bg-accent-hover"
                    >
                      <Send size={12} />
                      Enviar no WhatsApp
                    </a>
                    <button
                      onClick={() => concluirMensagem(m.chave)}
                      disabled={pending}
                      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border text-xs text-text-secondary hover:bg-surface-2 disabled:opacity-50"
                    >
                      Pular
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {/* Estoque, margem, preço, contas e crediário: a lista completa mora na Vixe. */}
          {verVixe && (
            <Link href="/vixe" onClick={() => setAberto(false)} className="block border-t border-border px-3 py-2 text-center text-xs text-accent hover:bg-surface-2">
              Ver todos os alertas na Vixe ›
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

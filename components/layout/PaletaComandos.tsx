"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Boxes, Receipt, Search, ShoppingCart, User, Package } from "lucide-react";
import { NAV_ITEMS } from "./navigation";
import { ATALHOS_EXTRAS, filtrarAtalhos, type AtalhoTela } from "@/lib/busca";
import { buscarGlobal, type ResultadoBusca } from "@/app/(painel)/busca-actions";

const ICONE: Record<ResultadoBusca["tipo"], typeof Package> = {
  produto: Package,
  cliente: User,
  venda: Receipt,
  pedido: Boxes,
  compra: ShoppingCart,
};

type Item = { chave: string; rotulo: string; detalhe?: string; href: string; tipo: "tela" | ResultadoBusca["tipo"] };

/**
 * Busca global: Ctrl+K (⌘K no Mac) ou o botão do topo. Acha telas (do menu e seções como
 * "Resultado do mês") e, a partir de 2 letras, produtos, clientes, vendas, pedidos e
 * compras. Só mostra o que as abas liberadas permitem.
 */
export function PaletaComandos({ abas }: { abas: string[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const pedidoRef = useRef(0);

  const telas: AtalhoTela[] = useMemo(
    () => [
      ...NAV_ITEMS.filter((n) => abas.includes(n.id)).map((n) => ({ rotulo: n.label, href: n.href, aba: n.id })),
      ...ATALHOS_EXTRAS.filter((a) => abas.includes(a.aba)),
    ],
    [abas],
  );

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberto((v) => !v);
      }
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  // Busca no servidor com uma pausa curta (não a cada letra).
  useEffect(() => {
    if (!aberto || q.trim().length < 2) return;
    const id = ++pedidoRef.current;
    const t = setTimeout(() => {
      setBuscando(true);
      buscarGlobal(q)
        .then((r) => {
          if (id === pedidoRef.current) setResultados(r.ok ? r.dado : []);
        })
        .finally(() => {
          if (id === pedidoRef.current) setBuscando(false);
        });
    }, 250);
    return () => clearTimeout(t);
  }, [q, aberto]);

  const itens: Item[] = useMemo(() => {
    const ts = filtrarAtalhos(telas, q)
      .slice(0, q ? 6 : 8)
      .map((t) => ({ chave: `tela:${t.href}`, rotulo: t.rotulo, href: t.href, tipo: "tela" as const }));
    const rs = q.trim().length >= 2 ? resultados.map((r) => ({ chave: `${r.tipo}:${r.href}:${r.titulo}`, rotulo: r.titulo, detalhe: r.detalhe, href: r.href, tipo: r.tipo })) : [];
    return [...ts, ...rs];
  }, [telas, q, resultados]);

  function abrir() {
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
    setQ("");
    setResultados([]);
    setAtivo(0);
  }

  function ir(item: Item | undefined) {
    if (!item) return;
    fechar();
    router.push(item.href);
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((a) => Math.min(itens.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      ir(itens[ativo]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      fechar();
    }
  }

  if (abas.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-label="Buscar (Ctrl+K)"
        title="Buscar (Ctrl+K)"
        className="inline-flex items-center gap-2 h-8 rounded-md border border-border px-2 sm:px-2.5 text-sm text-text-tertiary hover:bg-surface-2 hover:text-text-secondary"
      >
        <Search size={14} />
        <span className="hidden lg:inline">Buscar</span>
        <kbd className="hidden lg:inline rounded border border-border px-1 text-[10px] font-mono">Ctrl K</kbd>
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
          <div role="dialog" aria-modal="true" aria-label="Buscar" className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-surface-1 shadow-elev-3">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search size={16} className="text-text-tertiary shrink-0" />
              <input
                ref={inputRef}
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setAtivo(0);
                  if (e.target.value.trim().length < 2) setResultados([]);
                }}
                onKeyDown={teclado}
                placeholder="Tela, produto, cliente, nº da venda ou do pedido…"
                aria-label="O que você procura"
                aria-controls="paleta-resultados"
                className="h-12 w-full bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
              {buscando && <span className="text-xs text-text-tertiary shrink-0">buscando…</span>}
            </div>
            <ul id="paleta-resultados" role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
              {itens.length === 0 && <li className="px-4 py-6 text-center text-sm text-text-tertiary">{q.trim().length >= 2 && !buscando ? "Nada encontrado." : "Digite para buscar."}</li>}
              {itens.map((it, i) => {
                const Icone = it.tipo === "tela" ? ArrowRight : ICONE[it.tipo];
                return (
                  <li key={it.chave} role="option" aria-selected={i === ativo}>
                    <button
                      type="button"
                      onMouseEnter={() => setAtivo(i)}
                      onClick={() => ir(it)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${i === ativo ? "bg-accent-soft text-text-primary" : "text-text-secondary"}`}
                    >
                      <Icone size={15} className={i === ativo ? "text-accent shrink-0" : "text-text-tertiary shrink-0"} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-text-primary">{it.rotulo}</span>
                        {it.detalhe && <span className="block truncate text-xs text-text-tertiary">{it.detalhe}</span>}
                      </span>
                      {it.tipo === "tela" && <span className="text-[11px] text-text-tertiary shrink-0">tela</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-border px-4 py-2 text-[11px] text-text-tertiary">↑ ↓ para escolher · Enter abre · Esc fecha</div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import { ehErroDeRede, guardarVendaOffline, removerVendaOffline, reservadoOffline, vendasOffline, type VendaOffline } from "@/lib/pdv-offline";
import { registrarVendaOffline, type VendaInput } from "./actions";

/**
 * PDV sem internet (11.4): registra o service worker, guarda a venda no aparelho quando não
 * há conexão e envia sozinho quando ela volta (uma venda por chave, com a hora real).
 */
function assinarConexao(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

export function useFilaOffline(userId: string | null) {
  const online = useSyncExternalStore(assinarConexao, () => navigator.onLine, () => true);
  const [fila, setFila] = useState<VendaOffline[]>([]);
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);

  const recarregar = useCallback(async () => {
    if (!userId) return;
    const lista = await vendasOffline(userId);
    setFila(lista);
  }, [userId]);

  const sincronizar = useCallback(async () => {
    if (!userId || enviandoRef.current || !navigator.onLine) return;
    const pendentes = await vendasOffline(userId);
    if (!pendentes.length) return;
    enviandoRef.current = true;
    setEnviando(true);
    let ok = 0;
    for (const v of pendentes) {
      try {
        const r = await registrarVendaOffline(v.chave, v.feitaEm, v.dados as unknown as VendaInput);
        if (r.ok) {
          await removerVendaOffline(v.chave);
          ok++;
        } else {
          // Regra de negócio (sem estoque, fiado acima do limite): fica para você resolver.
          await guardarVendaOffline({ ...v, erro: r.erro });
        }
      } catch (e) {
        if (ehErroDeRede(e)) break;
        await guardarVendaOffline({ ...v, erro: e instanceof Error ? e.message : "Erro ao enviar" });
      }
    }
    enviandoRef.current = false;
    setEnviando(false);
    await recarregar();
    if (ok) toast.success(`${ok} venda(s) feita(s) sem internet foram enviadas.`);
  }, [userId, recarregar]);

  useEffect(() => {
    // Service worker só onde o navegador tem (e fora do modo dev, que recompila tudo).
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then(async (reg) => {
          await navigator.serviceWorker.ready;
          // Guarda os arquivos que esta página já carregou (antes do SW existir).
          const urls = [location.href, ...performance.getEntriesByType("resource").map((r) => r.name)].filter((u) => u.includes("/_next/static/") || u.endsWith("/pdv"));
          (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ tipo: "guardar", urls: [...new Set([...urls, `${location.origin}/pdv`])] });
        })
        .catch(() => undefined);
    }
    // Lê a fila guardada e tenta enviar (fora do render, num timer).
    const t = setTimeout(() => void recarregar().then(() => sincronizar()), 0);
    // Internet voltou: envia o que ficou guardado.
    const voltou = () => void sincronizar();
    window.addEventListener("online", voltou);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", voltou);
    };
  }, [recarregar, sincronizar]);

  async function enfileirar(dados: VendaInput, resumo: VendaOffline["resumo"]): Promise<boolean> {
    if (!userId) return false;
    try {
      await guardarVendaOffline({ chave: crypto.randomUUID(), userId, feitaEm: new Date().toISOString(), dados: dados as unknown as Record<string, unknown>, resumo, erro: null });
      await recarregar();
      return true;
    } catch {
      return false;
    }
  }

  async function descartar(chave: string) {
    await removerVendaOffline(chave);
    await recarregar();
  }

  const barra =
    !online || fila.length > 0 ? (
      <div className={`mb-4 rounded-md border px-3 py-2 text-sm ${online ? "border-border bg-surface-1" : "border-negative/40 bg-negative-soft"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-2 ${online ? "text-text-secondary" : "text-negative"}`}>
            <CloudOff size={15} />
            {online ? `${fila.length} venda(s) feita(s) sem internet aguardando envio.` : "Sem internet: as vendas ficam guardadas neste aparelho e sobem sozinhas quando a conexão voltar."}
          </span>
          {online && fila.length > 0 && (
            <Button size="sm" variant="secondary" loading={enviando} onClick={() => void sincronizar()}>
              <RefreshCw size={13} /> Enviar agora
            </Button>
          )}
        </div>
        {fila.some((v) => v.erro) && (
          <ul className="mt-2 space-y-1">
            {fila
              .filter((v) => v.erro)
              .map((v) => (
                <li key={v.chave} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-negative">
                    {new Date(v.feitaEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {formatBRL(v.resumo.total)}: {v.erro}
                  </span>
                  <button type="button" className="text-text-tertiary hover:text-negative" onClick={() => void descartar(v.chave)}>
                    descartar
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    ) : null;

  return { online, fila, reservado: reservadoOffline(fila), enfileirar, barra };
}

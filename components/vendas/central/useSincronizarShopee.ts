"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Resultado } from "@/lib/acao";
import type { ConexaoResumo } from "@/lib/marketplace/pedidos-servidor";
import type { ResumoSincronizacao } from "@/lib/marketplace/sincronizar-todas";

/**
 * Chama `/api/marketplace/sincronizar` por `fetch`. Não é Server Action nem `startTransition`
 * de propósito: os dois prendem a navegação do Next até a sincronização terminar, e a pessoa
 * ficava sem conseguir trocar de tela.
 */
async function sincronizarPelaApi(): Promise<Resultado<ResumoSincronizacao>> {
  try {
    const r = await fetch("/api/marketplace/sincronizar", { method: "POST", cache: "no-store" });
    const corpo = (await r.json().catch(() => null)) as Resultado<ResumoSincronizacao> | null;
    return corpo ?? { ok: false, erro: "A sincronização não respondeu. Tente de novo." };
  } catch {
    return { ok: false, erro: "Sem conexão com o servidor. Tente de novo." };
  }
}

/** Botão "Sincronizar pedidos", sincronização automática ao abrir Vendas e avisos da conexão. */
export function useSincronizarShopee({ conexoes, avisoShopee }: { /** Só as conexões de plataformas com API ligada. */ conexoes: ConexaoResumo[]; avisoShopee: string | null }) {
  const [sincronizando, setSincronizando] = useState(false);
  // Sincroniza sozinho ao abrir Vendas se alguma loja conectada está há mais de 10 min sem
  // sincronizar (o agendador de 15 min cobre o resto). Em segundo plano, sem travar a tela.
  const router = useRouter();
  const [sincronizandoSozinho, setSincronizandoSozinho] = useState(false);
  const jaTentou = useRef(false);
  useEffect(() => {
    if (jaTentou.current || conexoes.length === 0) return;
    const limite = Date.now() - 10 * 60_000;
    const velha = conexoes.some((c) => !c.ultima_sincronizacao || new Date(c.ultima_sincronizacao).getTime() < limite);
    if (!velha) return;
    jaTentou.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marca o início de uma tarefa externa (fetch), não deriva estado
    setSincronizandoSozinho(true);
    sincronizarPelaApi().then((r) => {
      setSincronizandoSozinho(false);
      if (r.ok && r.dado.novos > 0) toast.success(`${r.dado.novos} pedido(s) novo(s) dos marketplaces.`);
      if (r.ok) router.refresh();
    });
  }, [conexoes, router]);

  useEffect(() => {
    if (avisoShopee === "conectada") toast.success("Loja conectada à Shopee.");
    else if (avisoShopee === "erro") toast.error("Não foi possível conectar a loja à Shopee.");
    else if (avisoShopee === "desligada") toast.error("A API da Shopee não está ligada neste servidor.");
  }, [avisoShopee]);

  async function sincronizar() {
    if (sincronizando) return;
    setSincronizando(true);
    const r = await sincronizarPelaApi();
    setSincronizando(false);
    if (!r.ok) {
      toast.error(r.erro);
      return;
    }
    const d = r.dado;
    toast.success(`${d.lojas} loja(s): ${d.pedidos} pedido(s) lido(s), ${d.novos} novo(s).`);
    if (d.erros.length) toast.error(d.erros.join(" · "));
    router.refresh();
  }

  return { sincronizar, sincronizandoSozinho, sincronizando };
}

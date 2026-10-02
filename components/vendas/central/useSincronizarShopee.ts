"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { executarComToast } from "@/lib/acao-cliente";
import type { ConexaoResumo } from "@/lib/marketplace/pedidos-servidor";
import { sincronizarTodasShopee } from "@/app/(painel)/vendas/central-actions";

/** Botão "Sincronizar pedidos", sincronização automática ao abrir Vendas e avisos da conexão. */
export function useSincronizarShopee({ faltandoShopee, conexoes, avisoShopee }: { faltandoShopee: string[]; conexoes: ConexaoResumo[]; avisoShopee: string | null }) {
  const [sincronizando, startTransition] = useTransition();
  // Sincroniza sozinho ao abrir Vendas se alguma loja conectada está há mais de 10 min sem
  // sincronizar (o agendador de 15 min cobre o resto). Em segundo plano, sem travar a tela.
  const router = useRouter();
  const [sincronizandoSozinho, iniciarAuto] = useTransition();
  const jaTentou = useRef(false);
  useEffect(() => {
    if (jaTentou.current || faltandoShopee.length > 0 || conexoes.length === 0) return;
    const limite = Date.now() - 10 * 60_000;
    const velha = conexoes.some((c) => !c.ultima_sincronizacao || new Date(c.ultima_sincronizacao).getTime() < limite);
    if (!velha) return;
    jaTentou.current = true;
    iniciarAuto(async () => {
      const r = await sincronizarTodasShopee().catch(() => null);
      if (r?.ok && r.dado.novos > 0) toast.success(`${r.dado.novos} pedido(s) novo(s) da Shopee.`);
      if (r?.ok) router.refresh();
    });
  }, [faltandoShopee.length, conexoes, router]);

  useEffect(() => {
    if (avisoShopee === "conectada") toast.success("Loja conectada à Shopee.");
    else if (avisoShopee === "erro") toast.error("Não foi possível conectar a loja à Shopee.");
    else if (avisoShopee === "desligada") toast.error("A API da Shopee não está ligada neste servidor.");
  }, [avisoShopee]);

  function sincronizar() {
    startTransition(async () => {
      const r = await executarComToast(sincronizarTodasShopee(), { erro: "Erro ao sincronizar" });
      if (r.ok) {
        const d = r.dado;
        toast.success(`${d.lojas} loja(s): ${d.pedidos} pedido(s) lido(s), ${d.novos} novo(s).`);
        if (d.erros.length) toast.error(d.erros.join(" · "));
      }
    });
  }

  return { sincronizar, sincronizandoSozinho, sincronizando };
}

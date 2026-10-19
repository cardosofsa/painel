"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { destinoBloqueavel } from "@/lib/saida";

/**
 * Protege o trabalho não salvo de uma tela.
 *
 * - Fechar a aba ou recarregar: `beforeunload`. O navegador só deixa mostrar o aviso padrão
 *   dele, sem botões próprios; por isso as telas que usam isto também salvam sozinhas.
 * - Clique em link do sistema (menu, breadcrumb): escuta na fase de CAPTURA da janela, antes
 *   do React e do `<Link>`, segura o clique e abre o modal.
 * - Botão Voltar: empilha uma entrada "sentinela" (cópia do estado atual do histórico, então o
 *   roteador do Next a reconhece) e, no `popstate`, devolve a sentinela e abre o modal.
 *
 * Devolve o estado do modal para a tela desenhar `<ModalSaida>`.
 */
export function useProtegerSaida({ sujo, salvarRascunho }: { sujo: boolean; salvarRascunho?: () => Promise<boolean> }) {
  const router = useRouter();
  const [destino, setDestino] = useState<string | "voltar" | null>(null);
  const [salvando, setSalvando] = useState(false);
  const sujoRef = useRef(sujo);
  const liberado = useRef(false);
  const sentinela = useRef(false);

  useEffect(() => {
    sujoRef.current = sujo;
    if (sujo && !sentinela.current) {
      window.history.pushState(window.history.state, "", window.location.href);
      sentinela.current = true;
    }
  }, [sujo]);

  useEffect(() => {
    function antesDeSair(e: BeforeUnloadEvent) {
      if (!sujoRef.current || liberado.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    function clique(e: MouseEvent) {
      if (!sujoRef.current || liberado.current) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a) return;
      const alvo = destinoBloqueavel(
        { href: a.getAttribute("href"), target: a.getAttribute("target"), download: a.hasAttribute("download"), botao: e.button, modificador: e.metaKey || e.ctrlKey || e.shiftKey || e.altKey },
        window.location,
      );
      if (!alvo) return;
      e.preventDefault();
      e.stopPropagation();
      setDestino(alvo);
    }
    function voltar() {
      if (!sujoRef.current || liberado.current) return;
      window.history.pushState(window.history.state, "", window.location.href);
      setDestino("voltar");
    }
    window.addEventListener("beforeunload", antesDeSair);
    window.addEventListener("click", clique, true);
    window.addEventListener("popstate", voltar);
    return () => {
      window.removeEventListener("beforeunload", antesDeSair);
      window.removeEventListener("click", clique, true);
      window.removeEventListener("popstate", voltar);
    };
  }, []);

  const sair = useCallback(() => {
    const para = destino;
    liberado.current = true;
    setDestino(null);
    // A sentinela + a cópia empilhada no popstate: duas entradas para trás saem da tela.
    if (para === "voltar") window.history.go(-2);
    else if (para) router.push(para);
  }, [destino, router]);

  const salvarESair = useCallback(async () => {
    if (!salvarRascunho) return sair();
    setSalvando(true);
    const ok = await salvarRascunho();
    setSalvando(false);
    if (ok) sair();
  }, [salvarRascunho, sair]);

  return {
    aberto: destino !== null,
    salvando,
    podeSalvar: !!salvarRascunho,
    continuar: () => setDestino(null),
    sair,
    salvarESair,
  };
}

export type ProtecaoSaida = ReturnType<typeof useProtegerSaida>;

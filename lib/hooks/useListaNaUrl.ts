"use client";

import { useEffect, useEffectEvent, useOptimistic, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { conciliarTermo, hrefLista, lerTermo, type ParametrosLista } from "@/lib/listas";

/**
 * Filtros, busca e página de uma lista paginada no servidor, guardados na URL.
 *
 * `parametros` é o que o servidor usou para montar a página (já validado). Mudar qualquer
 * filtro troca a URL com `router.replace` e o Server Component refaz a consulta; o valor
 * novo aparece na hora (`useOptimistic`) enquanto a página não volta.
 *
 * A busca tem debounce: só navega depois de uma pausa na digitação. O campo é estado
 * local e NÃO remonta a cada navegação — remontar tiraria o foco no meio da digitação. Ele
 * só segue a URL quando a mudança veio de fora (link do menu, busca global).
 */
export function useListaNaUrl<P extends ParametrosLista & { q: string }>(parametros: P, { atraso = 400 }: { atraso?: number } = {}) {
  type Mudancas = { [K in keyof P]?: string | number | null };
  const router = useRouter();
  const caminho = usePathname();
  const [pendente, startTransition] = useTransition();
  const [atuais, aplicarOtimista] = useOptimistic(parametros, (base: P, mudancas: Mudancas) => ({ ...base, ...mudancas }) as P);

  function navegar(mudancas: Mudancas) {
    // Filtro ou busca mudou: volta para a primeira página.
    const comPagina: Mudancas = "pagina" in mudancas ? mudancas : { ...mudancas, pagina: null };
    const destino = hrefLista(caminho, atuais, comPagina as ParametrosLista);
    startTransition(() => {
      aplicarOtimista(comPagina);
      router.replace(destino, { scroll: false });
    });
  }

  const termoUrl = parametros.q;
  const [texto, setTexto] = useState(termoUrl);
  const [vista, setVista] = useState(termoUrl);
  const [enviados, setEnviados] = useState<string[]>([]);
  if (termoUrl !== vista) {
    setVista(termoUrl);
    const c = conciliarTermo(termoUrl, enviados);
    setEnviados(c.enviados);
    if (c.externo) setTexto(termoUrl);
  }

  const buscarAgora = useEffectEvent((termo: string) => {
    setEnviados((e) => [...e, termo]);
    navegar({ q: termo } as Mudancas);
  });

  useEffect(() => {
    const termo = lerTermo(texto);
    const ultimo = enviados.length > 0 ? enviados[enviados.length - 1] : vista;
    if (termo === ultimo) return;
    const id = setTimeout(() => buscarAgora(termo), atraso);
    return () => clearTimeout(id);
  }, [texto, enviados, vista, atraso]);

  /** Limpa busca e filtros de uma vez, sem esperar o debounce. */
  function limpar(filtros: Mudancas) {
    setTexto("");
    if (termoUrl !== "") setEnviados((e) => [...e, ""]);
    navegar({ ...filtros, q: null });
  }

  return {
    /** Parâmetros atuais, já com o que acabou de ser escolhido. */
    atuais,
    navegar,
    irPara: (pagina: number) => navegar({ pagina } as Mudancas),
    texto,
    setTexto,
    limpar,
    /** Uma navegação está em andamento (a lista ainda é a anterior). */
    pendente,
  };
}

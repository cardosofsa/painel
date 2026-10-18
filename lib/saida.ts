/**
 * Quando a proteção de saída deve segurar um clique. Puro, coberto por `saida.test.ts`; quem
 * escuta o clique é `lib/hooks/useProtegerSaida.ts`.
 *
 * Só segura navegação DENTRO do sistema que troca de tela: link externo, nova aba, download,
 * âncora da mesma página e clique com Ctrl/Cmd/Shift/botão do meio seguem livres (não tiram a
 * pessoa da tela atual).
 */
export interface CliqueEmLink {
  href: string | null;
  target: string | null;
  download: boolean;
  /** `MouseEvent.button` (0 = esquerdo). */
  botao: number;
  modificador: boolean;
}

export function destinoBloqueavel(clique: CliqueEmLink, atual: { origin: string; pathname: string; search: string }): string | null {
  if (!clique.href || clique.download || clique.botao !== 0 || clique.modificador) return null;
  if (clique.target && clique.target !== "_self") return null;
  let destino: URL;
  try {
    destino = new URL(clique.href, atual.origin + atual.pathname + atual.search);
  } catch {
    return null;
  }
  if (destino.protocol !== "http:" && destino.protocol !== "https:") return null;
  if (destino.origin !== atual.origin) return null;
  if (destino.pathname === atual.pathname && destino.search === atual.search) return null;
  return destino.pathname + destino.search + destino.hash;
}

/**
 * "Sujo": o estado relevante mudou desde a última gravação. Compara por JSON (a forma
 * estável que vai para o banco); `null` de referência = nada gravado ainda, e aí só conta
 * como sujo se houver algo digitado.
 */
export function estaSujo(atual: unknown, referencia: string | null, temConteudo: boolean): boolean {
  if (!temConteudo) return false;
  return JSON.stringify(atual) !== referencia;
}

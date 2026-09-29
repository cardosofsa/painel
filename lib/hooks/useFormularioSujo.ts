import { useMemo } from "react";

/**
 * Compara o estado atual de um formulário com o estado em que ele estava quando o modal
 * abriu, pra decidir se fechar sem salvar deve pedir confirmação (`Modal`'s prop `sujo`).
 *
 * Comparação por `JSON.stringify` — os formulários deste projeto são objetos planos
 * (string/number/boolean/null), então basta. Não usar em formulário com `Date`, `Map` ou
 * `Set` no valor: a ordem de serialização não é garantida para esses tipos.
 */
export function useFormularioSujo<T>(atual: T, original: T): boolean {
  return useMemo(() => JSON.stringify(atual) !== JSON.stringify(original), [atual, original]);
}

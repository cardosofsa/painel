/**
 * Paralelismo controlado para chamadas às APIs dos marketplaces: no máximo `limite`
 * chamadas ao mesmo tempo, em vez de uma por vez (lento) ou todas de uma vez (estoura o
 * limite de requisições da Shopee e do Mercado Livre).
 *
 * Funciona como `Promise.allSettled`: a ordem do resultado é a ordem de `itens`, e a falha
 * de um item não derruba os outros — quem chama decide o que fazer com cada `rejected`.
 * Uma exceção síncrona dentro de `fn` também vira `rejected`.
 */
export async function mapComLimite<T, R>(itens: readonly T[], limite: number, fn: (item: T, indice: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const resultados = new Array<PromiseSettledResult<R>>(itens.length);
  if (!itens.length) return resultados;
  const largura = Number.isFinite(limite) ? Math.min(itens.length, Math.max(1, Math.floor(limite))) : itens.length;
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      try {
        resultados[i] = { status: "fulfilled", value: await fn(itens[i], i) };
      } catch (reason) {
        resultados[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: largura }, trabalhador));
  return resultados;
}

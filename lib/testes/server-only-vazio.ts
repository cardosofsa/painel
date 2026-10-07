/**
 * Substituto do pacote `server-only` nos testes (alias em `vitest.config.ts`).
 *
 * O pacote de verdade LANÇA ERRO fora da condição `react-server` — é assim que ele impede um
 * Client Component de importar código de servidor no build do Next. O vitest roda em Node
 * puro, sem essa condição, então sem este alias todo teste de `lib/ia/cofre.ts`,
 * `lib/ia/gemini.ts` etc. quebraria na importação. A trava continua valendo no build.
 */
export {};

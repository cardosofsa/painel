/**
 * Contrato de retorno das Server Actions.
 *
 * ## Por que existe
 *
 * O Next **redige toda exceção lançada dentro de Server Action em produção**: o servidor
 * loga a mensagem real com um `digest` e manda ao navegador um erro genérico. Verificado
 * na build de produção deste projeto — cadastrar um SKU duplicado deixava no log
 *
 *     ⨯ Error: Já existe um produto cadastrado com esse SKU.   digest: '1305454083'
 *
 * enquanto a tela não mostrava nada. Ou seja: todo o trabalho de tradução de
 * `lib/erros.ts` (`traduzirErroSupabase`, os rótulos por constraint, as mensagens `P0001`
 * escritas à mão nas RPCs) era invisível justamente em produção, que é onde importa.
 *
 * Valor de RETORNO atravessa intacto. Por isso toda action devolve `Resultado` em vez de
 * lançar, e o cliente desembrulha com `executar()`.
 *
 * ## Como usar
 *
 * No servidor, o corpo da action vai dentro de `comResultado`:
 *
 *     export async function criarFornecedor(dados: FornecedorInput) {
 *       return comResultado(async () => {
 *         const supabase = await createClient();
 *         const { error } = await supabase.from("fornecedores").insert(...);
 *         if (error) lancarErroSupabase(error);   // continua lançando aqui dentro
 *         revalidatePath("/fornecedores");
 *       });
 *     }
 *
 * No cliente, `executar()` relança localmente — então o `try/catch` que já existe em
 * volta continua funcionando sem mudança:
 *
 *     try {
 *       await executar(criarFornecedor(dados));
 *       toast.success("Fornecedor criado");
 *     } catch (e) {
 *       toast.error(e instanceof Error ? e.message : "Erro ao criar fornecedor");
 *     }
 *
 * **Chamar a action sem `executar()` engole o erro em silêncio** — o TypeScript não
 * reclama de valor de retorno ignorado. É a única armadilha deste desenho.
 */

export type Resultado<T = void> = { ok: true; dado: T } | { ok: false; erro: string };

/**
 * Roda o corpo da action e converte exceção em valor de retorno.
 *
 * Toda mensagem que sai daqui já passou por um tradutor nosso (`lancarErroSupabase` ou
 * `validar`), então é segura de mostrar. Qualquer coisa que não seja `Error` vira
 * genérico, e o original fica só no log do servidor.
 */
export async function comResultado<T>(fn: () => Promise<T>): Promise<Resultado<T>> {
  try {
    return { ok: true, dado: await fn() };
  } catch (e) {
    // `redirect()` e `notFound()` do Next são implementados como exceção. Engolir os dois
    // aqui transformaria um redirecionamento em "erro ao salvar" e o usuário ficaria na
    // tela achando que falhou.
    const digest = (e as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")) {
      throw e;
    }

    if (e instanceof Error) return { ok: false, erro: e.message };

    console.error("[acao] erro que não é Error:", e);
    return { ok: false, erro: "Não foi possível concluir a operação. Tente de novo." };
  }
}

/**
 * Desembrulha no cliente. Relança como `Error` para o `try/catch` de sempre continuar
 * valendo, e devolve o dado quando a action produz algum.
 */
export async function executar<T>(promessa: Promise<Resultado<T>>): Promise<T> {
  const r = await promessa;
  if (!r.ok) throw new Error(r.erro);
  return r.dado;
}

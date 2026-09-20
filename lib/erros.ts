/**
 * Traduz o erro cru do Postgres/Supabase para uma frase que faça sentido para quem usa o
 * sistema. Sem isso, o texto do banco ("duplicate key value violates unique constraint...")
 * chega direto no toast, em inglês.
 *
 * Códigos: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */

interface ErroSupabase {
  code?: string;
  message: string;
  details?: string | null;
}

const POR_CONSTRAINT: Record<string, string> = {
  produtos_user_id_sku_key: "Já existe um produto cadastrado com esse SKU.",
  pedidos_compra_user_id_numero_key: "Já existe um pedido de compra com esse número.",
  produto_lojas_produto_id_loja_id_key: "Esse produto já está vinculado a essa loja.",
};

function nomeDaConstraint(mensagem: string): string | null {
  return mensagem.match(/constraint "([^"]+)"/)?.[1] ?? null;
}

export function traduzirErroSupabase(erro: ErroSupabase): string {
  const constraint = nomeDaConstraint(erro.message);
  if (constraint && POR_CONSTRAINT[constraint]) return POR_CONSTRAINT[constraint];

  switch (erro.code) {
    case "23505":
      return "Esse registro já existe — verifique se não está duplicando algo que já cadastrou.";
    case "23503":
      return "Esse item está vinculado a outros registros e não pode ser removido enquanto eles existirem.";
    case "23502":
      return "Falta preencher um campo obrigatório.";
    case "23514":
      return "Algum valor informado está fora do permitido — confira os números e as opções escolhidas.";
    case "22P02":
      return "Algum valor está em formato inválido.";
    case "42501":
      return "Você não tem permissão para essa operação.";
    case "PGRST301":
      return "Sua sessão expirou. Entre de novo para continuar.";
    case "PGRST204":
    case "PGRST202":
      return "O banco de dados está desatualizado em relação ao sistema — falta aplicar uma migração.";
  }

  if (erro.message.includes("Failed to fetch") || erro.message.includes("fetch failed")) {
    return "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.";
  }

  return erro.message;
}

/** Lança o erro já traduzido — usado nas server actions, no lugar de `throw new Error(error.message)`. */
export function lancarErroSupabase(erro: ErroSupabase): never {
  throw new Error(traduzirErroSupabase(erro));
}

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
  produtos_user_codigo_barras_idx: "Já existe outro produto com esse código de barras.",
  produtos_grupo_variante_idx: "Esse grupo já tem uma variante com esse nome.",
  produtos_estoque_nao_negativo: "A operação deixaria o estoque negativo. Confira a quantidade disponível.",
  vendas_user_id_numero_key: "Já existe uma venda com esse número.",
};

function nomeDaConstraint(mensagem: string): string | null {
  return mensagem.match(/constraint "([^"]+)"/)?.[1] ?? null;
}

export function traduzirErroSupabase(erro: ErroSupabase): string {
  const constraint = nomeDaConstraint(erro.message);
  if (constraint && POR_CONSTRAINT[constraint]) return POR_CONSTRAINT[constraint];

  // P0001 é `raise exception` das nossas próprias RPCs: a mensagem já foi escrita em pt-BR
  // pensando no usuário final ("Estoque insuficiente...", "PIN incorreto."). Passa direto.
  if (erro.code === "P0001") return erro.message;

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

  // Fallback: NÃO repassar a mensagem crua. Ela costuma trazer nome de tabela, de coluna e
  // de constraint ('relation "produto_grupos" does not exist'), o que não ajuda em nada
  // quem está usando o sistema e entrega o desenho do banco para qualquer um — inclusive
  // para o visitante anônimo da vitrine. O texto original fica no log do servidor.
  console.error("[supabase]", erro.code ?? "sem-codigo", erro.message, erro.details ?? "");
  return "Não foi possível concluir a operação. Tente de novo; se continuar, avise o suporte.";
}

/** Lança o erro já traduzido — usado nas server actions, no lugar de `throw new Error(error.message)`. */
export function lancarErroSupabase(erro: ErroSupabase): never {
  throw new Error(traduzirErroSupabase(erro));
}

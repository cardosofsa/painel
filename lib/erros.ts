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

/**
 * Erros de autenticação (GoTrue), que são outro universo de códigos: `traduzirErroSupabase`
 * só conhece SQLSTATE do Postgres, então todo erro de login/cadastro caía no fallback ou,
 * pior, era repassado cru em inglês num app inteiro em pt-BR.
 *
 * Referência: https://supabase.com/docs/guides/auth/debugging/error-codes
 */
export interface ErroAuth {
  code?: string;
  message: string;
  status?: number;
}

/**
 * O caso que mais importa aqui é `email_not_confirmed`. Antes ele era colapsado em
 * "E-mail ou senha inválidos", o que é uma mentira que o usuário não tem como desmontar
 * sozinho: a senha dele está certa, e sem essa distinção ele fica tentando variações da
 * senha para sempre.
 */
const POR_CODIGO_AUTH: Record<string, string> = {
  invalid_credentials: "E-mail ou senha incorretos.",
  email_not_confirmed: "Sua conta ainda não foi confirmada. Abra o e-mail que enviamos e clique no link.",
  email_exists: "Este e-mail já está cadastrado.",
  user_already_exists: "Este e-mail já está cadastrado.",
  email_address_invalid: "Esse endereço de e-mail não parece válido.",
  weak_password: "Senha fraca demais. Use pelo menos 8 caracteres e evite sequências óbvias.",
  same_password: "A nova senha precisa ser diferente da atual.",
  over_request_rate_limit: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.",
  over_email_send_rate_limit: "Já enviamos um e-mail há pouco. Aguarde alguns minutos antes de pedir outro.",
  otp_expired: "Este link expirou ou já foi usado. Peça um novo.",
  reauthentication_needed: "Por segurança, entre de novo antes de fazer essa alteração.",
  session_not_found: "Sua sessão expirou. Entre de novo para continuar.",
  user_not_found: "Conta não encontrada.",
  signup_disabled: "O cadastro de novas contas está desativado no momento.",
  validation_failed: "Confira os dados preenchidos.",
};

/** Slugs usados na querystring (`/login?erro=...`), para o callback avisar o motivo. */
export const ERROS_LINK: Record<string, string> = {
  link_expirado: "Este link expirou ou já foi usado. Peça um novo abaixo.",
  link_invalido: "Não foi possível validar este link. Peça um novo abaixo.",
  sessao_expirada: "Sua sessão expirou. Entre de novo para continuar.",
};

export function traduzirErroAuth(erro: ErroAuth): string {
  if (erro.code && POR_CODIGO_AUTH[erro.code]) return POR_CODIGO_AUTH[erro.code];

  // Versões mais antigas da GoTrue não mandam `code`; sobra só a mensagem e o status.
  const msg = erro.message.toLowerCase();
  if (msg.includes("invalid login credentials")) return POR_CODIGO_AUTH.invalid_credentials;
  if (msg.includes("email not confirmed")) return POR_CODIGO_AUTH.email_not_confirmed;
  if (msg.includes("user already registered")) return POR_CODIGO_AUTH.user_already_exists;
  if (msg.includes("should be different")) return POR_CODIGO_AUTH.same_password;
  if (msg.includes("password") && msg.includes("at least")) return POR_CODIGO_AUTH.weak_password;
  if (msg.includes("expired") || msg.includes("invalid or has expired")) return POR_CODIGO_AUTH.otp_expired;
  if (erro.status === 429) return POR_CODIGO_AUTH.over_request_rate_limit;
  if (msg.includes("failed to fetch") || msg.includes("fetch failed")) {
    return "Não foi possível falar com o servidor. Verifique sua conexão e tente de novo.";
  }

  // Mesma disciplina do fallback de `traduzirErroSupabase`: nada cru para a tela.
  console.error("[auth]", erro.code ?? erro.status ?? "sem-codigo", erro.message);
  return "Não foi possível concluir a operação. Tente de novo em alguns instantes.";
}

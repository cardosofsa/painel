/**
 * Modelos de mensagem de Vixe → Mensagens (0069): cada aviso tem um texto padrão com
 * variáveis entre chaves, e a conta pode reescrever o seu. Puro, coberto por
 * `modelos.test.ts`.
 *
 * Os padrões reproduzem, palavra por palavra, os textos que o sistema já mandava
 * (`lib/whatsapp.ts`): quem nunca editou um modelo não percebe diferença.
 */

export type AssuntoModelo = "pedido" | "pago" | "enviado" | "fiado_vence" | "fiado_vencido" | "data_comercial" | "recompra";

export interface DefinicaoModelo {
  rotulo: string;
  /** Quando a mensagem aparece. */
  quando: string;
  variaveis: { nome: string; exemplo: string; descricao: string }[];
  padrao: string;
}

const V = {
  saudacao: { nome: "saudacao", exemplo: "Oi, Ana!", descricao: "\"Oi, <primeiro nome>!\"" },
  cliente: { nome: "cliente", exemplo: "Ana", descricao: "Primeiro nome do cliente" },
  loja: { nome: "loja", exemplo: "Loja Sertão", descricao: "Nome do seu negócio" },
  pedido: { nome: "pedido", exemplo: "V-0012", descricao: "Número do pedido" },
  valor: { nome: "valor", exemplo: "R$ 49,90", descricao: "Valor" },
  rastreio: { nome: "rastreio", exemplo: " Código de rastreio: BR123.", descricao: "Frase do rastreio (some se não houver)" },
  transportadora: { nome: "transportadora", exemplo: " por Correios", descricao: "\" por <transportadora>\" (some se não houver)" },
  parcela: { nome: "parcela", exemplo: "a parcela 1/3", descricao: "\"a parcela 1/3\" ou \"o valor\"" },
  vencimento: { nome: "vencimento", exemplo: "20/10/2026", descricao: "Data do vencimento" },
  encargos: { nome: "encargos", exemplo: " Com multa e juros do atraso, hoje fica R$ 51,20.", descricao: "Valor com multa e juros (só quando atrasou)" },
  pix: { nome: "pix", exemplo: "\n\nPra facilitar, o Pix copia e cola:\n000201…", descricao: "Pix copia e cola (some sem Pix configurado)" },
  data: { nome: "data", exemplo: "Dia das Crianças", descricao: "Nome da data do comércio" },
  dia: { nome: "dia", exemplo: "12/10", descricao: "Dia da data do comércio" },
  link: { nome: "link", exemplo: "https://seu-sistema/vitrine/sua-loja", descricao: "Link do seu catálogo" },
  produto: { nome: "produto", exemplo: "Caneca personalizada", descricao: "O que o cliente comprou por último" },
} as const;

export const MODELOS: Record<AssuntoModelo, DefinicaoModelo> = {
  pedido: {
    rotulo: "Pedido recebido",
    quando: "Pedido novo do catálogo, esperando confirmação.",
    variaveis: [V.saudacao, V.cliente, V.pedido, V.valor, V.loja],
    padrao: "{saudacao} Recebemos seu pedido {pedido} ({valor}) na {loja}. Já vamos conferir e te confirmamos por aqui. 😊",
  },
  pago: {
    rotulo: "Pagamento confirmado",
    quando: "Venda do catálogo paga e ainda não concluída.",
    variaveis: [V.saudacao, V.cliente, V.pedido, V.valor, V.loja],
    padrao: "{saudacao} Pagamento do pedido {pedido} ({valor}) confirmado na {loja}. Já estamos separando tudo. Obrigado pela compra!",
  },
  enviado: {
    rotulo: "Enviado",
    quando: "Venda na etapa \"Enviado\".",
    variaveis: [V.saudacao, V.cliente, V.pedido, V.loja, V.transportadora, V.rastreio],
    padrao: "{saudacao} Seu pedido {pedido} da {loja} saiu para entrega{transportadora}.{rastreio} Qualquer coisa, é só chamar.",
  },
  fiado_vence: {
    rotulo: "Crediário vencendo",
    quando: "Parcela que vence nos próximos 2 dias.",
    variaveis: [V.saudacao, V.cliente, V.parcela, V.valor, V.vencimento, V.loja, V.pix],
    padrao: "{saudacao} Lembrete amigo: {parcela} de {valor} na {loja} vence em {vencimento}. Qualquer dúvida, estou por aqui!{pix}",
  },
  fiado_vencido: {
    rotulo: "Crediário vencido",
    quando: "Parcela em atraso.",
    variaveis: [V.saudacao, V.cliente, V.parcela, V.valor, V.vencimento, V.encargos, V.loja, V.pix],
    padrao: "{saudacao} Passando para lembrar que {parcela} de {valor} na {loja} venceu em {vencimento}.{encargos} Consegue acertar? Se já pagou, desconsidere. 🙏{pix}",
  },
  data_comercial: {
    rotulo: "Data do comércio",
    quando: "Campanha para clientes antes de uma data que vende (10.10, Dia das Mães…).",
    variaveis: [V.saudacao, V.cliente, V.data, V.dia, V.loja, V.link],
    padrao: "{saudacao} {data} chegando ({dia}) e separei novidades na {loja} pra você. Dá uma olhada: {link}",
  },
  recompra: {
    rotulo: "Recompra",
    quando: "Cliente que costuma comprar e passou do tempo de sempre.",
    variaveis: [V.saudacao, V.cliente, V.produto, V.loja, V.link],
    padrao: "{saudacao} Faz um tempinho que você não passa na {loja}. Chegou coisa nova por aqui — quer dar uma olhada? {link}",
  },
};

export const ASSUNTOS_MODELO = Object.keys(MODELOS) as AssuntoModelo[];
export const LIMITE_MODELO = 1000;

/**
 * Troca `{variavel}` pelo valor. Variável vazia some sem deixar espaço duplo nem espaço
 * antes da pontuação; variável desconhecida fica como foi escrita (a pessoa vê o erro na
 * prévia em vez de o texto sumir).
 */
export function aplicarModelo(modelo: string, vars: Record<string, string | null | undefined>): string {
  const preenchido = modelo.replace(/\{(\w+)\}/g, (todo, nome: string) => (nome in vars ? (vars[nome] ?? "") : todo));
  return preenchido
    .split("\n")
    .map((l) => l.replace(/[ \t]{2,}/g, " ").replace(/ +([.,!?;:)])/g, "$1").replace(/\( +/g, "(").trimEnd())
    .join("\n")
    .trim();
}

/** Variáveis que o texto usa e o modelo não conhece (para avisar na tela antes de salvar). */
export function variaveisDesconhecidas(assunto: AssuntoModelo, texto: string): string[] {
  const conhecidas = new Set(MODELOS[assunto].variaveis.map((v) => v.nome));
  return [...new Set([...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((n) => !conhecidas.has(n)))];
}

/** Prévia com os valores de exemplo de cada variável. */
export function previaModelo(assunto: AssuntoModelo, texto: string): string {
  return aplicarModelo(texto, Object.fromEntries(MODELOS[assunto].variaveis.map((v) => [v.nome, v.exemplo])));
}

export type ModelosConta = Partial<Record<AssuntoModelo, string>>;

/** Texto que vale para o assunto: o da conta, se houver, senão o padrão. */
export function modeloDe(assunto: AssuntoModelo, modelos?: ModelosConta | null): string {
  const proprio = modelos?.[assunto]?.trim();
  return proprio || MODELOS[assunto].padrao;
}

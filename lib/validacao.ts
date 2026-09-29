import { z } from "zod";

/**
 * Schemas de validação da borda das server actions. O RLS do Postgres garante que ninguém
 * mexe nos dados de outro usuário; isso aqui garante que os dados do próprio usuário façam
 * sentido — custo negativo, margem de 500%, texto gigante, uuid malformado.
 */

/**
 * O Zod 4 compila validador com `new Function` quando o ambiente permite, e descobre isso
 * testando `new Function("")` dentro de um try/catch. Sob a nossa CSP (ver `lib/csp.ts`,
 * sem 'unsafe-eval') a chamada falha — o Zod trata e segue sem JIT, então nada quebra, mas
 * o navegador registra um `securitypolicyviolation` a cada carregamento das telas com
 * formulário. Desligar o JIT aqui evita a sonda e deixa o relatório de CSP limpo, útil pra
 * que uma violação de verdade não se perca no ruído. O custo é irrelevante: são formulários
 * pequenos, não validação em lote.
 *
 * Único ponto do app que importa `zod`, então configurar aqui alcança cliente e servidor.
 */
z.config({ jitless: true });

const textoCurto = z.string().trim().min(1, "Campo obrigatório").max(200, "Texto longo demais");
const textoOpcional = z.string().trim().max(500, "Texto longo demais").nullable();
const dinheiro = z.number().finite("Valor inválido").min(0, "Não pode ser negativo").max(10_000_000, "Valor alto demais");
const dinheiroOpcional = dinheiro.nullable();
const percentual = z.number().finite("Valor inválido").min(0, "Não pode ser negativo").max(100, "Percentual acima de 100%");
const fracao = z.number().finite("Valor inválido").min(0, "Não pode ser negativo").max(1, "Fração acima de 100%");
const inteiroNaoNegativo = z.number().int("Precisa ser um número inteiro").min(0, "Não pode ser negativo").max(1_000_000);
const uuid = z.string().uuid("Identificador inválido");
const uuidOpcional = uuid.nullable();

/**
 * URL que vai parar na vitrine pública (imagem de produto, link de concorrente).
 *
 * `z.string().url()` sozinho NÃO basta: ele usa `new URL()`, para quem
 * `javascript:alert(1)` e `data:text/html,...` são URLs perfeitamente válidas. Exigir o
 * esquema http(s) é o que impede um link armado de ser gravado e depois renderizado num
 * `<a href>` para um visitante anônimo.
 */
const urlPublica = z
  .string()
  .trim()
  .url("URL inválida")
  .max(1000, "URL longa demais")
  .refine((u) => /^https?:\/\//i.test(u), "A URL precisa começar com http:// ou https://");

/**
 * Uma linha de insumo/componente — mesma forma de `ComponenteKit` em `lib/pricing.ts`.
 * Compartilhado entre `produtoSchema.insumos` e `precificacaoSchema.componentes` (que já
 * existia; só passou a reaproveitar este schema em vez de repetir o objeto).
 */
export const componenteKitSchema = z.object({
  id: z.string().max(100),
  nome: z.string().trim().max(200),
  quantidade: z.number().finite().min(0).max(100_000),
  custoUnitario: dinheiro,
  produtoId: uuidOpcional.optional(),
});

export const produtoSchema = z.object({
  sku: textoCurto,
  nome: textoCurto,
  categoria_id: uuidOpcional,
  fornecedor_id: uuidOpcional,
  armazem_id: uuidOpcional,
  // `custo` NÃO entra aqui: desde a 0029 é derivado por trigger a partir de
  // `custo_base` + `insumos`, e escrever nele direto não tem efeito nenhum (ver
  // CLAUDE.md, "produtos.custo é derivado"). O formulário manda os dois campos-fonte.
  custo_base: dinheiro,
  insumos: z.array(componenteKitSchema).max(200),
  preco_venda: dinheiro,
  descricao: z.string().trim().max(2000).nullable(),
  codigo_barras: textoOpcional,
  imagem_url: urlPublica.nullable(),
  estoque: inteiroNaoNegativo,
  estoque_minimo: inteiroNaoNegativo,
  saida_media_semanal: z.number().finite().min(0).max(1_000_000),
  ativo: z.boolean(),
  grupo_id: uuidOpcional,
  variante_nome: z.string().trim().max(100).nullable(),
  loja_ids: z.array(uuid).max(50),
});

export const precificacaoSchema = z.object({
  produto_id: uuidOpcional,
  produto_nome: textoCurto,
  canal: z.string().trim().max(200).nullable(),
  titulo_anuncio: z.string().trim().max(200).nullable(),
  loja_id: uuidOpcional,
  componentes: z.array(componenteKitSchema).max(200).nullable(),
  taxa_extra_valor: z.number().finite().min(0).max(1_000_000).nullable(),
  taxa_extra_tipo: z.enum(["percentual", "fixo"]).nullable(),
  custo: dinheiro,
  taxa_variavel_pct: fracao,
  taxa_fixa: dinheiro,
  taxa_adicional_pct: fracao,
  imposto_pct: fracao,
  margem_pct: z.number().finite().min(-1).max(1).nullable(),
  preco_calculado: dinheiro,
  lucro: z.number().finite().min(-10_000_000).max(10_000_000),
  origem: z.enum(["individual", "em_massa"]),
});

export const lojaSchema = z.object({
  canal_id: uuid,
  nome: textoCurto,
  logo_path: z.string().max(500).nullable(),
  link: z.string().max(500).nullable(),
  comissao_pct: percentual.nullable(),
  taxa_fixa: dinheiroOpcional,
  taxa_extra_valor: dinheiroOpcional,
  taxa_extra_tipo: z.enum(["percentual", "fixo"]).nullable(),
});

export const canalSchema = z.object({
  nome: textoCurto,
  tipo_taxa: z.enum(["faixas", "fixo"]),
  icone: textoCurto,
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
});

export const faixaComissaoSchema = z.object({
  preco_min: dinheiro,
  preco_max: dinheiroOpcional,
  comissao_pct: percentual,
  tarifa_fixa: dinheiro,
});

export const contaSchema = z.object({
  nome: textoCurto,
  saldo: z.number().finite("Valor inválido").min(-10_000_000).max(10_000_000),
  detalhe: z.string().trim().max(500),
});

export const armazemSchema = z.object({
  nome: textoCurto,
  endereco: z.string().trim().max(500),
  lojas_abastecidas: z.array(z.string().trim().max(200)).max(100),
});

export const formaPagamentoSchema = z.object({
  nome: textoCurto,
  tipo: z.enum(["dinheiro", "pix", "cartao_debito", "cartao_credito", "fiado", "outro"]),
});

export const catalogoSchema = z.object({
  nome: textoCurto,
});

export const precoOverrideSchema = z.object({
  produto_id: uuid,
  preco: dinheiro.nullable(),
});

export const clienteSchema = z.object({
  nome: textoCurto,
  whatsapp: z.string().trim().max(20).nullable(),
  email: z.string().trim().max(200).nullable(),
  documento: z.string().trim().max(32).nullable(),
  data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable(),
  cep: z.string().trim().max(16).nullable(),
  endereco: textoOpcional,
  cidade: z.string().trim().max(200).nullable(),
  uf: z.string().trim().max(2).nullable(),
  observacao: textoOpcional,
  permite_fiado: z.boolean(),
  status: z.enum(["ativo", "inativo"]),
});

const corHex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida");

/**
 * Aparência da vitrine (migração 0028). Mesma disciplina de `canalSchema.cor`: hex de 6
 * dígitos é o que torna seguro aplicar o valor direto em `style={{ }}` no servidor, sem
 * sanitizar HTML. `fonte` é a mesma lista fechada de `FONTES_VITRINE` em
 * `lib/ia/prompts.ts` — repetida aqui porque este arquivo não importa de `lib/ia`.
 */
export const catalogoAparenciaSchema = z.object({
  cor_primaria: corHex,
  cor_fundo: corHex,
  cor_superficie: corHex,
  cor_texto: corHex,
  fonte: z.enum(["geist", "inter", "lora", "poppins"]),
  logo_url: urlPublica.nullable(),
  titulo: z.string().trim().max(60).nullable(),
  mensagem_boas_vindas: z.string().trim().max(160).nullable(),
});

export const gerarTemaSchema = z.object({
  descricaoLoja: z.string().trim().min(1, "Descreva a loja em uma frase").max(500),
  nomeNegocio: z.string().trim().max(120).nullable(),
  instrucaoExtra: z.string().trim().max(300).nullable(),
});

export const grupoProdutoSchema = z.object({
  nome: textoCurto,
  descricao: z.string().trim().max(2000).nullable(),
  imagem_url: urlPublica.nullable(),
  categoria_id: uuidOpcional,
});

/**
 * Os três abaixo cobrem actions que gravavam direto no banco sem passar por schema nenhum,
 * e cujos campos aparecem na **vitrine pública** ou no PDV.
 *
 * `preco_venda` era o pior: aceitava negativo, `NaN` e `1e308`, e não há check equivalente
 * no Postgres (`produtos` só restringe `estoque >= 0`). Preço negativo entrava e reaparecia
 * na vitrine e no carrinho.
 */
export const precoProdutoSchema = z.object({
  produto_id: uuid,
  preco_venda: dinheiro,
});

export const imagemProdutoSchema = z.object({
  produto_id: uuid,
  url: urlPublica,
});

export const concorrenteSchema = z.object({
  produto_id: uuid,
  nome: textoCurto,
  preco: dinheiro,
  link: urlPublica.nullable(),
});

/**
 * Teto de 500 ids: sem ele, a lista inteira vira querystring no PostgREST e volta 414 com
 * mensagem que não diz nada ao usuário. O RLS já impede mexer em produto alheio.
 */
export const acaoEmMassaProdutosSchema = z.object({
  ids: z.array(uuid).min(1, "Selecione ao menos um produto").max(500, "Máximo de 500 produtos por vez"),
  acao: z.enum(["ativar", "desativar", "remover"]),
});

export const vendaSchema = z.object({
  itens: z
    .array(
      z.object({
        produto_id: uuid,
        quantidade: z.number().int("Quantidade precisa ser inteira").min(1, "Quantidade mínima é 1").max(100_000),
        preco_unitario: dinheiro,
      }),
    )
    .min(1, "A venda precisa ter pelo menos um item")
    .max(200, "Venda com itens demais"),
  status: z.enum(["paga", "fiado"]),
  cliente_id: uuidOpcional,
  conta_id: uuidOpcional,
  forma_pagamento: z.string().trim().max(100).nullable(),
  desconto: dinheiro,
  valor_entrega: dinheiro,
  observacao: textoOpcional,
  data_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable(),
  entrada_valor: dinheiro,
  entrada_forma: z.enum(["dinheiro", "pix"]).nullable(),
  forma_pagamento_2: z.string().trim().max(100).nullable(),
  parcelas_cartao: z.number().int().min(1).max(24).nullable(),
  taxa_maquineta_pct: percentual,
  // Teto de 24, mesmo raciocínio do `pedidoCompraSchema.parcelas` (compras): sem ele, um
  // número absurdo vindo do cliente vira um `for` de milhares de linhas na RPC antes mesmo
  // dela conferir o limite de fiado.
  parcelas_fiado: z.number().int("Número de parcelas inválido").min(1).max(24, "Máximo de 24 parcelas"),
  dias_entre_parcelas: z.number().int().min(1).max(90),
});

export const perfilNegocioSchema = z.object({
  nome_negocio: z.string().trim().max(200),
  cnpj: z.string().trim().max(32),
  regime_tributario: z.string().trim().max(100),
  aliquota_das: percentual,
  whatsapp: z.string().trim().max(20).nullable(),
});

/** O PIN é gravado como hash pela RPC `definir_pin_admin`; nunca volta para o cliente. */
export const pinAdminSchema = z.object({
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,8}$/, "O PIN deve ter de 4 a 8 números")
    .nullable(),
});

export const vendaEdicaoSchema = z.object({
  cliente_id: uuidOpcional,
  forma_pagamento: z.string().trim().max(100).nullable(),
  observacao: textoOpcional,
  desconto: dinheiro,
  valor_entrega: dinheiro,
  pin: z.string().trim().min(1, "Informe o PIN"),
});

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

/**
 * Regra única de senha do sistema. Antes o mínimo estava escrito à mão em três arquivos
 * diferentes (cadastro, troca de senha e os `minLength` dos inputs), o que significa que
 * mudar a regra exigia achar todos.
 *
 * Máximo de 72 de propósito: o bcrypt ignora tudo além do 72º byte, então aceitar uma senha
 * mais longa daria ao usuário a impressão de mais segurança do que ele tem de fato.
 */
export const SENHA_MIN = 8;
export const SENHA_MAX = 72;

export const senhaSchema = z
  .string()
  .min(SENHA_MIN, `A senha precisa ter pelo menos ${SENHA_MIN} caracteres`)
  .max(SENHA_MAX, `A senha pode ter no máximo ${SENHA_MAX} caracteres`)
  .refine((s) => s === s.trim(), "A senha não pode começar ou terminar com espaço");

export const emailAuthSchema = z.string().trim().toLowerCase().email("E-mail inválido").max(200);

export const recuperacaoSchema = z.object({ email: emailAuthSchema });

export const novaSenhaSchema = z
  .object({ senha: senhaSchema, confirmacao: z.string() })
  .refine((d) => d.senha === d.confirmacao, {
    message: "As senhas não coincidem",
    path: ["confirmacao"],
  });

export const fornecedorSchema = z.object({
  nome: textoCurto,
  cnpj: z.string().trim().max(32),
  contato: z.string().trim().max(200),
  telefone: z.string().trim().max(32),
  cidade: z.string().trim().max(200),
  prazo: z.string().trim().max(100),
  status: z.enum(["ativo", "inativo"]),
});

export const movimentacaoSchema = z.object({
  tipo: z.enum(["entrada", "saida"]),
  valor: dinheiro,
  descricao: textoCurto,
  origem: z.string().trim().max(200).nullable(),
  categoria: z.string().trim().max(200).nullable(),
  conta_id: uuid,
  afeta_lucro: z.boolean(),
  data_movimentacao: dataIso,
});

export const despesaFixaSchema = z.object({
  nome: textoCurto,
  metodo: z.string().trim().max(200).nullable(),
  valor: dinheiro,
  dia_vencimento: z.number().int("Dia inválido").min(1, "O dia começa em 1").max(31, "O dia vai até 31"),
  conta_id: uuidOpcional,
});

export const contaPagarReceberSchema = z.object({
  tipo: z.enum(["pagar", "receber"]),
  descricao: textoCurto,
  valor: dinheiro,
  data_vencimento: dataIso,
  conta_id: uuidOpcional,
});

/** O período alimenta um DELETE em massa — daí o cuidado extra com a ordem das datas. */
export const periodoSchema = z
  .object({ dataInicio: dataIso, dataFim: dataIso })
  .refine((p) => p.dataFim >= p.dataInicio, { message: "A data final é anterior à inicial" });

export const compromissoSchema = z.object({
  titulo: textoCurto,
  data: dataIso,
  // `<input type="time">` devolve "HH:MM", mas o Postgres devolve "HH:MM:SS" — aceita os
  // dois para a edição de um compromisso já salvo não ser recusada.
  hora: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida").nullable(),
  descricao: textoOpcional,
});

export const movimentacaoEstoqueSchema = z.object({
  produtoId: uuid,
  tipo: z.enum(["entrada", "saida"]),
  // Precisa ser positiva: a RPC deriva o sinal a partir de `tipo`, então uma quantidade
  // negativa numa "saída" vira entrada e o estoque SOBE registrando uma baixa.
  quantidade: z.number().int("Quantidade precisa ser inteira").min(1, "Quantidade mínima é 1").max(1_000_000),
  motivo: z.string().trim().max(200),
});

/** Entrada de estoque com custo — só pra `tipo: "entrada"`; a média ponderada é
 * calculada no banco (`registrar_entrada_com_custo`, 0029). Saída continua no schema
 * acima, sem custo — não há o que ponderar numa baixa. */
export const entradaEstoqueComCustoSchema = z.object({
  produtoId: uuid,
  quantidade: z.number().int("Quantidade precisa ser inteira").min(1, "Quantidade mínima é 1").max(1_000_000),
  custoUnitario: dinheiro,
  motivo: z.string().trim().max(200).nullable(),
});

export const vincularProdutoPrecificacaoSchema = z.object({
  precificacao_id: uuid,
  produto_id: uuid,
});

export const categoriaSchema = z.object({ nome: textoCurto });

export const pedidoCompraSchema = z.object({
  fornecedor_id: uuid,
  armazem_id: uuidOpcional,
  nf: z.string().trim().max(100).nullable(),
  nf_arquivo_path: z.string().max(500).nullable(),
  data_pedido: dataIso,
  data_entrega_prevista: dataIso.nullable(),
  forma_pagamento: z.string().trim().max(100),
  conta_id: uuid,
  parcelado: z.boolean(),
  // Teto obrigatório: `Array.from({ length: parcelas })` com um número enorme vindo do
  // cliente aloca a lista inteira e derruba o processo Node antes de tocar no banco.
  parcelas: z.number().int("Número de parcelas inválido").min(1).max(48, "Máximo de 48 parcelas").nullable(),
  data_primeiro_vencimento: dataIso,
  itens: z
    .array(
      z.object({
        produto_id: uuidOpcional,
        produto_nome: textoCurto,
        quantidade: z.number().int("Quantidade precisa ser inteira").min(1, "Quantidade mínima é 1").max(1_000_000),
        custo_unitario: dinheiro,
      }),
    )
    .min(1, "O pedido precisa ter pelo menos um item")
    .max(500, "Pedido com itens demais"),
});

/**
 * Porta de entrada dos números da tela de Variações. É aqui que `NaN` é barrado: ele
 * nasce de um `Number("1,50")` (o usuário digitando no formato brasileiro), atravessa os
 * guards de `pricing.ts` — `NaN <= 0` é `false` — e só era descoberto no INSERT, com o
 * anúncio pai já gravado e órfão. `z.number().finite()` recusa NaN e Infinity.
 */
export const anuncioSchema = z.object({
  produto_id: uuidOpcional,
  loja_id: uuidOpcional,
  nome_anuncio: textoCurto,
  titulo_anuncio: z.string().trim().max(200).nullable(),
  componentes_base: z
    .array(
      z.object({
        id: z.string().max(100),
        nome: z.string().trim().max(200),
        quantidade: z.number().finite().min(0).max(100_000),
        custoUnitario: dinheiro,
      }),
    )
    .max(200)
    .nullable(),
  variacoes: z
    .array(
      z.object({
        nome_variacao: z.string().trim().max(200),
        multiplicador: z.number().finite("Multiplicador inválido").min(0).max(10_000),
        custo: dinheiro,
        taxa_variavel_pct: fracao,
        taxa_fixa: dinheiro,
        taxa_adicional_pct: fracao,
        imposto_pct: fracao,
        taxa_extra_valor: z.number().finite().min(0).max(1_000_000).nullable(),
        taxa_extra_tipo: z.enum(["percentual", "fixo"]).nullable(),
        margem_pct: z.number().finite().min(-1).max(1).nullable(),
        preco_calculado: dinheiro,
        lucro: z.number().finite("Lucro inválido").min(-10_000_000).max(10_000_000),
      }),
    )
    .min(1, "O anúncio precisa ter pelo menos uma variação")
    .max(200, "Anúncio com variações demais"),
});

/**
 * Contexto enviado à IA.
 *
 * Aqui o teto de cada campo não é só higiene de dado: é o **freio de custo**. Tudo que
 * entra vira token pago em toda geração, e o contexto chega do navegador — sem limite,
 * um cliente adulterado mandaria 500 concorrentes e um texto de 1 MB na conta do sistema.
 * Ver a seção "Cota e custo" no README.
 */
export const iaContextoSchema = z.object({
  produtoNome: z.string().trim().min(1, "Informe o nome do produto").max(300),
  sku: z.string().trim().max(100).nullish(),
  categoria: z.string().trim().max(120).nullish(),
  fornecedor: z.string().trim().max(120).nullish(),
  variante: z.string().trim().max(120).nullish(),
  descricaoAtual: z.string().trim().max(2000).nullish(),
  codigoBarras: z.string().trim().max(60).nullish(),
  custo: dinheiro.nullish(),
  precoVenda: dinheiro.nullish(),
  canal: z.string().trim().max(120).nullish(),
  loja: z.string().trim().max(120).nullish(),
  precoCalculado: dinheiro.nullish(),
  componentes: z
    .array(z.object({ nome: z.string().trim().max(120), quantidade: z.number().finite().min(0).max(100_000) }))
    .max(30)
    .optional(),
  concorrentes: z
    .array(z.object({ nome: z.string().trim().max(120), preco: dinheiro.nullable() }))
    .max(30)
    .optional(),
  instrucaoExtra: z.string().trim().max(300, "Instrução longa demais").nullish(),
});

export type IaContextoInput = z.infer<typeof iaContextoSchema>;

/**
 * Valida e devolve os dados já tipados. Em caso de erro, lança com a primeira mensagem
 * legível — que o client já mostra no toast.
 */
export function validar<T>(schema: z.ZodType<T>, dados: unknown): T {
  const resultado = schema.safeParse(dados);
  if (!resultado.success) {
    const primeiro = resultado.error.issues[0];
    const campo = primeiro.path.join(".");
    throw new Error(campo ? `${campo}: ${primeiro.message}` : primeiro.message);
  }
  return resultado.data;
}

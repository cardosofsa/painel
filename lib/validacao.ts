import { z } from "zod";
import { cidadePix } from "./pix-chave";

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
  /** null = "A consultar" no catálogo de atacado. */
  preco_atacado: dinheiro.nullable().optional(),
  descricao: z.string().trim().max(2000).nullable(),
  codigo_barras: textoOpcional,
  imagem_url: urlPublica.nullable(),
  estoque: inteiroNaoNegativo,
  estoque_minimo: inteiroNaoNegativo,
  saida_media_semanal: z.number().finite().min(0).max(1_000_000),
  garantia_dias: z.number().int("Garantia em dias inteiros").min(1).max(3650).nullable(),
  // Guardadas pela IA para reaproveitar no próximo título (0037).
  palavras_chave: z.array(z.string().trim().min(1).max(40)).max(20).nullable().optional(),
  // Envio (0041): peso da embalagem pronta e medidas. Opcionais antes da migração.
  peso_g: z.number().int().min(1).max(1_000_000).nullable().optional(),
  altura_cm: z.number().positive().max(1000).nullable().optional(),
  largura_cm: z.number().positive().max(1000).nullable().optional(),
  comprimento_cm: z.number().positive().max(1000).nullable().optional(),
  ativo: z.boolean(),
  grupo_id: uuidOpcional,
  variante_nome: z.string().trim().max(100).nullable(),
  loja_ids: z.array(uuid).max(50),
  /** 0058: kit — o estoque vem dos componentes da composição. */
  e_kit: z.boolean().optional(),
  /** 0062: fiscal (NF-e). */
  ncm: z.string().regex(/^\d{8}$/, "NCM com 8 dígitos").nullable().optional(),
  origem_fiscal: z.number().int().min(0).max(8).optional(),
});

export const precificacaoSchema = z.object({
  produto_id: uuidOpcional,
  produto_nome: textoCurto,
  canal: z.string().trim().max(200).nullable(),
  titulo_anuncio: z.string().trim().max(200).nullable(),
  // Opcional: a calculadora em massa não tem descrição (0037).
  descricao_anuncio: z.string().trim().max(5000, "Descrição do anúncio: máximo 5.000 caracteres").nullable().optional(),
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
  // Preço zero não é venda: o card mostrava "inviável" mas o Salvar gravava R$ 0,00.
  preco_calculado: dinheiro.positive("O preço precisa ser maior que zero"),
  lucro: z.number().finite().min(-10_000_000).max(10_000_000),
  origem: z.enum(["individual", "em_massa"]),
  // 0045; opcionais: a calculadora em massa não manda.
  anuncio: z
    .object({ tipo: z.enum(["percentual", "valor"]), valor: z.number().finite().min(0).max(1_000_000), margem_alvo_pct: fracao.nullable() })
    .nullable()
    .optional(),
  estrategia: z
    .object({
      diagnostico: z.string().max(1000),
      estrategias: z.array(z.object({ tipo: z.string().max(30), titulo: z.string().max(80), detalhe: z.string().max(400) })).max(5),
      precoSugerido: z.number().finite().min(0).max(10_000_000).nullable(),
      motivoPreco: z.string().max(400).nullable(),
    })
    .nullable()
    .optional(),
  imagem_url: z.string().trim().url("Imagem inválida").max(1000).nullable().optional(),
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

/** Limites de texto do canal (0037). Mesmos intervalos do check do banco; null = sem limite próprio. */
export const canalLimitesSchema = z.object({
  limite_titulo: z.number().int().min(20, "Título: mínimo 20 caracteres").max(200, "Título: máximo 200 caracteres").nullable(),
  limite_descricao: z
    .number()
    .int()
    .min(100, "Descrição: mínimo 100 caracteres")
    .max(10000, "Descrição: máximo 10.000 caracteres")
    .nullable(),
});

export const canalSchema = z
  .object({
    nome: textoCurto,
    tipo_taxa: z.enum(["faixas", "fixo"]),
    icone: textoCurto,
    cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
  })
  .merge(canalLimitesSchema.partial());

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
  // Lojas cadastradas que este armazém abastece (0041). Opcional: antes da migração não existe.
  loja_ids: z.array(uuid).max(100).optional(),
});

export const formaPagamentoSchema = z.object({
  nome: textoCurto,
  tipo: z.enum(["dinheiro", "pix", "cartao_debito", "cartao_credito", "fiado", "outro"]),
});

export const catalogoSchema = z.object({
  nome: textoCurto,
  tipo_preco: z.enum(["varejo", "atacado"]),
  // 0051; opcional para o código antigo e para quem ainda não aplicou a migração.
  formas_pagamento: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
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
  numero: z.string().trim().max(20).nullable(),
  bairro: z.string().trim().max(120).nullable(),
  complemento: z.string().trim().max(120).nullable(),
  cidade: z.string().trim().max(200).nullable(),
  uf: z.string().trim().max(2).nullable(),
  observacao: textoOpcional,
  permite_fiado: z.boolean(),
  limite_fiado: dinheiro,
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
        garantia_dias: z.number().int().min(1).max(3650).nullable().optional(),
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
  // 0083: crédito de troca é forma de pagamento (não desconto) e aponta para a devolução de
  // origem; o saldo livre do crédito é conferido na RPC, com trava.
  credito_troca: dinheiro.optional(),
  troca_devolucao_id: uuidOpcional.optional(),
  // 0083: quanto o cliente entregou em dinheiro (troco). Só informativo: o caixa recebe a venda.
  valor_recebido: dinheiroOpcional.optional(),
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
  pinAtual: z.string().trim().max(8).nullable().optional(),
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

/**
 * Código de 6 dígitos do app autenticador (MFA TOTP). O app mostra "123 456" e o celular cola
 * com espaço: só os dígitos contam.
 */
const codigoMfa = z
  .string()
  .max(20)
  .transform((s) => s.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Digite os 6 números que aparecem no app autenticador."));

export const codigoMfaSchema = z.object({ codigo: codigoMfa });

export const confirmarMfaSchema = z.object({ fatorId: uuid, codigo: codigoMfa });

/** Token do Turnstile (captcha). Opcional: sem a chave pública configurada, nem existe. */
export const captchaTokenSchema = z.string().trim().max(4096).optional();

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

/**
 * Paginação do histórico de precificações: `antesDe` é o `criado_em` da última linha já na
 * tela (cursor), `limite` vai até 5.000 ("carregar tudo" para filtrar e exportar).
 */
export const paginaHistoricoSchema = z.object({
  antesDe: z.string().datetime({ offset: true, message: "Cursor inválido" }).nullable(),
  limite: z.number().int().min(1).max(5000),
});

/** Dívida/conta de antes do sistema (0067): parcelas geradas no banco, "já pago" sem mexer no caixa. */
export const dividaAntigaSchema = z
  .object({
    tipo: z.enum(["pagar", "receber"]),
    fornecedor_id: uuidOpcional,
    cliente_id: uuidOpcional,
    descricao: textoCurto,
    valor_total: dinheiro.refine((v) => v > 0, "Informe o valor total da dívida"),
    parcelas: z.number().int("Parcelas inválidas").min(1, "Pelo menos 1 parcela").max(48, "No máximo 48 parcelas"),
    primeiro_vencimento: dataIso,
    intervalo_dias: z.number().int().min(1).max(120),
    ja_pago: dinheiro,
    conta_id: uuidOpcional,
  })
  .refine((d) => d.ja_pago <= d.valor_total, { message: "O valor já pago não pode passar do total", path: ["ja_pago"] })
  .refine((d) => (d.tipo === "pagar" ? !d.cliente_id : !d.fornecedor_id), { message: "A pagar se liga a fornecedor; a receber, a cliente", path: ["tipo"] });

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

/** Data própria do calendário (0068): feriado da cidade, data da loja, promoção. */
export const dataCalendarioSchema = z.object({
  titulo: z.string().trim().min(1, "Dê um nome para a data").max(80, "Nome longo demais"),
  data: dataIso,
  repete_todo_ano: z.boolean(),
  tipo: z.enum(["municipal", "pessoal", "promocao"]),
  observacao: z.string().trim().max(200).nullable(),
});

/** Estado dos feriados estaduais e o que aparece no calendário (0068). */
export const preferenciasCalendarioSchema = z.object({
  uf: z.string().regex(/^[A-Z]{2}$/, "UF inválida").nullable(),
  camadas: z.array(z.enum(["feriado", "comercial", "pagar", "receber", "compromisso", "minhas"])).max(6),
});

/** Janela do calendário: até ~3 meses por vez (mês mostrado + o seguinte). */
export const periodoCalendarioSchema = z
  .object({ inicio: dataIso, fim: dataIso })
  .refine((p) => p.fim >= p.inicio, { message: "Período inválido" })
  .refine((p) => (new Date(p.fim).getTime() - new Date(p.inicio).getTime()) / 86_400_000 <= 100, { message: "Período longo demais" });

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
  /** true = a prazo (parcelas pendentes); false = à vista, já sai paga (0064). */
  parcelado: z.boolean(),
  /** Dias entre as parcelas a prazo (30 = mesmo dia de cada mês). */
  intervalo_dias: z.number().int("Intervalo inválido").min(1, "Intervalo mínimo de 1 dia").max(120, "Intervalo máximo de 120 dias").default(30),
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

/** Pagamento de uma conta a pagar (0064): valor livre, data, conta e "dar por quitada". */
export const pagamentoContaSchema = z.object({
  id: uuid,
  valor: z.number().finite("Valor inválido").positive("Informe o valor pago").max(100_000_000),
  data: dataIso,
  conta_id: uuid,
  quitar: z.boolean(),
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
  descricao: z.string().trim().max(5000, "Descrição do anúncio: máximo 5.000 caracteres").nullable().optional(),
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
  variacoes: z.array(z.string().trim().max(60)).max(30).optional(),
  garantiaDias: z.number().int().min(1).max(3650).nullish(),
  palavrasChave: z.array(z.string().trim().max(40)).max(20).optional(),
  // O servidor ainda aperta com `limiteEfetivo`; aqui só barra valor absurdo.
  limite: z.number().int().min(20).max(10000).nullish(),
  tom: z.enum(["padrao", "tecnico", "premium", "descontraido"]).nullish(),
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

/** Dados que aparecem no cabeçalho do comprovante (migração 0032). Tudo opcional. */
export const dadosEmpresaSchema = z.object({
  logo_url: urlPublica.nullable(),
  telefone: z.string().trim().max(30).nullable(),
  email: z.string().trim().max(200).nullable(),
  instagram: z.string().trim().max(100).nullable(),
  cep: z.string().trim().max(16).nullable(),
  endereco: z.string().trim().max(200).nullable(),
  numero: z.string().trim().max(20).nullable(),
  bairro: z.string().trim().max(120).nullable(),
  cidade: z.string().trim().max(200).nullable(),
  uf: z.string().trim().max(2).nullable(),
});

/** Gasto com anúncios (0066): período, canal e as linhas (uma por anúncio/campanha). */
export const gastosAnunciosSchema = z
  .object({
    periodo_inicio: dataIso,
    periodo_fim: dataIso,
    loja_id: uuidOpcional,
    canal: z.string().trim().min(1, "Informe o canal").max(60),
    origem: z.enum(["shopee_ads", "manual"]),
    linhas: z
      .array(
        z.object({
          campanha: z.string().trim().max(200),
          sku: z.string().trim().max(100).nullable(),
          valor: z.number().finite().min(0).max(10_000_000),
          pedidos: z.number().int().min(0).max(10_000_000).nullable(),
          vendas: z.number().finite().min(0).max(100_000_000).nullable(),
        }),
      )
      .min(1, "Nenhum gasto para salvar")
      .max(2000, "Linhas demais de uma vez"),
  })
  .refine((v) => v.periodo_fim >= v.periodo_inicio, { message: "O fim do período vem antes do início", path: ["periodo_fim"] });

/** Repasses lidos do relatório da plataforma (0066). */
export const repassesSchema = z.object({
  conta_id: uuid,
  itens: z
    .array(z.object({ numero: z.string().trim().min(1).max(80), valor: z.number().finite().min(-10_000_000).max(10_000_000), data: dataIso.nullable() }))
    .min(1, "Nenhum repasse para conciliar")
    .max(5000, "No máximo 5.000 pedidos por vez"),
});

/** Pix e encargos do crediário (0065). Multa limitada a 2% pelo CDC; o banco também confere. */
export const crediarioConfigSchema = z.object({
  pix_chave: z.string().trim().max(77, "Chave Pix longa demais").nullable(),
  pix_nome: z.string().trim().max(25, "O nome no Pix vai até 25 letras").nullable(),
  // O Pix aceita só 15 caracteres: a cidade inteira é encurtada aqui ("Feira de Santana" → "Feira Santana").
  pix_cidade: z.string().trim().max(60, "Cidade longa demais").transform(cidadePix).nullable(),
  multa_atraso_pct: z.number().finite().min(0).max(2, "A multa por atraso vai até 2% (Código de Defesa do Consumidor)"),
  juros_mes_pct: z.number().finite().min(0).max(10, "Juros de até 10% ao mês"),
});

/** Chave de IA que o usuário cola: sem espaço/quebra de linha (sinal de cópia errada). */
export const iaChaveSchema = z.object({
  provedor: z.enum(["gemini", "openai", "anthropic", "openrouter"]),
  chave: z
    .string()
    .trim()
    .min(8, "A chave parece curta demais")
    .max(400, "A chave parece longa demais")
    .regex(/^\S+$/, "A chave não pode ter espaços nem quebras de linha"),
});

export const iaCadastroSchema = iaChaveSchema.extend({
  /** Ids de modelo: `nome`, `fornecedor/nome`, com sufixo opcional `:variante` (OpenRouter). */
  modelo: z
    .string()
    .trim()
    .min(1, "Escolha o modelo")
    .max(200)
    .regex(/^[\w.@+-]+(\/[\w.@+-]+)?(:[\w.-]+)?$/, "Nome de modelo inválido"),
  padrao: z.boolean(),
});

/**
 * Contexto do Vixe Preço (7.6). Os números vêm da tela, calculados por `lib/vixe/preco.ts`;
 * aqui só se barra valor absurdo antes de gastar token. Quem mandar número falso engana só
 * a própria consulta.
 */
const valorPreco = z.number().finite().min(0).max(10_000_000);
export const iaPrecoSchema = z.object({
  produtoNome: z.string().trim().min(1, "Informe o produto").max(300),
  canal: z.string().trim().max(120).nullish(),
  objetivo: z.enum(["volume", "margem"]),
  custo: valorPreco,
  preco: z.number().finite().positive("Informe o preço atual").max(10_000_000),
  lucro: z.number().finite().min(-10_000_000).max(10_000_000),
  margemPct: z.number().finite().min(-100).max(1),
  comissaoPct: z.number().finite().min(0).max(100),
  tarifa: valorPreco,
  impostoPct: z.number().finite().min(0).max(1),
  precoMinimoViavel: valorPreco.nullish(),
  zonaMorta: z.object({ inicio: valorPreco, fim: valorPreco, precoMelhor: valorPreco, ganhoLiquido: valorPreco }).nullish(),
  concorrencia: z
    .object({ min: valorPreco, max: valorPreco, media: valorPreco, diferencaPct: z.number().finite().min(-100).max(100), quantidade: z.number().int().min(1).max(100) })
    .nullish(),
  precoPsicologico: valorPreco.nullish(),
  instrucaoExtra: z.string().trim().max(300, "Instrução longa demais").nullish(),
  anuncio: z
    .object({ gastoPorVenda: valorPreco, roasEmpate: z.number().finite().min(0).max(100_000).nullable(), roasAtual: z.number().finite().min(0).max(100_000).nullable(), lucroDepois: z.number().finite().min(-10_000_000).max(10_000_000) })
    .nullish(),
});

/** Ferramentas de texto da Vixe (7.7). Cada uma valida só o que manda para a IA. */
const produtoTextoIaSchema = z.object({
  nome: z.string().trim().min(1, "Escolha o produto").max(300),
  descricao: z.string().trim().max(5000).nullish(),
  categoria: z.string().trim().max(120).nullish(),
  preco: z.number().finite().min(0).max(10_000_000).nullish(),
  garantiaDias: z.number().int().min(1).max(3650).nullish(),
  emEstoque: z.boolean().nullish(),
});
export const iaFerramentaSchemas = {
  resposta: z.object({
    produto: produtoTextoIaSchema,
    pergunta: z.string().trim().min(3, "Cole a pergunta do cliente").max(500, "Pergunta longa demais"),
    nomeNegocio: z.string().trim().max(120).nullish(),
    estrelas: z.number().int().min(1).max(5).nullish(),
  }),
  cobranca: z.object({
    parcelas: z
      .array(z.object({ valor: z.number().finite().positive().max(10_000_000), vencimento: z.string().max(20), atrasoDias: z.number().int().min(0).max(10_000) }))
      .min(1, "Esse cliente não tem parcela em aberto")
      .max(24),
    nomeNegocio: z.string().trim().max(120).nullish(),
    tom: z.enum(["gentil", "firme"]),
  }),
  legenda: z.object({
    produto: produtoTextoIaSchema,
    rede: z.enum(["whatsapp", "instagram"]),
    linkVitrine: urlPublica.nullish(),
    instrucaoExtra: z.string().trim().max(300, "Instrução longa demais").nullish(),
  }),
  atributos: z.object({ produto: produtoTextoIaSchema }),
} as const;

/** Assistente de vitrine da Vixe (7.9): as respostas do dono. */
export const iaVitrineSchema = z.object({
  nomeNegocio: z.string().trim().max(120).nullish(),
  segmento: z.string().trim().min(2, "Conte o que a loja vende").max(200),
  publico: z.string().trim().max(200).nullish(),
  estilo: z.enum(["moderno", "elegante", "rustico", "divertido", "minimalista"]),
  cores: z.string().trim().max(120).nullish(),
  diferenciais: z.string().trim().max(500, "Diferenciais: até 500 caracteres").nullish(),
  cidade: z.string().trim().max(80).nullish(),
});

/** Seções já normalizadas por `normalizarSecoes`; aqui só o teto de segurança antes de gravar. */
export const secoesVitrineSchema = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 6000, "Seções da vitrine grandes demais");

/** Movimentação por armazém (0041): entrada leva custo, saída não; transferência tem destino. */
export const movimentacaoArmazemSchema = z
  .object({
    produtoId: uuid,
    armazemId: uuid,
    tipo: z.enum(["entrada", "saida", "transferencia"]),
    quantidade: z.number().int("Quantidade precisa ser inteira").min(1, "Quantidade mínima é 1").max(1_000_000),
    custoUnitario: dinheiro.nullable(),
    destinoId: uuid.nullable(),
    motivo: z.string().trim().max(200).nullable(),
  })
  .refine((v) => v.tipo !== "transferencia" || (!!v.destinoId && v.destinoId !== v.armazemId), "Escolha um armazém de destino diferente do de origem.");

// ---------- Vixe → Mensagens (0069) ----------
export const modeloMensagemSchema = z.object({
  assunto: z.enum(["pedido", "pago", "enviado", "fiado_vence", "fiado_vencido", "data_comercial", "recompra"]),
  texto: z.string().trim().min(1, "Escreva o texto da mensagem").max(1000, "A mensagem pode ter no máximo 1.000 caracteres"),
});
export type ModeloMensagemInput = z.infer<typeof modeloMensagemSchema>;

export const mensagemEnviadaSchema = z.object({
  chave: z.string().min(3).max(120),
  assunto: z.string().max(30).nullish(),
  cliente: z.string().max(120).nullish(),
  referencia: z.string().max(60).nullish(),
  whatsapp: z.string().max(30).nullish(),
  texto: z.string().max(2000).nullish(),
  pulada: z.boolean().optional(),
});
export type MensagemEnviadaInput = z.infer<typeof mensagemEnviadaSchema>;

// ---------- Raio-X (0071) ----------
export const precoPraticadoSchema = z.object({
  chave: z.string().trim().min(1).max(300),
  produto_id: z.string().uuid().nullable(),
  loja_id: z.string().uuid().nullable(),
  preco: z.number({ message: "Informe o preço" }).positive("O preço precisa ser maior que zero").max(999999),
  observacao: z.string().trim().max(200).nullish(),
});
export type PrecoPraticadoInput = z.infer<typeof precoPraticadoSchema>;

// ---------- Estúdio de IA (0072) ----------
export const imagemIASchema = z.object({
  produtoId: z.string().uuid(),
  tipo: z.enum(["fundo_branco", "ambiente", "capa_selo", "variacao_cor", "medidas", "livre"]),
  extra: z.string().trim().max(160).nullish(),
  fotoUrl: z.string().url().max(1000).nullish(),
});
export type ImagemIAInput = z.infer<typeof imagemIASchema>;

// ---------- Inventário (0074) ----------
export const inventarioSchema = z.object({
  armazemId: z.string().uuid().nullable(),
  itens: z
    .array(z.object({ produto_id: z.string().uuid(), contado: z.number().int("Contagem em unidades inteiras").min(0).max(1_000_000) }))
    .min(1, "Conte pelo menos um produto antes de aplicar.")
    .max(5000, "Inventário grande demais: aplique em partes de até 5.000 produtos."),
  observacao: z.string().trim().max(300).nullish(),
});
export type InventarioInput = z.infer<typeof inventarioSchema>;

// ---------- Avaliações da Shopee (Fase 5, onda B) ----------
export const respostaAvaliacaoSchema = z.object({
  conexaoId: z.string().uuid(),
  commentId: z.number().int().positive(),
  texto: z.string().trim().min(2, "Escreva a resposta").max(500, "A Shopee aceita até 500 caracteres"),
});
export type RespostaAvaliacaoInput = z.infer<typeof respostaAvaliacaoSchema>;

// ---------- Listas paginadas: exportação sob demanda ----------
/**
 * A lista na tela é uma página; exportar busca a lista inteira na hora. `filtro` são os
 * parâmetros da URL da tela — cada uma relê com os próprios leitores de `lib/listas.ts`,
 * que descartam qualquer valor fora do esperado.
 */
export const exportarListaSchema = z.object({
  escopo: z.enum(["todos", "filtrados", "selecionados"]),
  filtro: z.record(z.string(), z.string().max(200)),
  ids: z.array(uuid).max(5000, "Selecione no máximo 5.000 itens para exportar"),
});
export type ExportarListaInput = z.infer<typeof exportarListaSchema>;

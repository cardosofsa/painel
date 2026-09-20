import { z } from "zod";

/**
 * Schemas de validação da borda das server actions. O RLS do Postgres garante que ninguém
 * mexe nos dados de outro usuário; isso aqui garante que os dados do próprio usuário façam
 * sentido — custo negativo, margem de 500%, texto gigante, uuid malformado.
 */

const textoCurto = z.string().trim().min(1, "Campo obrigatório").max(200, "Texto longo demais");
const textoOpcional = z.string().trim().max(500, "Texto longo demais").nullable();
const dinheiro = z.number().finite("Valor inválido").min(0, "Não pode ser negativo").max(10_000_000, "Valor alto demais");
const dinheiroOpcional = dinheiro.nullable();
const percentual = z.number().finite("Valor inválido").min(0, "Não pode ser negativo").max(100, "Percentual acima de 100%");
const fracao = z.number().finite("Valor inválido").min(0, "Não pode ser negativo").max(1, "Fração acima de 100%");
const inteiroNaoNegativo = z.number().int("Precisa ser um número inteiro").min(0, "Não pode ser negativo").max(1_000_000);
const uuid = z.string().uuid("Identificador inválido");
const uuidOpcional = uuid.nullable();

export const produtoSchema = z.object({
  sku: textoCurto,
  nome: textoCurto,
  categoria_id: uuidOpcional,
  fornecedor_id: uuidOpcional,
  armazem_id: uuidOpcional,
  custo: dinheiro,
  preco_venda: dinheiro,
  preco_atacado: dinheiroOpcional,
  codigo_barras: textoOpcional,
  imagem_url: z.string().url("URL inválida").nullable(),
  estoque: inteiroNaoNegativo,
  estoque_minimo: inteiroNaoNegativo,
  saida_media_semanal: z.number().finite().min(0).max(1_000_000),
  ativo: z.boolean(),
  loja_ids: z.array(uuid).max(50),
});

export const precificacaoSchema = z.object({
  produto_id: uuidOpcional,
  produto_nome: textoCurto,
  canal: z.string().trim().max(200).nullable(),
  titulo_anuncio: z.string().trim().max(200).nullable(),
  loja_id: uuidOpcional,
  componentes: z
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

export const formaPagamentoSchema = z.object({ nome: textoCurto });

export const perfilNegocioSchema = z.object({
  nome_negocio: z.string().trim().max(200),
  cnpj: z.string().trim().max(32),
  regime_tributario: z.string().trim().max(100),
  aliquota_das: percentual,
});

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

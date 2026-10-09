"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import {
  validar,
  lojaSchema,
  canalSchema,
  canalLimitesSchema,
  faixaComissaoSchema,
  contaSchema,
  armazemSchema,
  formaPagamentoSchema,
  perfilNegocioSchema,
  dadosEmpresaSchema,
  crediarioConfigSchema,
  pinAdminSchema,
  categoriaSchema,
} from "@/lib/validacao";
import { comResultado } from "@/lib/acao";

const PATH = "/configuracoes";

// ---------- Categorias ----------
export async function criarCategoria(nome: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("categorias").insert(validar(categoriaSchema, { nome }));
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}

/** Produto, insumo ou embalagem (0042): insumo e embalagem aparecem primeiro na composição de custo. */
export async function definirTipoCategoria(id: string, tipo: "produto" | "insumo" | "embalagem") {
  return comResultado(async () => {
    if (!["produto", "insumo", "embalagem"].includes(tipo)) throw new Error("Tipo inválido.");
    const supabase = await createClient();
    const { error } = await supabase.from("categorias").update({ tipo }).eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/produtos");
    revalidatePath("/precificacao");
  });
}

export async function removerCategoria(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("categorias").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
  });
}

// ---------- Lojas (dentro de um canal de venda) ----------
export interface LojaInput {
  canal_id: string;
  nome: string;
  logo_path: string | null;
  link: string | null;
  comissao_pct: number | null;
  taxa_fixa: number | null;
  taxa_extra_valor: number | null;
  taxa_extra_tipo: "percentual" | "fixo" | null;
  /** 0089. Só vai no envio quando o dono mexeu no campo (antes da migração a coluna não existe). */
  dias_liberacao_repasse?: number;
}

export async function criarLoja(dados: LojaInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("lojas_canal").insert(validar(lojaSchema, dados));
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/precificacao");
  });
}

export async function atualizarLoja(id: string, dados: LojaInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("lojas_canal").update(validar(lojaSchema, dados)).eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/precificacao");
  });
}

export async function removerLoja(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("lojas_canal").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/precificacao");
  });
}

// ---------- Canais (categorias fixas de venda: Shopee, Mercado Livre, etc.) ----------
export interface CanalInput {
  nome: string;
  tipo_taxa: "faixas" | "fixo";
  icone: string;
  cor: string;
  limite_titulo?: number | null;
  limite_descricao?: number | null;
}

export interface LimitesCanalInput {
  limite_titulo: number | null;
  limite_descricao: number | null;
}

/** Limites de título e descrição usados pela IA neste canal (0037). */
export async function atualizarLimitesCanal(id: string, dados: LimitesCanalInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("canais").update(validar(canalLimitesSchema, dados)).eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/precificacao");
  });
}

export async function criarCanal(dados: CanalInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("canais").insert(validar(canalSchema, dados));
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/precificacao");
  });
}

export async function removerCanal(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("canais").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/precificacao");
    revalidatePath("/produtos");
  });
}

const CANAIS_PADRAO: CanalInput[] = [
  // Limites de texto conferidos em set/2026; editáveis porque as plataformas mudam.
  { nome: "Shopee", tipo_taxa: "faixas", icone: "ShoppingBag", cor: "#EE4D2D", limite_titulo: 100, limite_descricao: 5000 },
  { nome: "Mercado Livre", tipo_taxa: "fixo", icone: "ShoppingCart", cor: "#FFE600", limite_titulo: 60, limite_descricao: 10000 },
  { nome: "Loja Física", tipo_taxa: "fixo", icone: "Store", cor: "#64748b" },
  { nome: "Facebook", tipo_taxa: "fixo", icone: "Facebook", cor: "#1877F2" },
];

export async function restaurarCanaisPadrao() {
  return comResultado(async () => {
    const supabase = await createClient();
    const { data: existentes, error: erroSelect } = await supabase.from("canais").select("nome");
    if (erroSelect) lancarErroSupabase(erroSelect);

    const nomesExistentes = new Set((existentes ?? []).map((c) => c.nome));
    const faltando = CANAIS_PADRAO.filter((c) => !nomesExistentes.has(c.nome));
    if (faltando.length === 0) return;

    const { error } = await supabase.from("canais").insert(faltando);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/precificacao");
  });
}

// ---------- Faixas de comissão por canal (ex.: tabela oficial da Shopee) ----------
export interface FaixaComissaoInput {
  preco_min: number;
  preco_max: number | null;
  comissao_pct: number;
  tarifa_fixa: number;
}

export async function atualizarFaixasCanal(canalId: string, faixas: FaixaComissaoInput[]) {
  return comResultado(async () => {
    const supabase = await createClient();

    // Valida TUDO antes de apagar qualquer coisa. Antes a validação acontecia dentro do
    // `.map()`, ou seja, depois do DELETE: uma faixa inválida apagava a tabela de
    // comissões da Shopee do usuário e não inseria nada no lugar — e é ela que define
    // todo o cálculo de preço do sistema.
    const linhas = faixas.map((f, i) => ({ canal_id: canalId, ordem: i + 1, ...validar(faixaComissaoSchema, f) }));
    for (const linha of linhas) {
      if (linha.preco_max !== null && linha.preco_max <= linha.preco_min) {
        throw new Error(`A faixa ${linha.ordem} termina antes de começar — confira os valores mínimo e máximo.`);
      }
    }

    const { error: erroDelete } = await supabase.from("faixas_comissao_canal").delete().eq("canal_id", canalId);
    if (erroDelete) lancarErroSupabase(erroDelete);

    if (linhas.length > 0) {
      const { error: erroInsert } = await supabase.from("faixas_comissao_canal").insert(linhas);
      if (erroInsert) lancarErroSupabase(erroInsert);
    }

    revalidatePath(PATH);
    revalidatePath("/precificacao");
  });
}

// ---------- Contas ----------
export interface ContaInput {
  nome: string;
  saldo: number;
  detalhe: string;
  /** 0092: cartão de crédito. Conta comum não manda estes campos (a tela segue funcionando sem a migração). */
  tipo?: "conta" | "cartao_credito";
  limite_total?: number | null;
  dia_fechamento?: number | null;
  dia_vencimento?: number | null;
}

/** Valida e tira os campos de cartão da conta comum, que não exigem a 0092. */
function dadosDaConta(dados: ContaInput) {
  const v = validar(contaSchema, dados);
  if (v.tipo === "cartao_credito") return v;
  return { nome: v.nome, saldo: v.saldo, detalhe: v.detalhe };
}

export async function criarConta(dados: ContaInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("contas").insert(dadosDaConta(dados));
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/dashboard");
    revalidatePath("/financeiro");
  });
}

export async function atualizarConta(id: string, dados: ContaInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("contas").update(dadosDaConta(dados)).eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/dashboard");
    revalidatePath("/financeiro");
  });
}

export async function removerConta(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    // Cartão com fatura em aberto: remover apagaria a dívida do sistema sem ela ser paga.
    const { data: conta } = await supabase.from("contas").select("*").eq("id", id).maybeSingle();
    if (conta?.tipo === "cartao_credito" && Number(conta.saldo) < -0.004) {
      throw new Error("Esse cartão tem fatura em aberto. Pague a fatura (Financeiro > Pagar fatura) antes de remover.");
    }
    const { error } = await supabase.from("contas").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/dashboard");
    revalidatePath("/financeiro");
  });
}

// ---------- Formas de Pagamento ----------
export type TipoFormaPagamento = "dinheiro" | "pix" | "cartao_debito" | "cartao_credito" | "fiado" | "outro";

export interface FormaPagamentoInput {
  nome: string;
  tipo: TipoFormaPagamento;
}

export async function criarFormaPagamento(dados: FormaPagamentoInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("formas_pagamento").insert(validar(formaPagamentoSchema, dados));
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/compras");
    revalidatePath("/pdv");
    revalidatePath("/catalogo");
  });
}

export async function atualizarFormaPagamento(id: string, dados: FormaPagamentoInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("formas_pagamento").update(validar(formaPagamentoSchema, dados)).eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/compras");
    revalidatePath("/pdv");
    revalidatePath("/catalogo");
  });
}

export async function removerFormaPagamento(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("formas_pagamento").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/compras");
  });
}

// ---------- Armazéns ----------
export interface ArmazemInput {
  nome: string;
  endereco: string;
  /** Nomes das lojas (mostrados nos cartões). Com `loja_ids`, são derivados das marcadas. */
  lojas_abastecidas: string[];
  loja_ids?: string[];
}

/**
 * Grava o armazém; sem a 0041 a coluna `loja_ids` não existe (PGRST204), e aí grava de novo
 * só com os nomes — o cadastro não pode travar por falta de migração.
 */
async function gravarArmazem(id: string | null, dados: ArmazemInput) {
  const supabase = await createClient();
  const v = validar(armazemSchema, dados);
  const tentar = (linha: typeof v) => (id ? supabase.from("armazens").update(linha).eq("id", id) : supabase.from("armazens").insert(linha));
  let { error } = await tentar(v);
  if (error?.code === "PGRST204" && v.loja_ids) {
    const { loja_ids: _ignorado, ...semIds } = v;
    void _ignorado;
    ({ error } = await tentar(semIds));
  }
  if (error) lancarErroSupabase(error);
  revalidatePath(PATH);
  revalidatePath("/estoque");
  revalidatePath("/produtos");
}

export async function criarArmazem(dados: ArmazemInput) {
  return comResultado(() => gravarArmazem(null, dados));
}

export async function atualizarArmazem(id: string, dados: ArmazemInput) {
  return comResultado(() => gravarArmazem(id, dados));
}

export async function removerArmazem(id: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("armazens").delete().eq("id", id);
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/estoque");
    revalidatePath("/produtos");
  });
}

// ---------- Perfil do Negócio ----------
export interface PerfilNegocioInput {
  nome_negocio: string;
  cnpj: string;
  regime_tributario: string;
  aliquota_das: number;
  whatsapp: string | null;
}

export async function salvarPerfilNegocio(dados: PerfilNegocioInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada, faça login novamente");

    const { error } = await supabase
      .from("perfil_negocio")
      .upsert({ user_id: user.id, ...validar(perfilNegocioSchema, dados), atualizado_em: new Date().toISOString() });
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/precificacao");
  });
}

/**
 * O PIN nunca trafega de volta para o navegador nem é gravado em texto: a RPC guarda só o
 * hash bcrypt. Por isso ele sai do `perfil_negocio` normal e tem uma action própria — a
 * tela só sabe se existe um PIN cadastrado, nunca qual é.
 */
export async function definirPinAdmin(pin: string | null, pinAtual: string | null = null) {
  return comResultado(async () => {
    const supabase = await createClient();
    const validado = validar(pinAdminSchema, { pin, pinAtual });

    // Com a 0081, trocar ou remover um PIN existente pede o atual (ou login há menos de 10 min).
    const { error } = await supabase.rpc("definir_pin_admin", { p_pin: validado.pin, ...(validado.pinAtual ? { p_pin_atual: validado.pinAtual } : {}) });
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/vendas");
  });
}

// ---------- Dados da empresa (cabeçalho do comprovante) ----------
export interface DadosEmpresaInput {
  logo_url: string | null;
  telefone: string | null;
  email: string | null;
  instagram: string | null;
  cep: string | null;
  endereco: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

export async function salvarDadosEmpresa(dados: DadosEmpresaInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada, faça login novamente");

    // Upsert só com estas colunas: o resto da linha (nome, PIN, alíquota…) não é tocado.
    const { error } = await supabase
      .from("perfil_negocio")
      .upsert({ user_id: user.id, ...validar(dadosEmpresaSchema, dados), atualizado_em: new Date().toISOString() });
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/vendas");
    revalidatePath("/pdv");
    revalidatePath("/clientes");
  });
}

// ---------- Pix e encargos do crediário (0065) ----------
export interface CrediarioConfig {
  pix_chave: string | null;
  pix_nome: string | null;
  pix_cidade: string | null;
  multa_atraso_pct: number;
  juros_mes_pct: number;
}

export async function salvarCrediario(dados: CrediarioConfig) {
  return comResultado(async () => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada, faça login novamente");
    const v = validar(crediarioConfigSchema, dados);
    // Só estas colunas: o resto do perfil não é tocado.
    const { error } = await supabase.from("perfil_negocio").upsert({
      user_id: user.id,
      pix_chave: v.pix_chave || null,
      pix_nome: v.pix_nome || null,
      pix_cidade: v.pix_cidade || null,
      multa_atraso_pct: v.multa_atraso_pct,
      juros_mes_pct: v.juros_mes_pct,
      atualizado_em: new Date().toISOString(),
    });
    if (error?.code === "PGRST204" || error?.code === "42703") throw new Error("Pix e encargos precisam da migração 0065. Aplique no Supabase e recarregue.");
    if (error) lancarErroSupabase(error);
    revalidatePath(PATH);
    revalidatePath("/vendas");
    revalidatePath("/clientes");
    revalidatePath("/financeiro");
  });
}

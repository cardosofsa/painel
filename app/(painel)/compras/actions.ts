"use server";

import { revalidatePath } from "next/cache";
import { hojeIsoBrasil, hojeIsoLocal, dataLocal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, pedidoCompraSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { z } from "zod";
import { createHash } from "node:crypto";
import { gerarNfePelaFotoIA } from "@/lib/ia/gerar";

export interface ItemPedidoInput {
  produto_id: string | null;
  produto_nome: string;
  quantidade: number;
  custo_unitario: number;
}

export type FormaPagamento = string;

export interface PedidoCompraInput {
  fornecedor_id: string;
  armazem_id: string | null;
  nf: string | null;
  nf_arquivo_path: string | null;
  data_pedido: string;
  data_entrega_prevista: string | null;
  forma_pagamento: FormaPagamento;
  conta_id: string;
  parcelado: boolean;
  parcelas: number | null;
  intervalo_dias?: number;
  data_primeiro_vencimento: string;
  itens: ItemPedidoInput[];
}

function revalidateTudo() {
  revalidatePath("/compras");
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
  revalidatePath("/produtos");
  revalidatePath("/estoque");
}

function somarMeses(dataIso: string, meses: number) {
  const d = dataLocal(dataIso);
  d.setMonth(d.getMonth() + meses);
  return hojeIsoLocal(d);
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Grava um pedido (cabeçalho, itens e parcelas a pagar). Usado pelo formulário e pela
 * importação. `frete`/`observacao` (0042) só vão quando preenchidos: antes da migração as
 * colunas não existem, e mandá-las vazias derrubaria o cadastro.
 */
async function gravarPedido(
  supabase: Supabase,
  v: PedidoCompraInput & { intervalo_dias: number },
  extra: { frete?: number; observacao?: string | null; parcelasNota?: { valor: number; vencimento: string }[] | null } = {},
) {
  const frete = Math.max(0, extra.frete ?? 0);
  const valorTotal = v.itens.reduce((acc, it) => acc + it.quantidade * it.custo_unitario, 0) + frete;

  const { data: pedido, error: erroPedido } = await supabase
    .from("pedidos_compra")
    .insert({
      fornecedor_id: v.fornecedor_id,
      armazem_id: v.armazem_id,
      nf: v.nf,
      nf_arquivo_path: v.nf_arquivo_path,
      valor_total: valorTotal,
      data_pedido: v.data_pedido,
      data_entrega_prevista: v.data_entrega_prevista,
      forma_pagamento: v.forma_pagamento,
      parcelas: v.parcelado ? v.parcelas : null,
      status: "pendente",
      ...(frete > 0 ? { frete } : {}),
      ...(extra.observacao ? { observacao: extra.observacao.slice(0, 500) } : {}),
    })
    .select("id, numero")
    .single();

  if (erroPedido) lancarErroSupabase(erroPedido);
  if (!pedido) throw new Error("Erro ao criar pedido.");

  const itensParaInserir = v.itens.map((it) => ({ ...it, pedido_compra_id: pedido.id }));
  const { error: erroItens } = await supabase.from("pedidos_compra_itens").insert(itensParaInserir);
  if (erroItens) lancarErroSupabase(erroItens);

  // Duplicatas da nota (0065): cada parcela com o valor e o vencimento que vieram no XML.
  if (extra.parcelasNota?.length) {
    const { error } = await supabase.rpc("gerar_pagamento_compra_parcelas", { p_pedido: pedido.id, p_parcelas: extra.parcelasNota, p_conta_id: v.conta_id });
    if (error?.code === "PGRST202") throw new Error("Usar as parcelas da nota precisa da migração 0065. O pedido foi criado sem parcelas; aplique a migração e lance o pagamento.");
    if (error) lancarErroSupabase(error);
    return pedido;
  }

  // Parcelas no banco, numa transação só (0064). À vista já nasce paga.
  const { error: erroPagamento } = await supabase.rpc("gerar_pagamento_compra", {
    p_pedido: pedido.id,
    p_a_prazo: v.parcelado,
    p_parcelas: v.parcelado ? Math.max(1, v.parcelas ?? 1) : 1,
    p_primeiro_venc: v.data_primeiro_vencimento,
    p_intervalo_dias: v.intervalo_dias,
    p_conta_id: v.conta_id,
  });
  if (erroPagamento?.code === "PGRST202") await gravarParcelasSemMigracao(supabase, v, pedido, valorTotal);
  else if (erroPagamento) lancarErroSupabase(erroPagamento);
  return pedido;
}

/** Sem a 0064 a RPC não existe: grava as parcelas pendentes como antes (mensais). */
async function gravarParcelasSemMigracao(supabase: Supabase, v: PedidoCompraInput, pedido: { id: string; numero: string }, valorTotal: number) {
  const parcelas = v.parcelado ? Math.max(1, v.parcelas ?? 1) : 1;
  const valorParcela = Math.round((valorTotal / parcelas) * 100) / 100;
  const titulos = Array.from({ length: parcelas }, (_, i) => {
    const ultima = i === parcelas - 1;
    const valor = ultima ? Math.round((valorTotal - valorParcela * (parcelas - 1)) * 100) / 100 : valorParcela;
    return {
      tipo: "pagar" as const,
      descricao: parcelas > 1 ? `Pedido ${pedido.numero} — parcela ${i + 1}/${parcelas}` : `Pedido ${pedido.numero}`,
      valor,
      data_vencimento: v.parcelado ? somarMeses(v.data_primeiro_vencimento, i) : v.data_pedido,
      status: "pendente" as const,
      conta_id: v.conta_id,
      referencia_pedido_compra_id: pedido.id,
    };
  });
  const { error } = await supabase.from("contas_a_pagar_receber").insert(titulos);
  if (error) lancarErroSupabase(error);
}

export async function criarPedidoCompra(dados: PedidoCompraInput) {
  return comResultado(async () => {
    const supabase = await createClient();
    // O schema impõe o teto de 48 parcelas. Sem ele, um `parcelas: 1e8` vindo do cliente
    // fazia o `Array.from({ length })` alocar a lista inteira e derrubar o processo Node.
    const v = validar(pedidoCompraSchema, dados);
    await gravarPedido(supabase, v);
    revalidateTudo();
  });
}

export interface PedidoImportadoInput {
  fornecedor_id: string;
  frete: number;
  observacao: string | null;
  itens: ItemPedidoInput[];
}

/**
 * Importação de pedidos de compra (planilha). A tela já validou e mostrou a prévia; aqui
 * cada pedido passa de novo pelo mesmo schema do formulário antes de gravar.
 */
export async function importarPedidosCompra(
  pedidos: PedidoImportadoInput[],
  comum: { armazem_id: string | null; conta_id: string; forma_pagamento: string; data_primeiro_vencimento: string },
) {
  return comResultado(async () => {
    if (pedidos.length === 0) throw new Error("Nenhum pedido para importar.");
    if (pedidos.length > 200) throw new Error("Importe no máximo 200 pedidos por vez.");
    const supabase = await createClient();
    const hoje = hojeIsoBrasil();
    const criados: string[] = [];
    for (const p of pedidos) {
      const v = validar(pedidoCompraSchema, {
        fornecedor_id: p.fornecedor_id,
        armazem_id: comum.armazem_id,
        nf: null,
        nf_arquivo_path: null,
        data_pedido: hoje,
        data_entrega_prevista: null,
        forma_pagamento: comum.forma_pagamento,
        conta_id: comum.conta_id,
        // A planilha traz só um vencimento: vira uma parcela a pagar nessa data.
        parcelado: true,
        parcelas: 1,
        intervalo_dias: 30,
        data_primeiro_vencimento: comum.data_primeiro_vencimento,
        itens: p.itens,
      });
      const pedido = await gravarPedido(supabase, v, { frete: p.frete, observacao: p.observacao });
      criados.push(pedido.numero);
    }
    revalidateTudo();
    return { criados };
  });
}

export async function obterUrlNotaFiscal(caminho: string) {
  return comResultado(async () => {
    const supabase = await createClient();

    // Defesa em profundidade: hoje quem barra caminho alheio é só a policy
    // `notas_fiscais_select_own` do Storage, que compara a primeira pasta com o auth.uid().
    // Sem esta linha, relaxar aquela policy um dia viraria leitura de NF de outra conta —
    // e o parâmetro chega cru do navegador.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !caminho.startsWith(`${user.id}/`)) throw new Error("Nota fiscal não encontrada.");

    const { data, error } = await supabase.storage.from("notas-fiscais").createSignedUrl(caminho, 300);
    if (error) lancarErroSupabase(error);
    if (!data) throw new Error("Erro ao gerar link da nota fiscal.");
    return data.signedUrl;
  });
}

export async function marcarPedidoRecebido(pedidoId: string) {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.rpc("marcar_pedido_recebido", { p_pedido_id: pedidoId });
    if (error) lancarErroSupabase(error);
    revalidateTudo();
  });
}

const idSchema = z.string().uuid("Pedido inválido");
const recebimentoSchema = z.object({
  pedidoId: idSchema,
  armazemId: z.string().uuid().nullable(),
  itens: z.array(z.object({ item_id: z.string().uuid(), quantidade: z.number().int().min(0).max(1_000_000) })).max(500),
});

/**
 * Recebe o que chegou (0042): tudo ou parte de cada item, no armazém escolhido. O banco
 * decide se o pedido fica Parcial ou Completado e devolve o status.
 */
export async function receberPedidoCompra(dados: { pedidoId: string; armazemId: string | null; itens: { item_id: string; quantidade: number }[]; tudo: boolean }) {
  return comResultado(async () => {
    const v = validar(recebimentoSchema, dados);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("receber_pedido_compra", {
      p_pedido_id: v.pedidoId,
      p_itens: v.itens.filter((i) => i.quantidade > 0),
      p_armazem_id: v.armazemId,
    });
    // Sem a 0042 a RPC nova não existe: recebendo tudo, a antiga resolve; parcial não dá.
    if (error?.code === "PGRST202") {
      if (!dados.tudo) throw new Error("Receber só parte do pedido precisa da migração 0042 aplicada. Por enquanto, receba o pedido inteiro.");
      const antigo = await supabase.rpc("marcar_pedido_recebido", { p_pedido_id: v.pedidoId });
      if (antigo.error) lancarErroSupabase(antigo.error);
      revalidateTudo();
      return "recebido";
    }
    if (error) lancarErroSupabase(error);
    revalidateTudo();
    return (data as string | null) ?? "recebido";
  });
}

export async function cancelarPedidoCompra(pedidoId: string) {
  return comResultado(async () => {
    const id = validar(idSchema, pedidoId);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cancelar_pedido_compra", { p_pedido_id: id });
    if (error) lancarErroSupabase(error);
    revalidateTudo();
    return (data as number | null) ?? 0;
  });
}

/** Para comprar ↔ Em trânsito. Só entre esses dois: o resto muda por receber/cancelar. */
export async function definirTransitoPedido(pedidoId: string, emTransito: boolean) {
  return comResultado(async () => {
    const id = validar(idSchema, pedidoId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("pedidos_compra")
      .update({ status: emTransito ? "em_transito" : "pendente" })
      .eq("id", id)
      .in("status", emTransito ? ["pendente"] : ["em_transito"])
      .select("id");
    if (error) lancarErroSupabase(error);
    if (!data?.length) throw new Error("Este pedido já mudou de situação. Atualize a página.");
    revalidateTudo();
  });
}

const nfeImportSchema = z.object({
  novo_fornecedor: z.object({ nome: z.string().trim().min(1).max(200), cnpj: z.string().trim().max(32) }).nullable(),
  frete: z.number().finite().min(0).max(10_000_000),
  chave: z.string().regex(/^\d{44}$/).nullable(),
  parcelas_nota: z
    .array(z.object({ valor: z.number().finite().positive().max(10_000_000), vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .max(48)
    .nullable(),
});

/**
 * Pedido de compra a partir do XML da NF-e do fornecedor (Fase 13.4). A tela já leu a nota e
 * a pessoa conferiu os vínculos; aqui: fornecedor (cria se for novo, pelo CNPJ), o pedido com
 * o nº da nota e as parcelas — as duplicatas da nota quando vieram, ou o pagamento escolhido.
 */
export async function importarNfeCompra(
  dados: Omit<PedidoCompraInput, "fornecedor_id"> & { fornecedor_id: string | null },
  nota: { novo_fornecedor: { nome: string; cnpj: string } | null; frete: number; chave: string | null; parcelas_nota: { valor: number; vencimento: string }[] | null },
) {
  return comResultado(async () => {
    const n = validar(nfeImportSchema, nota);
    const supabase = await createClient();
    let fornecedorId = dados.fornecedor_id;
    if (!fornecedorId) {
      if (!n.novo_fornecedor) throw new Error("Escolha o fornecedor.");
      const { data, error } = await supabase
        .from("fornecedores")
        .insert({ nome: n.novo_fornecedor.nome, cnpj: n.novo_fornecedor.cnpj, contato: "", telefone: "", cidade: "", prazo: "", status: "ativo" })
        .select("id")
        .single();
      if (error) lancarErroSupabase(error);
      fornecedorId = data!.id as string;
    }
    const v = validar(pedidoCompraSchema, { ...dados, fornecedor_id: fornecedorId });
    const pedido = await gravarPedido(supabase, v, {
      frete: n.frete,
      observacao: n.chave ? `NF-e ${n.chave}` : null,
      parcelasNota: n.parcelas_nota,
    });
    revalidateTudo();
    revalidatePath("/fornecedores");
    return { numero: pedido.numero as string };
  });
}

const nfeFotoSchema = z.object({
  mime: z.enum(["image/jpeg", "image/png", "image/webp"], { message: "Use foto JPG, PNG ou WebP." }),
  // A tela reduz a foto antes (≈ 1600 px): cabe no limite de 1 MB das Server Actions.
  base64: z
    .string()
    .min(100, "Foto vazia.")
    .max(950_000, "Foto grande demais. Tire de novo, mais perto da nota.")
    .regex(/^[A-Za-z0-9+/=]+$/, "Foto inválida."),
});

/**
 * Lê a NF-e pela foto do DANFE com a IA (onda C) e devolve o mesmo formato do XML. NÃO grava
 * nada: a tela mostra para conferir e segue o fluxo de importação de sempre.
 */
export async function lerNfePorFoto(dados: z.input<typeof nfeFotoSchema>) {
  return comResultado(async () => {
    const v = validar(nfeFotoSchema, dados);
    const supabase = await createClient();
    const bytes = Buffer.from(v.base64, "base64");
    const r = await gerarNfePelaFotoIA(supabase, { base64: v.base64, mime: v.mime, hash: createHash("sha256").update(bytes).digest("hex") });
    if (!r.ok) throw new Error(r.erro);
    return r.dado;
  });
}

const reposicaoSchema = z
  .array(z.object({ produto_id: z.string().uuid(), quantidade: z.number().int().min(1).max(1_000_000) }))
  .min(1, "Nada para repor.")
  .max(200, "Itens demais de uma vez.");

/**
 * Vixe com ações (onda C): repõe tudo o que está acabando de uma vez. Agrupa por fornecedor
 * do produto (ou o da última compra dele) e cria um pedido "Para comprar" para cada um, com o custo atual e uma parcela a
 * pagar em 30 dias (pendente, dá para editar), na primeira conta cadastrada. Produto sem
 * fornecedor fica de fora e volta na resposta, para a pessoa resolver.
 */
export async function criarPedidosReposicao(itens: z.input<typeof reposicaoSchema>) {
  return comResultado(async () => {
    const lista = validar(reposicaoSchema, itens);
    const supabase = await createClient();
    const ids = [...new Set(lista.map((i) => i.produto_id))];
    const [produtosRes, contasRes, fornecedoresRes, ultimasRes] = await Promise.all([
      supabase.from("produtos").select("id, nome, custo, fornecedor_id").in("id", ids),
      supabase.from("contas").select("id").order("criado_em").limit(1),
      supabase.from("fornecedores").select("id, nome"),
      // Sem fornecedor no cadastro: vale o da última compra daquele produto.
      supabase.from("pedidos_compra_itens").select("produto_id, pedidos_compra!inner(fornecedor_id, data_pedido, status)").in("produto_id", ids).neq("pedidos_compra.status", "cancelado").limit(2000),
    ]);
    if (produtosRes.error) lancarErroSupabase(produtosRes.error);
    const conta = (contasRes.data ?? [])[0]?.id as string | undefined;
    if (!conta) throw new Error("Cadastre uma conta (caixa ou banco) em Configurações antes de criar pedidos.");
    const fornecedores = new Map((fornecedoresRes.data ?? []).map((f) => [f.id as string, f as { id: string; nome: string }]));

    const ultimoFornecedor = new Map<string, { fornecedor: string; data: string }>();
    for (const l of (ultimasRes.data ?? []) as unknown as { produto_id: string; pedidos_compra: { fornecedor_id: string | null; data_pedido: string } | null }[]) {
      const pc = l.pedidos_compra;
      if (!pc?.fornecedor_id) continue;
      const atual = ultimoFornecedor.get(l.produto_id);
      if (!atual || pc.data_pedido > atual.data) ultimoFornecedor.set(l.produto_id, { fornecedor: pc.fornecedor_id, data: pc.data_pedido });
    }

    const qtd = new Map(lista.map((i) => [i.produto_id, i.quantidade]));
    const porFornecedor = new Map<string, { produto_id: string; produto_nome: string; quantidade: number; custo_unitario: number }[]>();
    const semFornecedor: string[] = [];
    for (const p of produtosRes.data ?? []) {
      const f = (p.fornecedor_id as string | null) ?? ultimoFornecedor.get(p.id as string)?.fornecedor ?? null;
      if (!f || !fornecedores.has(f)) {
        semFornecedor.push(p.nome as string);
        continue;
      }
      const l = porFornecedor.get(f) ?? [];
      l.push({ produto_id: p.id as string, produto_nome: String(p.nome).slice(0, 200), quantidade: qtd.get(p.id as string) ?? 1, custo_unitario: Math.max(0, Number(p.custo) || 0) });
      porFornecedor.set(f, l);
    }

    const hoje = hojeIsoBrasil();
    const criados: string[] = [];
    for (const [fornecedorId, itensPedido] of porFornecedor) {
      const venc = dataLocal(hoje);
      venc.setDate(venc.getDate() + 30);
      const v = validar(pedidoCompraSchema, {
        fornecedor_id: fornecedorId,
        armazem_id: null,
        nf: null,
        nf_arquivo_path: null,
        data_pedido: hoje,
        data_entrega_prevista: null,
        forma_pagamento: "A combinar",
        conta_id: conta,
        parcelado: true,
        parcelas: 1,
        intervalo_dias: 30,
        data_primeiro_vencimento: hojeIsoLocal(venc),
        itens: itensPedido,
      });
      const pedido = await gravarPedido(supabase, v, { observacao: "Criado pela Vixe (repor estoque)" });
      criados.push(`${pedido.numero} · ${fornecedores.get(fornecedorId)?.nome ?? "fornecedor"}`);
    }
    if (criados.length) revalidateTudo();
    return { criados, semFornecedor };
  });
}

import type { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { hojeIsoLocal } from "@/lib/format";
import {
  enderecoEmLinha,
  type ClienteComprovante,
  type DadosComprovante,
  type EmpresaComprovante,
  type ParcelaResumoFiado,
} from "@/lib/comprovante";

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface VendaBruta {
  numero: string;
  data_venda: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  status: "paga" | "fiado" | "cancelada";
  subtotal: number;
  desconto: number;
  valor_entrega: number;
  total: number;
  forma_pagamento: string | null;
  entrada_valor: number;
  entrada_forma: string | null;
  forma_pagamento_2: string | null;
  parcelas_cartao: number | null;
  taxa_maquineta_pct: number;
  taxa_maquineta_valor: number;
  total_parcelas_fiado: number | null;
  venda_itens: { produto_nome: string; quantidade: number; preco_unitario: number; garantia_dias: number | null }[];
}

/**
 * Monta tudo o que o comprovante da venda precisa, lendo do banco (nunca da tela): o que o
 * PDV tinha na memória não inclui empresa, endereço do cliente, garantia gravada, taxa de
 * maquineta nem parcelas. RLS garante que só volta venda do próprio usuário.
 *
 * Devolve `null` quando a venda não existe (ou não é dele).
 */
export async function carregarComprovante(supabase: Supabase, vendaId: string): Promise<DadosComprovante | null> {
  const { data: venda, error } = await supabase
    .from("vendas")
    .select(
      "numero, data_venda, cliente_id, cliente_nome, status, subtotal, desconto, valor_entrega, total, forma_pagamento, entrada_valor, entrada_forma, forma_pagamento_2, parcelas_cartao, taxa_maquineta_pct, taxa_maquineta_valor, total_parcelas_fiado, venda_itens(produto_nome, quantidade, preco_unitario, garantia_dias)",
    )
    .eq("id", vendaId)
    .maybeSingle<VendaBruta>();
  if (error) lancarErroSupabase(error);
  if (!venda) return null;

  const [perfilRes, clienteRes] = await Promise.all([
    supabase
      .from("perfil_negocio")
      .select("nome_negocio, cnpj, logo_url, telefone, email, instagram, cep, endereco, numero, bairro, cidade, uf")
      .maybeSingle(),
    venda.cliente_id
      ? supabase
          .from("clientes")
          .select("nome, whatsapp, email, cep, endereco, numero, complemento, bairro, cidade, uf")
          .eq("id", venda.cliente_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (perfilRes.error) lancarErroSupabase(perfilRes.error);
  if (clienteRes.error) lancarErroSupabase(clienteRes.error);

  const p = perfilRes.data;
  const empresa: EmpresaComprovante | null = p
    ? {
        nome: p.nome_negocio,
        cnpj: p.cnpj,
        logoUrl: p.logo_url,
        telefone: p.telefone,
        email: p.email,
        instagram: p.instagram,
        enderecoLinha: enderecoEmLinha(p),
      }
    : null;

  const c = clienteRes.data;
  const cliente: ClienteComprovante | null = c
    ? { nome: c.nome, whatsapp: c.whatsapp, email: c.email, enderecoLinha: enderecoEmLinha(c) }
    : null;

  const parcelas = venda.status === "fiado" ? await carregarParcelas(supabase, vendaId, venda) : [];

  return {
    numero: venda.numero,
    data: venda.data_venda,
    status: venda.status,
    itens: venda.venda_itens.map((i) => ({
      nome: i.produto_nome,
      quantidade: i.quantidade,
      preco_unitario: i.preco_unitario,
      garantia_dias: i.garantia_dias,
    })),
    subtotal: venda.subtotal,
    desconto: venda.desconto,
    valorEntrega: venda.valor_entrega,
    total: venda.total,
    formaPagamento: venda.forma_pagamento,
    clienteNome: venda.cliente_nome,
    empresa,
    cliente,
    pagamento: {
      entradaValor: venda.entrada_valor,
      entradaForma: venda.entrada_forma,
      formaPagamento2: venda.forma_pagamento_2,
      parcelasCartao: venda.parcelas_cartao,
      taxaMaquinetaPct: venda.taxa_maquineta_pct,
      taxaMaquinetaValor: venda.taxa_maquineta_valor,
    },
    parcelas,
  };
}

async function carregarParcelas(supabase: Supabase, vendaId: string, venda: VendaBruta): Promise<ParcelaResumoFiado[]> {
  const hoje = hojeIsoLocal();
  const situacao = (paga: boolean, vencimento: string): ParcelaResumoFiado["status"] =>
    paga ? "paga" : vencimento < hoje ? "atrasada" : "pendente";

  if ((venda.total_parcelas_fiado ?? 1) > 1) {
    const { data, error } = await supabase.rpc("parcelas_da_venda", { p_venda_id: vendaId });
    if (error) lancarErroSupabase(error);
    return ((data ?? []) as { numero: number; total_parcelas: number; valor: number; status: string; data_vencimento: string }[]).map(
      (r) => ({
        numero: r.numero,
        totalParcelas: r.total_parcelas,
        valor: r.valor,
        status: situacao(r.status === "paga", r.data_vencimento),
        dataVencimento: r.data_vencimento,
      }),
    );
  }

  // Fiado sem parcelamento: a dívida inteira é uma "parcela" só, com o vencimento da conta a receber.
  const { data, error } = await supabase
    .from("contas_a_pagar_receber")
    .select("valor, data_vencimento, status")
    .eq("referencia_venda_id", vendaId)
    .maybeSingle();
  if (error) lancarErroSupabase(error);
  if (!data) return [];
  return [
    {
      numero: 1,
      totalParcelas: 1,
      valor: data.valor,
      status: situacao(data.status === "recebido", data.data_vencimento),
      dataVencimento: data.data_vencimento,
    },
  ];
}

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { ClienteDetalheClient, type ClienteDetalhe, type VendaCliente } from "./ClienteDetalheClient";

interface VendaBruta {
  id: string;
  numero: string;
  data_venda: string;
  forma_pagamento: string | null;
  status: "paga" | "fiado" | "cancelada";
  subtotal: number;
  desconto: number;
  valor_entrega: number;
  total: number;
  custo_total: number;
  lucro: number;
  status_envio: "separacao" | "enviado" | "concluido" | null;
  total_parcelas_fiado: number | null;
  venda_itens: { produto_nome: string; quantidade: number; preco_unitario: number; custo_unitario: number }[];
}

interface CprBruta {
  referencia_venda_id: string;
  status: "pendente" | "pago" | "recebido";
  data_vencimento: string;
  valor: number;
}

interface ParcelaBruta {
  venda_id: string;
  status: "pendente" | "paga";
  data_pagamento: string | null;
}

export default async function ClienteDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [clienteRes, vendasRes, contasRes, fiadoEmUsoRes, perfilRes] = await Promise.all([
    supabase
      .from("clientes")
      .select("id, nome, whatsapp, email, permite_fiado, limite_fiado, status")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("vendas")
      .select(
        "id, numero, data_venda, forma_pagamento, status, subtotal, desconto, valor_entrega, total, custo_total, lucro, status_envio, total_parcelas_fiado, venda_itens(produto_nome, quantidade, preco_unitario, custo_unitario)",
      )
      .eq("cliente_id", id)
      .order("data_venda", { ascending: false }),
    supabase.from("contas").select("id, nome, saldo, detalhe").order("nome"),
    supabase.rpc("fiado_em_uso_cliente", { p_cliente_id: id }),
    supabase.from("perfil_negocio").select("nome_negocio").maybeSingle(),
  ]);

  if (clienteRes.error) lancarErroSupabase(clienteRes.error);
  if (!clienteRes.data) notFound();
  if (vendasRes.error) lancarErroSupabase(vendasRes.error);

  const vendasBrutas = (vendasRes.data ?? []) as VendaBruta[];
  const vendaIds = vendasBrutas.map((v) => v.id);
  const vendaIdsParcelados = vendasBrutas
    .filter((v) => v.total_parcelas_fiado && v.total_parcelas_fiado > 1)
    .map((v) => v.id);

  const [cprRes, parcelasRes] = await Promise.all([
    vendaIds.length > 0
      ? supabase
          .from("contas_a_pagar_receber")
          .select("referencia_venda_id, status, data_vencimento, valor")
          .in("referencia_venda_id", vendaIds)
      : Promise.resolve({ data: [] as CprBruta[], error: null }),
    vendaIdsParcelados.length > 0
      ? supabase.from("venda_parcelas").select("venda_id, status, data_pagamento").in("venda_id", vendaIdsParcelados)
      : Promise.resolve({ data: [] as ParcelaBruta[], error: null }),
  ]);

  if (cprRes.error) lancarErroSupabase(cprRes.error);
  if (parcelasRes.error) lancarErroSupabase(parcelasRes.error);

  const cprPorVenda = new Map<string, { status: string; data_vencimento: string; valor: number }>();
  for (const c of (cprRes.data ?? []) as CprBruta[]) {
    cprPorVenda.set(c.referencia_venda_id, { status: c.status, data_vencimento: c.data_vencimento, valor: c.valor });
  }

  const parcelasPorVenda = new Map<string, ParcelaBruta[]>();
  for (const p of (parcelasRes.data ?? []) as ParcelaBruta[]) {
    const lista = parcelasPorVenda.get(p.venda_id) ?? [];
    lista.push(p);
    parcelasPorVenda.set(p.venda_id, lista);
  }

  const vendas: VendaCliente[] = vendasBrutas.map((v) => {
    const cpr = cprPorVenda.get(v.id) ?? null;
    const parcelas = parcelasPorVenda.get(v.id) ?? null;
    return {
      id: v.id,
      numero: v.numero,
      data_venda: v.data_venda,
      forma_pagamento: v.forma_pagamento,
      status: v.status,
      subtotal: v.subtotal,
      desconto: v.desconto,
      valor_entrega: v.valor_entrega,
      total: v.total,
      custo_total: v.custo_total,
      lucro: v.lucro,
      status_envio: v.status_envio,
      total_parcelas_fiado: v.total_parcelas_fiado,
      venda_itens: v.venda_itens,
      cpr_status: cpr?.status ?? null,
      cpr_data_vencimento: cpr?.data_vencimento ?? null,
      cpr_valor: cpr?.valor ?? null,
      parcelas_pagas_datas: parcelas ? parcelas.filter((p) => p.status === "paga").map((p) => p.data_pagamento!) : null,
      parcelas_pendentes: parcelas ? parcelas.some((p) => p.status === "pendente") : null,
    };
  });

  const cliente: ClienteDetalhe = clienteRes.data;

  return (
    <ClienteDetalheClient
      cliente={cliente}
      vendas={vendas}
      contas={contasRes.data ?? []}
      fiadoEmUso={Number(fiadoEmUsoRes.data ?? 0)}
      nomeNegocio={perfilRes.data?.nome_negocio ?? null}
    />
  );
}

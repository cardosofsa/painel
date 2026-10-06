import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeIsoBrasil } from "@/lib/format";
import { ROTULO_ETAPA, type Etapa } from "@/lib/pedidos-central";
import { crediarioDoPerfil } from "@/lib/crediario-servidor";
import { mensagensPendentes, type MensagemPendente, type ResumoDia } from "@/lib/whatsapp";

/** Dados de Vixe → Mensagens (11.6): o que avisar aos clientes e o resumo do dia. SERVIDOR. */
export interface DadosMensagens {
  loja: string;
  whatsappDono: string | null;
  mensagens: MensagemPendente[];
  resumo: ResumoDia;
  /** false = 0061 ainda não aplicada (não dá para lembrar o que já foi enviado). */
  registroOk: boolean;
}

const PENDENTES: Etapa[] = ["reservar", "emitir", "enviar", "imprimir", "retirada"];

type VendaBruta = { id: string; numero: string; total: number; lucro: number; etapa: string | null; status: string; rastreio?: string | null; logistica?: string | null; data_venda: string; clientes: { nome: string; whatsapp: string | null } | null };
type ParcelaBruta = { id: string; numero: number; total_parcelas: number; valor: number; data_vencimento: string; vendas: { numero: string; status: string; clientes: { nome: string; whatsapp: string | null } | null } | null };
type PedidoBruto = { id: string; numero: string; cliente_nome: string; cliente_whatsapp: string; total: number; status: string; criado_em: string; venda_id: string | null };

/**
 * Avisos de WhatsApp pendentes (sem o resumo do dia). Usado também pelo sino do topo, que
 * mostra cada um como notificação: enviar ou pular grava em `mensagens_enviadas` e ele sai
 * dos dois lugares.
 */
export async function carregarAvisosWhatsapp(supabase: SupabaseClient, agora = new Date()) {
  const hoje = hojeIsoBrasil(agora);
  const desde = new Date(agora);
  desde.setDate(desde.getDate() - 15);
  const limiteFiado = new Date(agora);
  limiteFiado.setDate(limiteFiado.getDate() + 2);

  const [perfilRes, pedidosRes, vendasRes, parcelasRes, enviadasRes, unicasRes] = await Promise.all([
    // `*`: Pix e multa/juros (0065) entram na cobrança quando existem.
    supabase.from("perfil_negocio").select("*").maybeSingle(),
    supabase.from("pedidos_vitrine").select("id, numero, cliente_nome, cliente_whatsapp, total, status, criado_em, venda_id").gte("criado_em", desde.toISOString()).limit(500),
    supabase.from("vendas").select("*, clientes(nome, whatsapp)").gte("data_venda", desde.toISOString()).order("data_venda", { ascending: false }).limit(1000),
    supabase
      .from("venda_parcelas")
      .select("id, numero, total_parcelas, valor, data_vencimento, vendas!inner(numero, status, clientes(nome, whatsapp))")
      .eq("status", "pendente")
      .lte("data_vencimento", hojeIsoBrasil(limiteFiado))
      .limit(500),
    supabase.from("mensagens_enviadas").select("chave").gte("enviada_em", new Date(agora.getTime() - 60 * 86_400_000).toISOString()),
    // Crediário de parcela única não tem `venda_parcelas`: é a própria conta a receber.
    // `*`: valor_pago (recebido em parte) só a partir da 0064.
    supabase
      .from("contas_a_pagar_receber")
      .select("*, vendas!inner(numero, status, total_parcelas_fiado, clientes(nome, whatsapp))")
      .eq("tipo", "receber")
      .eq("status", "pendente")
      .not("referencia_venda_id", "is", null)
      .lte("data_vencimento", hojeIsoBrasil(limiteFiado))
      .limit(500),
  ]);

  const loja = (perfilRes.data?.nome_negocio as string | null) || "nossa loja";
  const pedidos = (pedidosRes.data ?? []) as PedidoBruto[];
  const doCatalogo = new Set(pedidos.map((p) => p.venda_id).filter((v): v is string => !!v));
  const vendas = (vendasRes.data ?? []) as VendaBruta[];
  type UnicaBruta = { id: string; valor: number; valor_pago?: number | null; data_vencimento: string; vendas: { numero: string; status: string; total_parcelas_fiado: number | null; clientes: { nome: string; whatsapp: string | null } | null } | null };
  const unicas: ParcelaBruta[] = ((unicasRes.data ?? []) as unknown as UnicaBruta[])
    .filter((c) => c.vendas && (c.vendas.total_parcelas_fiado ?? 1) <= 1)
    .map((c) => ({
      id: c.id,
      numero: 1,
      total_parcelas: 1,
      valor: Number(c.valor) - Number(c.valor_pago ?? 0),
      data_vencimento: c.data_vencimento,
      vendas: c.vendas ? { numero: c.vendas.numero, status: c.vendas.status, clientes: c.vendas.clientes } : null,
    }));
  const parcelas = [...((parcelasRes.data ?? []) as unknown as ParcelaBruta[]), ...unicas].filter((p) => p.vendas && p.vendas.status !== "cancelada" && p.valor > 0);

  const mensagens = mensagensPendentes(
    {
      loja,
      hoje,
      crediario: crediarioDoPerfil(perfilRes.data as Record<string, unknown> | null),
      pedidosCatalogo: pedidos.map((p) => ({ ...p, total: Number(p.total) })),
      vendas: vendas.map((v) => ({
        id: v.id,
        numero: v.numero,
        cliente: v.clientes?.nome ?? null,
        whatsapp: v.clientes?.whatsapp ?? null,
        total: Number(v.total),
        etapa: v.etapa,
        status: v.status,
        rastreio: v.rastreio ?? null,
        logistica: v.logistica ?? null,
        data: v.data_venda,
        doCatalogo: doCatalogo.has(v.id),
      })),
      parcelas: parcelas.map((p) => ({
        id: p.id,
        venda_numero: p.vendas!.numero,
        cliente: p.vendas!.clientes?.nome ?? null,
        whatsapp: p.vendas!.clientes?.whatsapp ?? null,
        valor: Number(p.valor),
        vencimento: p.data_vencimento,
        numero: p.numero,
        total_parcelas: p.total_parcelas,
      })),
    },
    new Set(((enviadasRes.data ?? []) as { chave: string }[]).map((e) => e.chave)),
  );

  return {
    loja,
    whatsappDono: (perfilRes.data?.whatsapp as string | null) ?? null,
    mensagens,
    registroOk: !enviadasRes.error,
    hoje,
    pedidos,
    vendas,
    parcelas,
  };
}

export async function carregarMensagens(supabase: SupabaseClient): Promise<DadosMensagens> {
  const [base, mktRes, produtosRes] = await Promise.all([
    carregarAvisosWhatsapp(supabase),
    supabase.from("pedidos_marketplace").select("status, status_original").eq("status", "a_enviar"),
    supabase.from("produtos").select("nome, estoque, estoque_minimo, ativo").eq("ativo", true),
  ]);
  const { loja, whatsappDono, mensagens, registroOk, hoje, pedidos, vendas, parcelas } = base;

  const deHoje = vendas.filter((v) => v.status !== "cancelada" && hojeIsoBrasil(new Date(v.data_venda)) === hoje);
  const parados = PENDENTES.map((e) => ({ etapa: ROTULO_ETAPA[e], n: vendas.filter((v) => v.status !== "cancelada" && v.etapa === e).length }));
  const mkt = (mktRes.data ?? []) as { status_original: string | null }[];
  const naoProcessados = mkt.filter((m) => !/processed|printed/i.test(m.status_original ?? "")).length;
  if (naoProcessados) parados.push({ etapa: "Marketplace a enviar", n: naoProcessados });
  const aConfirmar = pedidos.filter((p) => p.status === "pendente").length;
  if (aConfirmar) parados.unshift({ etapa: "Catálogo a confirmar", n: aConfirmar });

  return {
    loja,
    whatsappDono,
    mensagens,
    registroOk,
    resumo: {
      data: hoje,
      vendas: deHoje.length,
      faturamento: deHoje.reduce((s, v) => s + Number(v.total), 0),
      lucro: deHoje.reduce((s, v) => s + Number(v.lucro ?? 0), 0),
      parados,
      acabando: ((produtosRes.data ?? []) as { nome: string; estoque: number; estoque_minimo: number }[]).filter((p) => p.estoque <= p.estoque_minimo).map((p) => p.nome),
      aReceberHoje: parcelas.filter((p) => p.data_vencimento === hoje).reduce((s, p) => s + Number(p.valor), 0),
    },
  };
}

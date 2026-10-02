import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeIsoLocal } from "@/lib/format";
import { ROTULO_ETAPA, type Etapa } from "@/lib/pedidos-central";
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

export async function carregarMensagens(supabase: SupabaseClient): Promise<DadosMensagens> {
  const agora = new Date();
  const hoje = hojeIsoLocal(agora);
  const desde = new Date(agora);
  desde.setDate(desde.getDate() - 15);
  const limiteFiado = new Date(agora);
  limiteFiado.setDate(limiteFiado.getDate() + 2);

  const [perfilRes, pedidosRes, vendasRes, parcelasRes, enviadasRes, mktRes, produtosRes] = await Promise.all([
    supabase.from("perfil_negocio").select("nome_negocio, whatsapp").maybeSingle(),
    supabase.from("pedidos_vitrine").select("id, numero, cliente_nome, cliente_whatsapp, total, status, criado_em, venda_id").gte("criado_em", desde.toISOString()).limit(500),
    supabase.from("vendas").select("*, clientes(nome, whatsapp)").gte("data_venda", desde.toISOString()).order("data_venda", { ascending: false }).limit(1000),
    supabase
      .from("venda_parcelas")
      .select("id, numero, total_parcelas, valor, data_vencimento, vendas!inner(numero, status, clientes(nome, whatsapp))")
      .eq("status", "pendente")
      .lte("data_vencimento", limiteFiado.toISOString().slice(0, 10))
      .limit(500),
    supabase.from("mensagens_enviadas").select("chave").gte("enviada_em", new Date(agora.getTime() - 60 * 86_400_000).toISOString()),
    supabase.from("pedidos_marketplace").select("status, status_original").eq("status", "a_enviar"),
    supabase.from("produtos").select("nome, estoque, estoque_minimo, ativo").eq("ativo", true),
  ]);

  const loja = (perfilRes.data?.nome_negocio as string | null) || "nossa loja";
  const pedidos = (pedidosRes.data ?? []) as { id: string; numero: string; cliente_nome: string; cliente_whatsapp: string; total: number; status: string; criado_em: string; venda_id: string | null }[];
  const doCatalogo = new Set(pedidos.map((p) => p.venda_id).filter((v): v is string => !!v));
  type VendaBruta = { id: string; numero: string; total: number; lucro: number; etapa: string | null; status: string; rastreio?: string | null; logistica?: string | null; data_venda: string; clientes: { nome: string; whatsapp: string | null } | null };
  const vendas = (vendasRes.data ?? []) as VendaBruta[];
  type ParcelaBruta = { id: string; numero: number; total_parcelas: number; valor: number; data_vencimento: string; vendas: { numero: string; status: string; clientes: { nome: string; whatsapp: string | null } | null } | null };
  const parcelas = ((parcelasRes.data ?? []) as unknown as ParcelaBruta[]).filter((p) => p.vendas && p.vendas.status !== "cancelada");

  const mensagens = mensagensPendentes(
    {
      loja,
      hoje,
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

  const deHoje = vendas.filter((v) => v.status !== "cancelada" && hojeIsoLocal(new Date(v.data_venda)) === hoje);
  const parados = PENDENTES.map((e) => ({ etapa: ROTULO_ETAPA[e], n: vendas.filter((v) => v.status !== "cancelada" && v.etapa === e).length }));
  const mkt = (mktRes.data ?? []) as { status_original: string | null }[];
  const naoProcessados = mkt.filter((m) => !/processed|printed/i.test(m.status_original ?? "")).length;
  if (naoProcessados) parados.push({ etapa: "Marketplace a enviar", n: naoProcessados });
  const aConfirmar = pedidos.filter((p) => p.status === "pendente").length;
  if (aConfirmar) parados.unshift({ etapa: "Catálogo a confirmar", n: aConfirmar });

  return {
    loja,
    whatsappDono: (perfilRes.data?.whatsapp as string | null) ?? null,
    mensagens,
    registroOk: !enviadasRes.error,
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

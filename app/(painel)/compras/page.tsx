import { carregarCamposCartao, contasParaSaida } from "@/lib/contas-cartao-servidor";
import { createClient } from "@/lib/supabase/server";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import { hojeIsoBrasil, hojeIsoLocal } from "@/lib/format";
import { quantidadeSugeridaCompra } from "@/lib/alertas";
import { ComprasClient, type ItemPedido, type Pedido } from "./ComprasClient";
import { resumoPagamento } from "@/lib/pagamentos";
import { diasDoPrazo, faltaReceber, statusAberto, sugestaoCompras } from "@/lib/compras";
import { preverDemanda, vendasPorSemana, type Tendencia } from "@/lib/demanda";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Compras" };

/** Janela máxima carregada; os filtros de período da tela recortam daqui. */
const DIAS_JANELA = 90;

// Leitura da NF-e pela foto (IA com visão) leva até ~40 s.
export const maxDuration = 60;

export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ novo?: string; busca?: string }> }) {
  const { novo, busca } = await searchParams;
  const supabase = await createClient();
  const camposCartaoPromessa = carregarCamposCartao(supabase);

  const inicio = new Date();
  inicio.setDate(inicio.getDate() - DIAS_JANELA);
  const inicioJanela = hojeIsoLocal(inicio);

  const [
    pedidosRes,
    fornecedoresAtivosRes,
    fornecedoresTodosRes,
    produtosRes,
    armazensRes,
    contasRes,
    formasPagamentoRes,
    titulosRes,
    gruposRes,
  ] = await Promise.all([
      // Janela de 90 dias, igual ao que /vendas já faz. Sem ela esta consulta trazia todo
      // pedido de compra já feito com os itens aninhados — o payload mais pesado do app —
      // e os filtros "Últimos 7 dias / Este mês" eram aplicados no cliente depois de
      // baixar tudo. Pedido pendente antigo entra na janela de qualquer jeito (ver abaixo).
      supabase
        .from("pedidos_compra")
        // `*`: frete, observação e quantidade_recebida só existem a partir da 0042.
        .select("*, pedidos_compra_itens(*)")
        .or(`data_pedido.gte.${inicioJanela},status.in.(pendente,em_transito,parcial)`)
        .order("data_pedido", { ascending: false })
        .limit(500),
      supabase.from("fornecedores").select("id, nome").eq("status", "ativo").order("nome"),
      supabase.from("fornecedores").select("id, nome, cnpj, prazo"),
      supabase
        .from("produtos")
        .select("id, sku, nome, custo, grupo_id, variante_nome, fornecedor_id, estoque, estoque_minimo, saida_media_semanal, ativo, codigo_barras")
        .order("nome"),
      supabase.from("armazens").select("id, nome").order("nome"),
      supabase.from("contas").select("id, nome, saldo").order("nome"),
      supabase.from("formas_pagamento").select("id, nome").order("nome"),
      // `*`: valor_pago só existe a partir da 0064 (antes, conta 0 até quitar).
      supabase.from("contas_a_pagar_receber").select("*").not("referencia_pedido_compra_id", "is", null),
      supabase.from("produto_grupos").select("id, nome"),
    ]);

  if (pedidosRes.error) throw new Error(pedidosRes.error.message);
  if (fornecedoresAtivosRes.error) throw new Error(fornecedoresAtivosRes.error.message);
  if (fornecedoresTodosRes.error) throw new Error(fornecedoresTodosRes.error.message);
  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);
  if (contasRes.error) throw new Error(contasRes.error.message);
  const camposCartao = await camposCartaoPromessa;
  if (formasPagamentoRes.error) throw new Error(formasPagamentoRes.error.message);
  if (titulosRes.error) throw new Error(titulosRes.error.message);
  if (gruposRes.error) throw new Error(gruposRes.error.message);

  // O seletor de item renderiza só `nome`: sem o rótulo composto, três variantes
  // viram três opções com texto idêntico e a entrada de estoque vai pro SKU errado.
  const grupos = mapaGrupos(gruposRes.data ?? []);
  const produtos = (produtosRes.data ?? []).map((p) => comRotulo(p, grupos));

  const fornecedoresPorId = new Map((fornecedoresTodosRes.data ?? []).map((f) => [f.id, f]));
  const armazensPorId = new Map((armazensRes.data ?? []).map((a) => [a.id, a.nome]));
  const contasPorId = new Map((contasRes.data ?? []).map((c) => [c.id, c.nome]));
  const contaIdPorPedidoId = new Map(
    (titulosRes.data ?? [])
      .filter((t) => t.referencia_pedido_compra_id && t.conta_id)
      .map((t) => [t.referencia_pedido_compra_id as string, t.conta_id as string]),
  );
  // Parcelas de cada pedido → resumo do pagamento (quitadas, em aberto, atraso).
  const hoje = hojeIsoBrasil();
  const parcelasPorPedido = new Map<string, { status: "pendente" | "pago" | "recebido"; valor: number; valor_pago: number; data_vencimento: string }[]>();
  for (const t of titulosRes.data ?? []) {
    const lista = parcelasPorPedido.get(t.referencia_pedido_compra_id) ?? [];
    const pago = t.status === "pendente" ? Number(t.valor_pago ?? 0) : Number(t.valor_pago || t.valor);
    lista.push({ status: t.status, valor: Number(t.valor), valor_pago: pago, data_vencimento: t.data_vencimento });
    parcelasPorPedido.set(t.referencia_pedido_compra_id, lista);
  }

  const pedidos: Pedido[] = (pedidosRes.data ?? []).map((p) => {
    const fornecedor = p.fornecedor_id ? fornecedoresPorId.get(p.fornecedor_id) : undefined;
    return {
      id: p.id,
      numero: p.numero,
      fornecedor_id: p.fornecedor_id,
      fornecedor_nome: fornecedor?.nome ?? "—",
      cnpj: fornecedor?.cnpj ?? null,
      armazem_id: p.armazem_id,
      armazem_nome: (p.armazem_id && armazensPorId.get(p.armazem_id)) ?? null,
      nf: p.nf,
      nf_arquivo_path: p.nf_arquivo_path,
      valor_total: p.valor_total,
      status: p.status,
      frete: p.frete ?? 0,
      observacao: p.observacao ?? null,
      data_pedido: p.data_pedido,
      data_entrega_prevista: p.data_entrega_prevista,
      data_recebimento: p.data_recebimento,
      forma_pagamento: p.forma_pagamento,
      parcelas: p.parcelas,
      conta_nome: (contaIdPorPedidoId.get(p.id) && contasPorId.get(contaIdPorPedidoId.get(p.id)!)) ?? null,
      pagamento: parcelasPorPedido.has(p.id) ? resumoPagamento(parcelasPorPedido.get(p.id)!, hoje) : null,
      itens: ((p.pedidos_compra_itens ?? []) as ItemPedido[]).map((i) => ({
        ...i,
        // Antes da 0042 não há `quantidade_recebida`: pedido recebido = tudo chegou.
        quantidade_recebida: i.quantidade_recebida ?? (p.status === "recebido" ? i.quantidade : 0),
      })),
    };
  });

  // Vindo do sino de alertas (?novo=<produto>): abre o pedido de compra já com o produto, a
  // quantidade sugerida e o fornecedor do cadastro (se ele ainda estiver ativo).
  const origem = novo ? (produtosRes.data ?? []).find((p) => p.id === novo) : undefined;
  const rotulado = origem ? produtos.find((p) => p.id === origem.id) : undefined;
  const pedidoInicial =
    origem && rotulado
      ? {
          fornecedorId: (fornecedoresAtivosRes.data ?? []).some((f) => f.id === origem.fornecedor_id) ? origem.fornecedor_id : null,
          item: {
            produto_id: origem.id,
            produto_nome: rotulado.nome,
            quantidade: quantidadeSugeridaCompra(origem),
            custo_unitario: origem.custo,
          },
        }
      : null;

  // Ritmo real (11.5): o que saiu nas últimas 12 semanas em todos os canais; kit conta nos
  // itens. A previsão de demanda (lib/demanda.ts) segue a tendência semana a semana.
  const SEMANAS = 12;
  const agora = new Date();
  const inicioRitmo = new Date(agora);
  inicioRitmo.setDate(inicioRitmo.getDate() - SEMANAS * 7);
  const desde = inicioRitmo.toISOString();
  const [vendidoRes, mktRes, kitsRes] = await Promise.all([
    supabase.from("venda_itens").select("produto_id, quantidade, vendas!inner(data_venda, status)").gte("vendas.data_venda", desde).neq("vendas.status", "cancelada").limit(20000),
    supabase
      .from("pedidos_marketplace_itens")
      .select("produto_id, quantidade, pedidos_marketplace!inner(criado_em_plataforma, status)")
      .gte("pedidos_marketplace.criado_em_plataforma", desde)
      .in("pedidos_marketplace.status", ["a_enviar", "enviado", "concluido"])
      .limit(20000),
    supabase.from("produtos").select("*").eq("e_kit", true),
  ]);
  const kits = new Map(
    (kitsRes.error ? [] : (kitsRes.data ?? [])).map((k) => [
      k.id as string,
      ((k.insumos ?? []) as { produtoId?: string | null; quantidade: number }[]).filter((i) => i.produtoId).map((i) => ({ produto_id: i.produtoId as string, quantidade: Math.ceil(i.quantidade) })),
    ]),
  );
  type LinhaVendida = { produto_id: string | null; quantidade: number; vendas?: { data_venda: string } | null };
  type LinhaMkt = { produto_id: string | null; quantidade: number; pedidos_marketplace?: { criado_em_plataforma: string } | null };
  const series = vendasPorSemana(
    [
      ...((vendidoRes.data ?? []) as unknown as LinhaVendida[]).map((v) => ({ produto_id: v.produto_id, quantidade: v.quantidade, data: v.vendas?.data_venda ?? null })),
      ...(mktRes.error ? [] : ((mktRes.data ?? []) as unknown as LinhaMkt[])).map((v) => ({
        produto_id: v.produto_id,
        quantidade: v.quantidade,
        data: v.pedidos_marketplace?.criado_em_plataforma ?? null,
      })),
    ],
    SEMANAS,
    agora,
    kits,
  );
  const consumo = new Map<string, number>();
  const tendencia = new Map<string, Tendencia>();
  for (const [id, serie] of series) {
    const p = preverDemanda(serie);
    if (p.porDia > 0) consumo.set(id, p.porDia);
    if (p.semanasComVenda >= 3) tendencia.set(id, p.tendencia);
  }
  const prazoPorFornecedor = new Map((fornecedoresTodosRes.data ?? []).map((f) => [f.id as string, diasDoPrazo((f as { prazo?: string | null }).prazo)]));

  // Sugestão de compra: desconta o que já foi pedido e ainda não chegou.
  const emAberto = new Map<string, number>();
  for (const p of pedidos) {
    if (!statusAberto(p.status)) continue;
    for (const i of p.itens) if (i.produto_id) emAberto.set(i.produto_id, (emAberto.get(i.produto_id) ?? 0) + faltaReceber(i));
  }
  const sugestao = sugestaoCompras(
    (produtosRes.data ?? [])
      .filter((p) => p.ativo !== false)
      .map((p) => ({ ...p, nome: produtos.find((x) => x.id === p.id)?.nome ?? p.nome })),
    emAberto,
    14,
    { consumo, prazoPorFornecedor, coberturaAlvo: 30 },
  ).map((l) => ({ ...l, tendencia: l.ritmo === "vendas" ? tendencia.get(l.produto.id) : undefined }));

  // NF-e pela foto (onda C) precisa de uma IA com visão; sem IA o botão não aparece.
  const iaDisponivel = await iaDisponivelParaConta(supabase);

  return (
    <ComprasClient
      iaDisponivel={iaDisponivel}
      key={busca ?? "inicio"}
      buscaInicial={busca?.slice(0, 80) ?? ""}
      sugestao={sugestao}
      pedidoInicial={pedidoInicial}
      pedidos={pedidos}
      fornecedores={fornecedoresAtivosRes.data ?? []}
      // XML da NF-e: o fornecedor é achado pelo CNPJ (inclusive inativo, que volta a valer).
      cnpjFornecedores={(fornecedoresTodosRes.data ?? []).filter((f) => f.cnpj).map((f) => ({ id: f.id, nome: f.nome, cnpj: f.cnpj as string }))}
      produtos={produtos}
      armazens={armazensRes.data ?? []}
      contas={contasParaSaida((contasRes.data ?? []).map((c) => ({ id: c.id, nome: c.nome })), camposCartao, new Map((contasRes.data ?? []).map((c) => [c.id, Number(c.saldo)])))}
      formasPagamento={formasPagamentoRes.data ?? []}
    />
  );
}

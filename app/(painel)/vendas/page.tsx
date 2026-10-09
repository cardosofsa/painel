import { carregarCamposCartao, semCartoes } from "@/lib/contas-cartao-servidor";
import { createClient } from "@/lib/supabase/server";
import { carregarPedidosVitrine } from "@/lib/pedidos-vitrine-servidor";
import { carregarPedidosMarketplace } from "@/lib/marketplace/pedidos-servidor";
import { carregarRetornos } from "@/lib/marketplace/retornos-servidor";
import { buscarEmLotes } from "@/lib/lotes";
import { credenciaisShopee, faltandoShopee } from "@/lib/marketplace/shopee-api";
import { credenciaisML } from "@/lib/marketplace/mercadolivre-api";
import { cofreDisponivel } from "@/lib/ia/cofre";
import { rotuloProduto } from "@/lib/produtos";
import { VendasClient, type Venda } from "./VendasClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Vendas" };

/** Janela máxima carregada; os filtros de período da tela recortam daqui. */
const DIAS_JANELA = 120;

export default async function VendasPage({ searchParams }: { searchParams: Promise<{ pedido?: string; shopee?: string; busca?: string }> }) {
  const { pedido, shopee, busca } = await searchParams;
  const supabase = await createClient();

  const inicio = new Date();
  inicio.setDate(inicio.getDate() - DIAS_JANELA);

  const camposCartaoPromessa = carregarCamposCartao(supabase);
  const [vendasRes, formasRes, pedidos, clientesPdvRes, contasRes, formasPdvRes, marketplace, lojasRes, produtosRes, perfilRes, disponivelRes] = await Promise.all([
    // O PostgREST corta em 1000 linhas sem avisar: lê a janela inteira em lotes.
    buscarEmLotes((de, ate) =>
      supabase
        .from("vendas")
        // `*`: etapa e logística só existem a partir da 0047.
        .select("*, clientes(cidade, uf), venda_itens(produto_nome, produto_sku, quantidade, preco_unitario, custo_unitario, garantia_dias)", { count: "exact" })
        .gte("data_venda", inicio.toISOString())
        .order("data_venda", { ascending: false })
        .order("id")
        .range(de, ate),
      { maximo: 20000 },
    ),
    supabase.from("formas_pagamento").select("nome").order("nome"),
    // Pedidos do catálogo moram em Vendas desde a 8.6.
    carregarPedidosVitrine(supabase),
    // Clientes ativos: uma consulta só serve a lista (id, nome, WhatsApp) e as três abaixo
    // que alimentam o CheckoutModal do PDV, reaproveitado para fechar o pedido. Antes a
    // mesma tabela era lida duas vezes.
    supabase.from("clientes").select("id, nome, whatsapp, permite_fiado, limite_fiado").eq("status", "ativo").order("nome"),
    supabase.from("contas").select("id, nome").order("nome"),
    supabase.from("formas_pagamento").select("nome, tipo").order("nome"),
    // Shopee (8.9): sem a 0046 volta `disponivel: false` e a aba explica.
    carregarPedidosMarketplace(supabase, DIAS_JANELA),
    supabase.from("lojas_canal").select("id, nome, canais(nome)").order("nome"),
    supabase.from("produtos").select("id, sku, nome, custo, estoque, variante_nome").order("nome"),
    supabase.from("perfil_negocio").select("aliquota_das").maybeSingle(),
    // Disponível = físico − reservado (0052). Sem a migração, cai para o físico.
    supabase.from("estoque_disponivel").select("produto_id, disponivel"),
  ]);
  const disponivel: Record<string, number> = disponivelRes.error
    ? Object.fromEntries((produtosRes.data ?? []).map((p) => [p.id, Number(p.estoque ?? 0)]))
    : Object.fromEntries((disponivelRes.data ?? []).map((d) => [d.produto_id as string, Number(d.disponivel)]));

  // 0062: padrão da etapa Emitir e as notas de cada venda (sem a migração: comprovante, sem notas).
  const [fiscalRes, notasRes, retornos] = await Promise.all([
    supabase.from("fiscal_config").select("*").maybeSingle(),
    supabase.from("notas_fiscais").select("venda_id, tipo, status, numero, danfe_url, mensagem, criado_em").gte("criado_em", inicio.toISOString()).order("criado_em"),
    // Retornos (devoluções da Shopee, 0090, e do sistema, 0059): sem as tabelas, vazio.
    carregarRetornos(supabase, DIAS_JANELA, new Map(((lojasRes.data ?? []) as { id: string; nome: string }[]).map((l) => [l.id, l.nome]))),
  ]);
  const fiscal = {
    ligada: !!fiscalRes.data?.token_cifrado,
    padraoPdv: (fiscalRes.data?.padrao_pdv as "comprovante" | "nfe" | "perguntar" | undefined) ?? "comprovante",
    padraoCatalogo: (fiscalRes.data?.padrao_catalogo as "comprovante" | "nfe" | "perguntar" | undefined) ?? "perguntar",
  };
  const notas: Record<string, { tipo: "comprovante" | "nfe"; status: "pendente" | "processando" | "autorizada" | "rejeitada" | "cancelada"; numero: string | null; danfe: string | null; mensagem: string | null }> = {};
  for (const n of notasRes.error ? [] : (notasRes.data ?? [])) {
    // A última vale; NF-e tem prioridade sobre comprovante.
    const atual = notas[n.venda_id as string];
    if (atual?.tipo === "nfe" && n.tipo === "comprovante") continue;
    notas[n.venda_id as string] = { tipo: n.tipo, status: n.status, numero: n.numero, danfe: n.danfe_url, mensagem: n.mensagem };
  }

  // 0055: "Comprar etiqueta" só aparece com o Melhor Envio conectado.
  const freteRes = await supabase.from("frete_conexoes").select("token_cifrado").maybeSingle();

  if (vendasRes.error) throw new Error(vendasRes.error.message);
  if (clientesPdvRes.error) throw new Error(clientesPdvRes.error.message);
  if (formasRes.error) throw new Error(formasRes.error.message);

  return (
    <VendasClient
      key={busca ?? "inicio"}
      vendas={(vendasRes.data ?? []) as Venda[]}
      diasJanela={DIAS_JANELA}
      clientes={clientesPdvRes.data ?? []}
      formasPagamento={(formasRes.data ?? []).map((f) => f.nome)}
      pedidos={pedidos}
      clientesPdv={clientesPdvRes.data ?? []}
      contas={semCartoes(contasRes.data ?? [], await camposCartaoPromessa)}
      formasPagamentoPdv={formasPdvRes.data ?? []}
      pedidoInicial={pedido && /^P-\d{1,8}$/.test(pedido) ? pedido : null}
      buscaInicial={busca?.slice(0, 80) ?? ""}
      marketplace={marketplace}
      faltandoShopee={[...faltandoShopee(), ...(cofreDisponivel() ? [] : ["IA_CHAVE_COFRE"])]}
      plataformasLigadas={cofreDisponivel() ? [...(credenciaisShopee() ? ["shopee"] : []), ...(credenciaisML() ? ["mercadolivre"] : [])] : []}
      avisoShopee={shopee && ["conectada", "erro", "desligada"].includes(shopee) ? shopee : null}
      lojasMarketplace={((lojasRes.data ?? []) as unknown as { id: string; nome: string; canais: { nome: string } | null }[]).map((l) => ({
        id: l.id,
        nome: l.nome,
        canalNome: l.canais?.nome ?? "",
      }))}
      produtosMarketplace={(produtosRes.data ?? []).map((p) => ({ id: p.id, sku: p.sku, nome: rotuloProduto(p), custo: Number(p.custo ?? 0) }))}
      impostoPct={Number(perfilRes.data?.aliquota_das ?? 0) / 100}
      disponivel={disponivel}
      freteConectado={!!freteRes.data?.token_cifrado}
      fiscal={fiscal}
      notas={notas}
      retornos={retornos}
    />
  );
}

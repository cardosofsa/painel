import { createClient } from "@/lib/supabase/server";
import { PdvClient } from "./PdvClient";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";
import type { ProdutoPdv, ClientePdv, ContaPdv, FormaPagamentoPdv } from "./tipos";
import type { Metadata } from "next";
import { carregarCrediario } from "@/lib/crediario-servidor";
import { semVariacoesFilhas } from "@/lib/variacoes-consulta";

export const metadata: Metadata = { title: "PDV" };

type Cliente = Awaited<ReturnType<typeof createClient>>;

/** Crédito ainda livre de uma troca: valor da devolução menos o que vendas não canceladas já usaram. */
async function creditoDaTroca(supabase: Cliente, numero: string) {
  const { data: dev } = await supabase.from("devolucoes").select("id, numero, valor_estorno").eq("numero", numero).eq("forma", "troca").maybeSingle();
  if (!dev) return null;
  const { data: usadas, error } = await supabase.from("vendas").select("credito_troca").eq("troca_devolucao_id", dev.id).neq("status", "cancelada");
  if (error) return null;
  const usado = (usadas ?? []).reduce((s, v) => s + Number(v.credito_troca ?? 0), 0);
  const valor = Math.round((Number(dev.valor_estorno) - usado) * 100) / 100;
  return valor > 0 ? { id: dev.id as string, numero: dev.numero as string, valor } : null;
}

export default async function PdvPage({ searchParams }: { searchParams: Promise<{ troca?: string }> }) {
  const { troca } = await searchParams;
  const supabase = await createClient();
  // Troca (11.3): a devolução gerou crédito, que paga a nova venda como forma de pagamento
  // (0083), não como desconto. O valor vem do banco (o que sobra do crédito), não da URL.
  const creditoTroca = troca && /^D-\d{1,8}$/.test(troca) ? await creditoDaTroca(supabase, troca) : null;

  const [produtosRes, gruposRes, categoriasRes, clientesRes, formasRes, contasRes, reservasRes] = await Promise.all([
    // Variação filha (0084) não é vendida no balcão: serve para anúncio e baixa do pai.
    semVariacoesFilhas((filtrar) => {
      const q = supabase
        .from("produtos")
        .select("id, sku, nome, grupo_id, variante_nome, preco_venda, custo, estoque, imagem_url, categoria_id, codigo_barras, garantia_dias")
        .eq("ativo", true);
      return (filtrar ? q.is("produto_pai_id", null) : q).order("nome");
    }),
    supabase.from("produto_grupos").select("id, nome, imagem_url, categoria_id"),
    supabase.from("categorias").select("id, nome"),
    supabase.from("clientes").select("id, nome, whatsapp, permite_fiado, limite_fiado").eq("status", "ativo").order("nome"),
    supabase.from("formas_pagamento").select("nome, tipo").order("nome"),
    supabase.from("contas").select("id, nome").order("nome"),
    // Reservado em pedidos da esteira (0052); sem a migração, nada reservado.
    supabase.from("estoque_disponivel").select("produto_id, reservado").gt("reservado", 0),
  ]);
  const reservadoPdv = new Map(reservasRes.error ? [] : (reservasRes.data ?? []).map((r) => [r.produto_id as string, Number(r.reservado)]));

  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (gruposRes.error) throw new Error(gruposRes.error.message);
  if (categoriasRes.error) throw new Error(categoriasRes.error.message);
  if (clientesRes.error) throw new Error(clientesRes.error.message);
  if (formasRes.error) throw new Error(formasRes.error.message);
  if (contasRes.error) throw new Error(contasRes.error.message);

  const categoriaPorId = new Map((categoriasRes.data ?? []).map((c) => [c.id, c.nome]));
  const grupoPorId = new Map((gruposRes.data ?? []).map((g) => [g.id, g]));

  const produtos: ProdutoPdv[] = (produtosRes.data ?? []).map((p) => {
    const grupo = p.grupo_id ? grupoPorId.get(p.grupo_id) : undefined;
    return {
      id: p.id,
      sku: p.sku,
      nome: p.nome,
      grupo_id: p.grupo_id,
      grupo_nome: grupo?.nome ?? null,
      variante_nome: p.variante_nome,
      preco_venda: p.preco_venda,
      custo: p.custo,
      // 0052: o PDV vende pelo DISPONÍVEL (físico − reservado em pedidos da esteira).
      estoque: Math.max(0, p.estoque - (reservadoPdv.get(p.id) ?? 0)),
      imagem_url: p.imagem_url ?? grupo?.imagem_url ?? null,
      categoria_nome: categoriaPorId.get(p.categoria_id ?? grupo?.categoria_id ?? "") ?? null,
      codigo_barras: p.codigo_barras,
      garantia_dias: p.garantia_dias,
    };
  });

  // 0055: só para saber se mostra "Cotar frete" (o token nunca sai do servidor).
  // Pix da loja (0065) para o QR no pagamento; sem a migração/sem chave, volta null.
  const [freteRes, crediario] = await Promise.all([supabase.from("frete_conexoes").select("token_cifrado").maybeSingle(), carregarCrediario(supabase)]);

  return (
    <PdvClient
      produtos={produtos}
      clientes={(clientesRes.data ?? []) as ClientePdv[]}
      formasPagamento={(formasRes.data ?? []) as FormaPagamentoPdv[]}
      contas={(contasRes.data ?? []) as ContaPdv[]}
      freteConectado={!!freteRes.data?.token_cifrado}
      pix={crediario.pix}
      creditoTroca={creditoTroca}
      userId={(await acessoAtual())?.userId ?? null}
      operadorId={(await acessoAtual())?.operador?.id ?? null}
    />
  );
}

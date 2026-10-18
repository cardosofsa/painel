import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { carregarLojaParaPreco } from "@/lib/precos-loja-servidor";
import { AjusteClient } from "./AjusteClient";

export const metadata: Metadata = { title: "Ajuste de Preço" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ajuste de Preço (esqueleto da fase 5). `/precificacao/ajuste/novo?produto=&loja=`: um produto
 * numa loja. A entrada por anúncio sincronizado da Shopee (`[id]` = anúncio) chega na fase 6.
 */
export default async function AjustePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ produto?: string; loja?: string }> }) {
  const { id } = await params;
  const { produto, loja } = await searchParams;
  if (id !== "novo" || !produto || !UUID.test(produto)) notFound();
  const supabase = await createClient();

  const [produtoRes, lojasRes, negocioRes, concorrentesRes, precosRes, ultimaRes] = await Promise.all([
    supabase.from("produtos").select("id, nome, sku, custo, preco_venda, imagem_url").eq("id", produto).maybeSingle(),
    supabase.from("lojas_canal").select("id, nome, canais(nome)").order("nome"),
    supabase.from("perfil_negocio").select("aliquota_das").maybeSingle(),
    supabase.from("concorrentes_preco").select("preco").eq("produto_id", produto),
    supabase.from("produto_lojas").select("loja_id, preco").eq("produto_id", produto),
    supabase.from("precificacoes").select("loja_id, margem_pct").eq("produto_id", produto).not("margem_pct", "is", null).order("criado_em", { ascending: false }).limit(20),
  ]);
  if (!produtoRes.data) notFound();
  const lojas = ((lojasRes.data ?? []) as unknown as { id: string; nome: string; canais: { nome: string } | null }[]).map((l) => ({ id: l.id, rotulo: `${l.canais?.nome ?? "—"} · ${l.nome}` }));
  const lojaId = loja && lojas.some((l) => l.id === loja) ? loja : (lojas[0]?.id ?? null);
  const lojaParaPreco = lojaId ? await carregarLojaParaPreco(supabase, lojaId) : null;
  const precoLoja = precosRes.error ? null : (((precosRes.data ?? []) as { loja_id: string; preco: number | null }[]).find((p) => p.loja_id === lojaId)?.preco ?? null);
  const margens = (ultimaRes.data ?? []) as { loja_id: string | null; margem_pct: number }[];
  const margemAlvo = Number((margens.find((m) => m.loja_id === lojaId) ?? margens[0])?.margem_pct ?? 0.25);
  const p = produtoRes.data as { id: string; nome: string; sku: string | null; custo: number; preco_venda: number | null; imagem_url: string | null };

  return (
    <AjusteClient
      key={`${p.id}-${lojaId}`}
      produto={{ id: p.id, nome: p.nome, sku: p.sku, custo: Number(p.custo), imagemUrl: p.imagem_url }}
      lojas={lojas}
      loja={lojaParaPreco}
      precoAtual={precoLoja != null ? Number(precoLoja) : p.preco_venda != null && Number(p.preco_venda) > 0 ? Number(p.preco_venda) : null}
      origemPrecoAtual={precoLoja != null ? "loja" : "cadastro"}
      impostoPct={Number(negocioRes.data?.aliquota_das ?? 6) / 100}
      margemAlvoInicial={Math.max(0, Math.min(0.9, margemAlvo))}
      concorrentes={((concorrentesRes.data ?? []) as { preco: number }[]).map((c) => Number(c.preco)).filter((n) => n > 0)}
      migracao0101={!precosRes.error}
    />
  );
}

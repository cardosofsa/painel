import { createClient } from "@/lib/supabase/server";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import { curvaAbc, giroEstoque, valorPorArmazem, valorPorCategoria, type ProdutoValor } from "@/lib/estoque-valor";
import { ValorEstoqueClient } from "./ValorEstoqueClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Valor do estoque" };

/** Janela das saídas para giro, cobertura e "parados". */
const JANELA = 90;

export default async function ValorEstoquePage() {
  const supabase = await createClient();
  const agora = new Date();
  const desde = new Date(agora.getTime() - JANELA * 86_400_000).toISOString();

  const [produtosRes, gruposRes, categoriasRes, armazensRes, saldosRes, saidasRes, movsRes] = await Promise.all([
    supabase.from("produtos").select("id, sku, nome, custo, estoque, categoria_id, armazem_id, grupo_id, variante_nome").eq("ativo", true),
    supabase.from("produto_grupos").select("id, nome"),
    supabase.from("categorias").select("id, nome"),
    supabase.from("armazens").select("id, nome").order("criado_em"),
    supabase.from("estoque_armazem").select("produto_id, armazem_id, quantidade"),
    supabase.from("estoque_movimentacoes").select("produto_id, quantidade").eq("tipo", "saida").gte("data_movimentacao", desde),
    supabase.from("estoque_movimentacoes").select("*").order("data_movimentacao", { ascending: false }).limit(500),
  ]);
  if (produtosRes.error) throw new Error(produtosRes.error.message);

  const grupos = mapaGrupos(gruposRes.data ?? []);
  const categorias = new Map((categoriasRes.data ?? []).map((c) => [c.id, c.nome]));
  const brutos = (produtosRes.data ?? []).map((p) => comRotulo(p, grupos));
  const produtos: ProdutoValor[] = brutos.map((p) => ({ id: p.id, nome: p.nome, sku: p.sku, custo: p.custo, estoque: p.estoque, categoria: (p.categoria_id && categorias.get(p.categoria_id)) || null }));

  const nomes = new Map((armazensRes.data ?? []).map((a) => [a.id, a.nome]));
  // Sem a 0041: o saldo inteiro conta no armazém padrão do produto.
  const saldos = saldosRes.error
    ? brutos.filter((p) => p.armazem_id && p.estoque > 0).map((p) => ({ produto_id: p.id, armazem_id: p.armazem_id!, quantidade: p.estoque }))
    : (saldosRes.data ?? []);

  const saidas = new Map<string, number>();
  for (const s of saidasRes.data ?? []) if (s.produto_id) saidas.set(s.produto_id, (saidas.get(s.produto_id) ?? 0) + s.quantidade);

  const giro = giroEstoque(produtos, saidas, JANELA);
  return (
    <ValorEstoqueClient
      total={produtos.reduce((s, p) => s + Math.max(0, p.custo) * p.estoque, 0)}
      porArmazem={valorPorArmazem(produtos, saldos, nomes)}
      porCategoria={valorPorCategoria(produtos)}
      abc={curvaAbc(produtos)}
      giro={giro.filter((g) => g.coberturaDias != null).slice(0, 15)}
      parados={giro.filter((g) => g.vendidos === 0 && g.produto.estoque > 0).sort((a, b) => b.produto.estoque * b.produto.custo - a.produto.estoque * a.produto.custo)}
      janela={JANELA}
      armazens={armazensRes.data ?? []}
      movimentacoes={movsRes.data ?? []}
    />
  );
}

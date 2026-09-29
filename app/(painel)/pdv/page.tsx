import { createClient } from "@/lib/supabase/server";
import { PdvClient } from "./PdvClient";
import type { ProdutoPdv, ClientePdv, ContaPdv, FormaPagamentoPdv } from "./tipos";

export default async function PdvPage() {
  const supabase = await createClient();

  const [produtosRes, gruposRes, categoriasRes, clientesRes, formasRes, contasRes, perfilRes] = await Promise.all([
    supabase
      .from("produtos")
      .select("id, sku, nome, grupo_id, variante_nome, preco_venda, custo, estoque, imagem_url, categoria_id, codigo_barras")
      .eq("ativo", true)
      .order("nome"),
    supabase.from("produto_grupos").select("id, nome, imagem_url, categoria_id"),
    supabase.from("categorias").select("id, nome"),
    supabase.from("clientes").select("id, nome, whatsapp, permite_fiado, limite_fiado").eq("status", "ativo").order("nome"),
    supabase.from("formas_pagamento").select("nome, tipo").order("nome"),
    supabase.from("contas").select("id, nome").order("nome"),
    supabase.from("perfil_negocio").select("nome_negocio").maybeSingle(),
  ]);

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
      estoque: p.estoque,
      imagem_url: p.imagem_url ?? grupo?.imagem_url ?? null,
      categoria_nome: categoriaPorId.get(p.categoria_id ?? grupo?.categoria_id ?? "") ?? null,
      codigo_barras: p.codigo_barras,
    };
  });

  return (
    <PdvClient
      produtos={produtos}
      clientes={(clientesRes.data ?? []) as ClientePdv[]}
      formasPagamento={(formasRes.data ?? []) as FormaPagamentoPdv[]}
      contas={(contasRes.data ?? []) as ContaPdv[]}
      nomeNegocio={perfilRes.data?.nome_negocio ?? null}
    />
  );
}

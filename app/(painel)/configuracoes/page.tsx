import { createClient } from "@/lib/supabase/server";
import {
  ConfiguracoesClient,
  type Categoria,
  type Canal,
  type Loja,
  type Conta,
  type Armazem,
  type FormaPagamento,
  type PerfilNegocio,
} from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [categoriasRes, canaisRes, lojasRes, faixasRes, contasRes, armazensRes, formasPagamentoRes, produtosRes, perfilRes] =
    await Promise.all([
      supabase.from("categorias").select("id, nome").order("nome"),
      supabase
        .from("canais")
        .select(
          "id, nome, tipo_taxa, icone, cor, comissao_pct_padrao, taxa_fixa_padrao, taxa_extra_valor_padrao, taxa_extra_tipo_padrao",
        )
        .order("criado_em"),
      supabase
        .from("lojas_canal")
        .select("id, canal_id, nome, logo_path, link, comissao_pct, taxa_fixa, taxa_extra_valor, taxa_extra_tipo")
        .order("nome"),
      supabase.from("faixas_comissao_canal").select("id, canal_id, preco_min, preco_max, comissao_pct, tarifa_fixa").order("ordem"),
      supabase.from("contas").select("id, nome, saldo, detalhe").order("nome"),
      supabase.from("armazens").select("id, nome, endereco, lojas_abastecidas").order("nome"),
      supabase.from("formas_pagamento").select("id, nome").order("nome"),
      supabase.from("produtos").select("categoria_id"),
      supabase.from("perfil_negocio").select("nome_negocio, cnpj, regime_tributario, aliquota_das, whatsapp").maybeSingle(),
    ]);

  if (categoriasRes.error) throw new Error(categoriasRes.error.message);
  if (canaisRes.error) throw new Error(canaisRes.error.message);
  if (lojasRes.error) throw new Error(lojasRes.error.message);
  if (faixasRes.error) throw new Error(faixasRes.error.message);
  if (contasRes.error) throw new Error(contasRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);
  if (formasPagamentoRes.error) throw new Error(formasPagamentoRes.error.message);
  if (perfilRes.error) throw new Error(perfilRes.error.message);

  const lojas: Loja[] = (lojasRes.data ?? []).map((l) => ({
    ...l,
    logo_url: l.logo_path ? supabase.storage.from("canais-logos").getPublicUrl(l.logo_path).data.publicUrl : null,
  }));

  const faixasPorCanal = new Map<string, typeof faixasRes.data>();
  for (const f of faixasRes.data ?? []) {
    const lista = faixasPorCanal.get(f.canal_id) ?? [];
    lista!.push(f);
    faixasPorCanal.set(f.canal_id, lista);
  }
  const canais: Canal[] = (canaisRes.data ?? []).map((c) => ({
    ...c,
    faixas: faixasPorCanal.get(c.id) ?? [],
  })) as Canal[];

  const perfil: PerfilNegocio = {
    nome_negocio: perfilRes.data?.nome_negocio ?? "",
    cnpj: perfilRes.data?.cnpj ?? "",
    regime_tributario: perfilRes.data?.regime_tributario ?? "",
    aliquota_das: perfilRes.data?.aliquota_das ?? 6,
    whatsapp: perfilRes.data?.whatsapp ?? "",
  };

  const contagemPorCategoria = new Map<string, number>();
  for (const p of produtosRes.data ?? []) {
    if (!p.categoria_id) continue;
    contagemPorCategoria.set(p.categoria_id, (contagemPorCategoria.get(p.categoria_id) ?? 0) + 1);
  }

  const categorias: Categoria[] = (categoriasRes.data ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    skus: contagemPorCategoria.get(c.id) ?? 0,
  }));

  return (
    <ConfiguracoesClient
      categorias={categorias}
      canais={canais}
      lojas={lojas}
      contas={(contasRes.data ?? []) as Conta[]}
      armazens={(armazensRes.data ?? []) as Armazem[]}
      formasPagamento={(formasPagamentoRes.data ?? []) as FormaPagamento[]}
      perfil={perfil}
      email={user?.email ?? ""}
    />
  );
}

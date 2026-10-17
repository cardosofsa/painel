import { createClient } from "@/lib/supabase/server";
import { filtrarMercadorias, soMercadorias } from "@/lib/mercadorias-consulta";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { normalizarFicha } from "@/lib/marca/ficha";
import { rotuloProduto } from "@/lib/produtos";
import type { FichaSalva, PerfilMarca } from "@/lib/marca/tipos";
import { saldoImagensIA } from "../estudio-actions";
import { EstudioClient } from "./EstudioClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Estúdio de anúncios" };

export default async function EstudioPage({ searchParams }: { searchParams: Promise<{ produto?: string }> }) {
  const { produto } = await searchParams;
  const supabase = await createClient();
  const [produtosRes, perfisRes, fichasRes, iaDisponivel, saldo] = await Promise.all([
    soMercadorias(
      (f) => {
        const q = supabase.from("produtos").select("id, sku, nome, variante_nome");
        return filtrarMercadorias(q, f).order("nome");
      },
      { incluirFilhas: true },
    ),
    supabase.from("perfis_marca").select("id, nome, plataforma, loja_id, nicho, link_loja, logo_path, referencias, termos_proibidos").order("nome"),
    supabase.from("marca_fichas").select("id, perfil_id, tipo_imagem, versao, dados, ativa, origem, nota, criado_em").eq("ativa", true).limit(400),
    iaDisponivelParaConta(supabase),
    saldoImagensIA(),
  ]);

  const produtos = (produtosRes.data ?? []).map((p) => ({ id: p.id as string, rotulo: rotuloProduto(p), sku: (p.sku as string | null) ?? null }));
  // Sem as migrações 0098 e 0099 as tabelas não existem: a tela explica em vez de quebrar.
  const semMigracao = !!perfisRes.error;

  return (
    <EstudioClient
      produtos={produtos}
      produtoInicial={produto && produtos.some((p) => p.id === produto) ? produto : null}
      perfis={(perfisRes.data ?? []) as PerfilMarca[]}
      fichas={((fichasRes.data ?? []) as FichaSalva[]).map((f) => ({ ...f, dados: normalizarFicha(f.dados) }))}
      iaDisponivel={iaDisponivel}
      imagensUsadas={saldo.ok ? (saldo.dado?.usadas ?? null) : null}
      semMigracao={semMigracao}
    />
  );
}

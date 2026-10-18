import { createClient } from "@/lib/supabase/server";
import { filtrarMercadorias, soMercadorias } from "@/lib/mercadorias-consulta";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { normalizarFicha } from "@/lib/marca/ficha";
import { plataformaDoCanal } from "@/lib/marca/plataformas";
import { rotuloProduto } from "@/lib/produtos";
import type { FichaSalva, LojaParaMarca, MemoriaMarca, PerfilMarca } from "@/lib/marca/tipos";
import { saldoImagensIA } from "../../produtos/estudio-actions";
import { InfinitoClient, type ConfigAba } from "./InfinitoClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Anúncio Infinito" };

const ABAS_CONFIG: ConfigAba[] = ["perfil", "ficha", "memoria", "conferir", "aprender"];

export default async function InfinitoPage({ searchParams }: { searchParams: Promise<{ produto?: string; config?: string }> }) {
  const { produto, config } = await searchParams;
  const supabase = await createClient();
  const [produtosRes, perfisRes, memoriaRes, fichasRes, lojasRes, iaDisponivel, saldo] = await Promise.all([
    soMercadorias(
      (f) => {
        const q = supabase.from("produtos").select("id, sku, nome, variante_nome");
        return filtrarMercadorias(q, f).order("nome");
      },
      { incluirFilhas: true },
    ),
    supabase.from("perfis_marca").select("id, nome, plataforma, loja_id, nicho, link_loja, logo_path, referencias, termos_proibidos").order("nome"),
    supabase.from("marca_memoria").select("id, perfil_id, tipo, texto, origem, ativo").order("criado_em", { ascending: false }).limit(300),
    supabase.from("marca_fichas").select("id, perfil_id, tipo_imagem, versao, dados, ativa, origem, nota, criado_em").order("criado_em", { ascending: false }).limit(400),
    supabase.from("lojas_canal").select("id, nome, canais(nome)").order("nome"),
    iaDisponivelParaConta(supabase),
    saldoImagensIA(),
  ]);

  const produtos = (produtosRes.data ?? []).map((p) => ({ id: p.id as string, rotulo: rotuloProduto(p), sku: (p.sku as string | null) ?? null }));
  // Sem as migrações 0098 e 0099 as tabelas não existem: a tela explica em vez de quebrar.
  const semMigracao = !!perfisRes.error;
  const lojas: LojaParaMarca[] = ((lojasRes.data ?? []) as unknown as { id: string; nome: string; canais: { nome: string } | null }[]).map((l) => ({ id: l.id, nome: l.nome, canal: l.canais?.nome ?? null }));

  return (
    <InfinitoClient
      produtos={produtos}
      produtoInicial={produto && produtos.some((p) => p.id === produto) ? produto : null}
      configInicial={ABAS_CONFIG.find((a) => a === config) ?? null}
      perfis={(perfisRes.data ?? []) as PerfilMarca[]}
      memorias={(memoriaRes.data ?? []) as MemoriaMarca[]}
      fichas={((fichasRes.data ?? []) as FichaSalva[]).map((f) => ({ ...f, dados: normalizarFicha(f.dados) }))}
      lojas={lojas.map((l) => ({ ...l, plataforma: plataformaDoCanal(l.canal) }))}
      iaDisponivel={iaDisponivel}
      imagensUsadas={saldo.ok ? (saldo.dado?.usadas ?? null) : null}
      semMigracao={semMigracao}
    />
  );
}

import { createClient } from "@/lib/supabase/server";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { normalizarFicha } from "@/lib/marca/ficha";
import { plataformaDoCanal } from "@/lib/marca/plataformas";
import type { FichaSalva, LojaParaMarca, MemoriaMarca, PerfilMarca } from "@/lib/marca/tipos";
import { MarcaClient } from "./MarcaClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Padrão da loja" };

export default async function MarcaPage() {
  const supabase = await createClient();
  const [perfisRes, memoriaRes, fichasRes, lojasRes, iaDisponivel] = await Promise.all([
    supabase.from("perfis_marca").select("id, nome, plataforma, loja_id, nicho, link_loja, logo_path, referencias, termos_proibidos").order("nome"),
    supabase.from("marca_memoria").select("id, perfil_id, tipo, texto, origem, ativo").order("criado_em", { ascending: false }).limit(300),
    supabase.from("marca_fichas").select("id, perfil_id, tipo_imagem, versao, dados, ativa, origem, nota, criado_em").order("criado_em", { ascending: false }).limit(400),
    supabase.from("lojas_canal").select("id, nome, canais(nome)").order("nome"),
    iaDisponivelParaConta(supabase),
  ]);

  // Sem a 0098 as tabelas não existem: a tela explica em vez de quebrar.
  const semMigracao = !!perfisRes.error;

  const perfis = (perfisRes.data ?? []) as PerfilMarca[];
  const memorias = (memoriaRes.data ?? []) as MemoriaMarca[];
  const fichas: FichaSalva[] = ((fichasRes.data ?? []) as FichaSalva[]).map((f) => ({ ...f, dados: normalizarFicha(f.dados) }));
  const lojas: LojaParaMarca[] = ((lojasRes.data ?? []) as unknown as { id: string; nome: string; canais: { nome: string } | null }[]).map((l) => ({
    id: l.id,
    nome: l.nome,
    canal: l.canais?.nome ?? null,
  }));

  return (
    <MarcaClient
      perfis={perfis}
      memorias={memorias}
      fichas={fichas}
      lojas={lojas.map((l) => ({ ...l, plataforma: plataformaDoCanal(l.canal) }))}
      iaDisponivel={iaDisponivel}
      semMigracao={semMigracao}
    />
  );
}

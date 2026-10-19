import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarDadosAjuste, type DadosAjuste } from "@/lib/ajuste-servidor";
import { calcularAjuste } from "@/lib/ajuste-preco";
import { analisarAnuncio, type EntradaAnalise } from "@/lib/analise-anuncio";
import { regrasDaPlataforma, type PlataformaMarcaId } from "@/lib/marca/plataformas";
import { mesclarFicha, normalizarFicha } from "@/lib/marca/ficha";
import { resumoDaFicha } from "@/lib/marca/prompt-capa";
import { termosDoPerfil, type TermosDoPerfil } from "@/lib/conformidade/termos";
import { versoesDoTitulo } from "@/lib/marketplace/titulos-servidor";
import type { VersaoComparada } from "@/lib/marketplace/titulos-historico";

export interface DadosAnalise {
  anuncio: { id: string; lojaId: string; itemId: number; titulo: string; imagemUrl: string | null; link: string | null };
  ajuste: DadosAjuste;
  perfil: { id: string; nome: string; termos: TermosDoPerfil; fichaResumo: string | null } | null;
  plataforma: { nome: string; limiteTitulo: number; maxImagens: number; capaFundoBranco: boolean };
  /** Entrada da análise pura: a tela recalcula quando lê a lista de imagens. */
  entrada: EntradaAnalise;
  palavrasChave: string[];
  /** Versões do título × vendas (0104); `null` sem a migração. */
  versoesTitulo: VersaoComparada[] | null;
}

/** Anúncio sincronizado + tudo que a análise precisa, lido com RLS. `"sem_produto"`/`null` como no Ajuste. */
export async function carregarAnalise(supabase: SupabaseClient, anuncioId: string): Promise<DadosAnalise | "sem_produto" | null> {
  const { data: bruto } = await supabase.from("marketplace_anuncios").select("*").eq("id", anuncioId).maybeSingle();
  if (!bruto) return null;
  const a = bruto as { id: string; loja_id: string; item_id: number; nome?: string | null; nome_item?: string | null; imagem_url?: string | null; link?: string | null; produto_id: string | null };
  if (!a.produto_id) return "sem_produto";

  const [ajuste, produtoRes, perfilRes, versoesTitulo] = await Promise.all([
    carregarDadosAjuste(supabase, { anuncioId }),
    supabase.from("produtos").select("palavras_chave").eq("id", a.produto_id).maybeSingle(),
    supabase.from("perfis_marca").select("*").eq("loja_id", a.loja_id).order("nome").limit(1),
    versoesDoTitulo(supabase, { id: a.id, lojaId: a.loja_id, produtoId: a.produto_id }).catch(() => null),
  ]);
  if (!ajuste || ajuste === "sem_produto") return ajuste;

  const perfilBruto = ((perfilRes.data ?? []) as { id: string; nome: string; plataforma: PlataformaMarcaId; termos_proibidos: string[] | null; presets?: unknown; presets_gravidade?: unknown; termos_bloqueados?: unknown }[])[0] ?? null;
  let fichaResumo: string | null = null;
  if (perfilBruto) {
    const { data: fichas } = await supabase.from("marca_fichas").select("tipo_imagem, dados").eq("perfil_id", perfilBruto.id).eq("ativa", true).in("tipo_imagem", ["geral", "capa_1"]);
    const lista = (fichas ?? []) as { tipo_imagem: string; dados: unknown }[];
    const ficha = mesclarFicha(normalizarFicha(lista.find((f) => f.tipo_imagem === "geral")?.dados), normalizarFicha(lista.find((f) => f.tipo_imagem === "capa_1")?.dados));
    fichaResumo = Object.keys(ficha).length ? resumoDaFicha(ficha) : null;
  }
  const regras = regrasDaPlataforma(perfilBruto?.plataforma ?? "shopee");
  const plataforma = { nome: regras.nome, limiteTitulo: regras.limiteTitulo ?? 100, maxImagens: regras.maxImagens ?? 9, capaFundoBranco: regras.capaFundoBranco };
  const titulo = (a.nome_item ?? a.nome ?? "").trim();
  const palavrasChave = ((produtoRes.data?.palavras_chave as string[] | null) ?? []).filter(Boolean);

  const ajusteNum = ajuste.loja && ajuste.produto.custo > 0 ? calcularAjuste({ custo: ajuste.produto.custo, loja: ajuste.loja, impostoPct: ajuste.impostoPct, margemAlvo: ajuste.margemAlvo, precoAtual: ajuste.precoAtual, concorrentes: ajuste.concorrentes, vendas30d: ajuste.vendas?.d30.unidades ?? 0 }) : null;
  const precoAtual = ajuste.precoAtual;
  const entrada: EntradaAnalise = {
    titulo,
    limiteTitulo: plataforma.limiteTitulo,
    palavrasChave,
    termoPrincipal: palavrasChave[0] ?? ajuste.produto.nome,
    termos: termosDoPerfil(perfilBruto),
    capa: a.imagem_url ?? null,
    totalImagens: null,
    maxImagens: plataforma.maxImagens,
    vendas: ajuste.vendas ? { d30: { unidades: ajuste.vendas.d30.unidades, pedidos: ajuste.vendas.d30.pedidos, receita: ajuste.vendas.d30.receita }, d90: { unidades: ajuste.vendas.d90.unidades, pedidos: ajuste.vendas.d90.pedidos } } : null,
    tendencia: ajuste.tendencia,
    estoque: ajuste.produto.estoque,
    vendaPorDia: ajuste.vendaPorDia,
    preco: ajusteNum
      ? {
          atual: precoAtual,
          ideal: ajusteNum.precoIdeal,
          minimo: ajusteNum.precoMinimo,
          lucro: ajusteNum.atual?.lucroLiquido ?? null,
          margem: ajusteNum.atual?.margemEfetivaPct ?? null,
          zonaMorta: precoAtual !== null && ajusteNum.zonasMortas.some((z) => precoAtual >= z.inicio && precoAtual <= z.fim),
        }
      : null,
  };

  return {
    anuncio: { id: a.id, lojaId: a.loja_id, itemId: Number(a.item_id), titulo, imagemUrl: a.imagem_url ?? null, link: a.link ?? null },
    ajuste,
    perfil: perfilBruto ? { id: perfilBruto.id, nome: perfilBruto.nome, termos: termosDoPerfil(perfilBruto), fichaResumo } : null,
    plataforma,
    entrada,
    palavrasChave,
    versoesTitulo,
  };
}

/** Contexto da IA, montado SÓ a partir dos números calculados aqui. */
export function contextoDaAnalise(d: DadosAnalise, totalImagens: number | null) {
  const analise = analisarAnuncio({ ...d.entrada, totalImagens });
  const e = d.entrada;
  return {
    titulo: e.titulo,
    plataforma: d.plataforma.nome,
    limite: d.plataforma.limiteTitulo,
    nota: analise.titulo.nota,
    criteriosFalhos: analise.titulo.criterios.filter((c) => !c.ok).map((c) => c.texto),
    palavrasAusentes: analise.titulo.ausentes.slice(0, 8),
    imagens: { total: totalImagens, recomendado: analise.imagens.recomendado },
    vendas: e.vendas ? { unidades30: e.vendas.d30.unidades, pedidos30: e.vendas.d30.pedidos, unidades90: e.vendas.d90.unidades, tendencia: e.tendencia, veredito: analise.vendas.veredito } : null,
    preco: e.preco ? { atual: e.preco.atual, ideal: e.preco.ideal, minimo: e.preco.minimo, lucro: e.preco.lucro, margemPct: e.preco.margem !== null ? Math.round(e.preco.margem * 1000) / 10 : null, zonaMorta: e.preco.zonaMorta } : null,
    estoqueDias: analise.estoque.dias,
  };
}

import { createClient } from "@/lib/supabase/server";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";
import { normalizarAbas } from "@/lib/acesso";
import { iaDisponivelParaConta } from "@/lib/ia/resolver";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import { hojeIsoLocal } from "@/lib/format";
import { diasEntre } from "@/lib/vixe/alertas";
import { VixeTextos, type ClienteCobranca, type ProdutoTexto } from "@/components/vixe/VixeTextos";

export default async function VixeTextosPage() {
  const supabase = await createClient();
  const perfilAcesso = await acessoAtual();
  const abas = normalizarAbas(perfilAcesso?.abas ?? []);
  const verProdutos = abas.includes("produtos") || abas.includes("precificacao") || abas.includes("catalogo");
  // Fiado é dado do Financeiro/Clientes: sem uma dessas abas, a ferramenta de cobrança some.
  const verFiado = abas.includes("financeiro") || abas.includes("clientes");

  const [produtosRes, gruposRes, categoriasRes, parcelasRes, perfilRes, catalogoRes] = await Promise.all([
    verProdutos
      ? supabase.from("produtos").select("id, nome, descricao, preco_venda, garantia_dias, estoque, categoria_id, grupo_id, variante_nome").eq("ativo", true).order("nome")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("produto_grupos").select("id, nome"),
    supabase.from("categorias").select("id, nome"),
    verFiado
      ? supabase.from("venda_parcelas").select("valor, data_vencimento, vendas(cliente_id, cliente_nome, clientes(whatsapp))").eq("status", "pendente").order("data_vencimento").limit(500)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("perfil_negocio").select("nome_negocio").maybeSingle(),
    supabase.from("catalogos").select("slug").eq("ativo", true).order("criado_em").limit(1).maybeSingle(),
  ]);
  if (produtosRes.error) throw new Error(produtosRes.error.message);

  const grupos = mapaGrupos(gruposRes.data ?? []);
  const categorias = new Map((categoriasRes.data ?? []).map((c) => [c.id, c.nome]));
  const produtos: ProdutoTexto[] = (produtosRes.data ?? []).map((p) => {
    const r = comRotulo(p, grupos);
    return {
      id: r.id,
      nome: r.nome,
      descricao: r.descricao,
      categoria: (r.categoria_id && categorias.get(r.categoria_id)) || null,
      preco: r.preco_venda,
      garantiaDias: r.garantia_dias,
      emEstoque: r.estoque > 0,
    };
  });

  // Agrupa as parcelas em aberto por cliente (só vendas com cliente cadastrado).
  const hoje = hojeIsoLocal();
  const porCliente = new Map<string, ClienteCobranca>();
  type Parcela = { valor: number; data_vencimento: string; vendas: { cliente_id: string | null; cliente_nome: string | null; clientes: { whatsapp: string | null } | null } | null };
  for (const p of (parcelasRes.data ?? []) as unknown as Parcela[]) {
    const id = p.vendas?.cliente_id;
    if (!id) continue;
    const c = porCliente.get(id) ?? { id, nome: p.vendas?.cliente_nome ?? "Cliente", whatsapp: p.vendas?.clientes?.whatsapp ?? null, parcelas: [] };
    c.parcelas.push({ valor: p.valor, vencimentoIso: p.data_vencimento, atrasoDias: Math.max(0, diasEntre(p.data_vencimento, hoje)) });
    porCliente.set(id, c);
  }

  return (
    <VixeTextos
      produtos={produtos}
      clientes={[...porCliente.values()].sort((a, b) => a.nome.localeCompare(b.nome))}
      verProdutos={verProdutos}
      verFiado={verFiado}
      nomeNegocio={perfilRes.data?.nome_negocio?.trim() || null}
      slugVitrine={catalogoRes.data?.slug ?? null}
      iaDisponivel={await iaDisponivelParaConta(supabase)}
    />
  );
}

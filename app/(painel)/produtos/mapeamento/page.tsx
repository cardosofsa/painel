import { createClient } from "@/lib/supabase/server";
import { escaparLike, faixaDaPagina, lerId, lerOpcao, lerPagina, lerTermo, valorPostgrest, type ParamsUrl } from "@/lib/listas";
import { lerAba, type AbaMapeamento } from "@/lib/marketplace/anuncios-mapeamento";
import { MapeamentoClient, type AnuncioLinha, type LojaMapeamento, type PlataformaMapeamento } from "./MapeamentoClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mapeamento de Anúncio" };
// "Detectar anúncios" roda numa Server Action desta página e lê a listagem inteira da loja.
export const maxDuration = 60;

const PLATAFORMAS = ["shopee", "mercadolivre"] as const;

interface LinhaBanco {
  id: string;
  loja_id: string;
  item_id: number | string;
  model_id: number | string;
  sku: string | null;
  nome: string | null;
  nome_item?: string | null;
  variacao?: string | null;
  sku_modelo?: string | null;
  imagem_url?: string | null;
  link?: string | null;
  produto_id: string | null;
  produtos: { id: string; nome: string; sku: string | null } | null;
}

export default async function MapeamentoPage({ searchParams }: { searchParams: Promise<ParamsUrl> }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [lojasRes, conexoesRes] = await Promise.all([
    supabase.from("lojas_canal").select("id, nome").order("nome"),
    // `plataforma` só existe a partir da 0056: sem ela, toda conexão é Shopee.
    supabase.from("marketplace_conexoes").select("loja_id, plataforma"),
  ]);
  if (lojasRes.error) throw new Error(lojasRes.error.message);
  const nomeLoja = new Map((lojasRes.data ?? []).map((l) => [l.id as string, l.nome as string]));
  let conexoes = (conexoesRes.data ?? []) as { loja_id: string; plataforma?: string | null }[];
  if (conexoesRes.error) {
    const sem = await supabase.from("marketplace_conexoes").select("loja_id");
    conexoes = sem.error ? [] : ((sem.data ?? []) as { loja_id: string }[]);
  }
  const lojasPlataforma = (p: PlataformaMapeamento): LojaMapeamento[] =>
    conexoes.filter((c) => (c.plataforma === "mercadolivre" ? "mercadolivre" : "shopee") === p).map((c) => ({ id: c.loja_id, nome: nomeLoja.get(c.loja_id) ?? "Loja" }));
  const disponiveis = PLATAFORMAS.filter((p) => lojasPlataforma(p).length > 0);

  const vazio = {
    plataformas: disponiveis as PlataformaMapeamento[],
    plataforma: (disponiveis[0] ?? "shopee") as PlataformaMapeamento,
    lojas: [] as LojaMapeamento[],
    filtro: { q: "", pagina: 1, loja: "", aba: "todos" as AbaMapeamento },
    anuncios: [] as AnuncioLinha[],
    total: 0,
    contagens: { todos: 0, nao_mapeado: 0, mapeado: 0 },
    semTabela: false,
  };
  if (disponiveis.length === 0) return <MapeamentoClient {...vazio} />;

  const escolhida = lerOpcao(sp.plataforma, PLATAFORMAS);
  const plataforma: PlataformaMapeamento = escolhida && disponiveis.includes(escolhida) ? escolhida : disponiveis[0];
  const lojas = lojasPlataforma(plataforma);
  const lojaId = lerId(sp.loja);
  const lojaFiltro = lojas.some((l) => l.id === lojaId) ? lojaId : "";
  const filtro = { q: lerTermo(sp.q), pagina: lerPagina(sp.pagina), loja: lojaFiltro, aba: lerAba(typeof sp.aba === "string" ? sp.aba : undefined) };
  const idsLojas = lojaFiltro ? [lojaFiltro] : lojas.map((l) => l.id);

  const base = (colunas: string, contar: boolean) => supabase.from("marketplace_anuncios").select(colunas, contar ? { count: "exact", head: false } : undefined).in("loja_id", idsLojas);
  const contagem = (mapeado: boolean | null) => {
    let q = supabase.from("marketplace_anuncios").select("id", { count: "exact", head: true }).in("loja_id", idsLojas);
    if (mapeado === true) q = q.not("produto_id", "is", null);
    if (mapeado === false) q = q.is("produto_id", null);
    return q;
  };

  let lista = base("*, produtos(id, nome, sku)", true);
  if (filtro.aba === "nao_mapeado") lista = lista.is("produto_id", null);
  if (filtro.aba === "mapeado") lista = lista.not("produto_id", "is", null);
  if (filtro.q) {
    // Palavras em E; cada uma procura no título, no SKU ou (se for número) no ID do anúncio.
    for (const palavra of filtro.q.split(" ")) {
      const padrao = valorPostgrest(`*${escaparLike(palavra)}*`);
      const numero = /^\d{1,18}$/.test(palavra) ? `,item_id.eq.${palavra}` : "";
      lista = lista.or(`nome.ilike.${padrao},sku.ilike.${padrao}${numero}`);
    }
  }
  const { de, ate } = faixaDaPagina(filtro.pagina);
  const [paginaRes, todosRes, naoRes, mapRes] = await Promise.all([lista.order("nome").order("id").range(de, ate), contagem(null), contagem(false), contagem(true)]);

  // Sem a tabela (0049 não aplicada) a tela explica em vez de quebrar.
  if (paginaRes.error && (paginaRes.error.code === "42P01" || paginaRes.error.code === "PGRST205")) return <MapeamentoClient {...vazio} lojas={lojas} plataforma={plataforma} semTabela />;
  if (paginaRes.error) throw new Error(paginaRes.error.message);

  const anuncios: AnuncioLinha[] = ((paginaRes.data ?? []) as unknown as LinhaBanco[]).map((a) => ({
    id: a.id,
    lojaId: a.loja_id,
    loja: nomeLoja.get(a.loja_id) ?? "Loja",
    anuncioId: plataforma === "mercadolivre" ? `MLB${a.item_id}` : String(a.item_id),
    modeloId: String(a.model_id),
    titulo: a.nome_item ?? a.nome ?? "Anúncio sem título",
    variacao: a.variacao ?? (a.nome && a.nome_item && a.nome.startsWith(`${a.nome_item} · `) ? a.nome.slice(a.nome_item.length + 3) : null),
    skuAnuncio: a.sku_modelo ?? a.sku,
    imagem: a.imagem_url ?? null,
    link: a.link ?? null,
    produto: a.produtos ? { id: a.produtos.id, nome: a.produtos.nome, sku: a.produtos.sku } : null,
  }));

  return (
    <MapeamentoClient
      plataformas={disponiveis as PlataformaMapeamento[]}
      plataforma={plataforma}
      lojas={lojas}
      filtro={filtro}
      anuncios={anuncios}
      total={paginaRes.count ?? anuncios.length}
      contagens={{ todos: todosRes.count ?? 0, nao_mapeado: naoRes.count ?? 0, mapeado: mapRes.count ?? 0 }}
      semTabela={false}
    />
  );
}

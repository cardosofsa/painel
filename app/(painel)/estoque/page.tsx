import { createClient } from "@/lib/supabase/server";
import { lerFiltroEstoque, resumoDeEstoque, type ParamsUrl } from "@/lib/listas";
import { paginaDoEstoque } from "@/lib/estoque-lista";
import { idsDaBusca, produtosDoEstoque, saldosDoEstoque } from "./consulta";
import { EstoqueClient } from "./EstoqueClient";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Estoque" };

export default async function EstoquePage({ searchParams }: { searchParams: Promise<ParamsUrl> }) {
  const filtro = lerFiltroEstoque(await searchParams);
  const supabase = await createClient();

  // Os grupos dão o rótulo das variantes e entram na busca; o resto roda junto.
  const gruposP = supabase.from("produto_grupos").select("id, nome");
  const produtosP = gruposP.then((g) => produtosDoEstoque(supabase, g.data ?? []));
  const buscaP = gruposP.then((g) => idsDaBusca(supabase, filtro.q, g.data ?? []));

  const [gruposRes, produtosRes, buscaRes, armazensRes, movimentacoesRes, reservasRes] = await Promise.all([
    gruposP,
    produtosP,
    buscaP,
    // `*`: `loja_ids` só existe a partir da 0041, e pedir por nome derrubaria a página antes.
    supabase.from("armazens").select("*").order("criado_em"),
    // `*`: origem/destino da transferência só existem a partir da 0041. A tela mostra 10.
    supabase.from("estoque_movimentacoes").select("*").order("data_movimentacao", { ascending: false }).limit(10),
    // Reservado por pedidos na esteira (0052); sem a migração, nada reservado.
    supabase.from("estoque_disponivel").select("produto_id, reservado").gt("reservado", 0),
  ]);

  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);
  if (movimentacoesRes.error) throw new Error(movimentacoesRes.error.message);
  if (gruposRes.error) throw new Error(gruposRes.error.message);
  if (buscaRes.error) throw new Error(buscaRes.error.message);

  const produtos = produtosRes.data;
  const { saldos, porArmazem } = await saldosDoEstoque(supabase, produtos);
  const pagina = paginaDoEstoque(produtos, saldos, filtro, buscaRes.ids);

  // Cards: da conta inteira (não da página nem dos filtros), como sempre foram.
  const resumo = resumoDeEstoque(produtos);
  const reservadoTodos: Record<string, number> = reservasRes.error ? {} : Object.fromEntries((reservasRes.data ?? []).map((r) => [r.produto_id as string, Number(r.reservado)]));
  const totalReservado = Object.values(reservadoTodos).reduce((a, n) => a + n, 0);
  const reservado = Object.fromEntries(pagina.produtos.filter((p) => reservadoTodos[p.id]).map((p) => [p.id, reservadoTodos[p.id]]));

  return (
    <EstoqueClient
      filtro={{ ...filtro, pagina: pagina.pagina }}
      total={pagina.total}
      produtos={pagina.produtos.map((p) => ({ id: p.id, sku: p.sku, nome: p.nome, custo: p.custo, estoque: p.estoque, estoque_minimo: p.estoque_minimo, armazem_id: p.armazem_id, ativo: p.ativo }))}
      saldos={pagina.saldos}
      totaisArmazem={pagina.porArmazem}
      resumo={{ unidades: resumo.unidades, valorTotal: resumo.valorEmEstoque, criticos: resumo.reposicao, reservado: totalReservado }}
      armazens={(armazensRes.data ?? []).map((a) => ({
        id: a.id,
        nome: a.nome,
        endereco: a.endereco,
        lojas_abastecidas: a.lojas_abastecidas ?? [],
      }))}
      movimentacoes={movimentacoesRes.data ?? []}
      porArmazem={porArmazem}
      reservado={reservado}
    />
  );
}

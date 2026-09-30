import { createClient } from "@/lib/supabase/server";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import { EstoqueClient, type SaldoArmazem } from "./EstoqueClient";

export default async function EstoquePage() {
  const supabase = await createClient();

  const [produtosRes, armazensRes, movimentacoesRes, gruposRes, saldosRes] = await Promise.all([
    supabase
      .from("produtos")
      .select("id, sku, nome, custo, estoque, estoque_minimo, armazem_id, grupo_id, variante_nome, ativo")
      .order("nome"),
    // `*`: `loja_ids` só existe a partir da 0041, e pedir por nome derrubaria a página antes.
    supabase.from("armazens").select("*").order("criado_em"),
    supabase.from("estoque_movimentacoes").select("*").order("data_movimentacao", { ascending: false }).limit(50),
    supabase.from("produto_grupos").select("id, nome"),
    supabase.from("estoque_armazem").select("produto_id, armazem_id, quantidade"),
  ]);

  if (produtosRes.error) throw new Error(produtosRes.error.message);
  if (armazensRes.error) throw new Error(armazensRes.error.message);
  if (movimentacoesRes.error) throw new Error(movimentacoesRes.error.message);
  if (gruposRes.error) throw new Error(gruposRes.error.message);

  const grupos = mapaGrupos(gruposRes.data ?? []);
  const produtos = (produtosRes.data ?? []).map((p) => comRotulo(p, grupos));

  // Sem a 0041 a tabela de saldos não existe: cada produto conta inteiro no armazém dele,
  // como era antes, e a tela avisa que transferência ainda não está disponível.
  const porArmazem = !saldosRes.error;
  const saldos: SaldoArmazem[] = porArmazem
    ? (saldosRes.data ?? [])
    : produtos.filter((p) => p.armazem_id && p.estoque > 0).map((p) => ({ produto_id: p.id, armazem_id: p.armazem_id!, quantidade: p.estoque }));

  return (
    <EstoqueClient
      produtos={produtos}
      armazens={(armazensRes.data ?? []).map((a) => ({
        id: a.id,
        nome: a.nome,
        endereco: a.endereco,
        lojas_abastecidas: a.lojas_abastecidas ?? [],
      }))}
      movimentacoes={movimentacoesRes.data ?? []}
      saldos={saldos}
      porArmazem={porArmazem}
    />
  );
}

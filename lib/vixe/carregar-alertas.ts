/**
 * Leitura do banco para a Vixe Alertas. Código de SERVIDOR.
 *
 * Duas regras:
 * 1. Cada fonte só é lida se a conta tem a aba correspondente — quem não vê Financeiro não
 *    passa a ver fiado por aqui. (O RLS já garante que são dados da própria conta.)
 * 2. Uma fonte que falha não derruba as outras: vira um aviso em `falhas` e a tela mostra
 *    o resto.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AbaId } from "@/lib/acesso";
import { hojeIsoLocal } from "@/lib/format";
import { calcularErosaoMargem, calcularPrevisaoRuptura } from "@/lib/alertas";
import { zonaMortaDeFaixa, type FaixaComissao } from "@/lib/pricing";
import {
  alertasContasVencidas,
  alertasEstoqueMinimo,
  alertasMargem,
  alertasRuptura,
  alertasZonaMorta,
  ordenarAlertas,
  type AlertaVixe,
  type CategoriaAlerta,
  type ContaVencida,
  type PrecoEmZonaMorta,
} from "./alertas";

export interface ResultadoAlertas {
  alertas: AlertaVixe[];
  /** Categorias que a conta pode ver (as outras nem aparecem no filtro). */
  categorias: CategoriaAlerta[];
  falhas: string[];
}

type Abas = ReadonlySet<AbaId>;

function tem(abas: Abas, ...ids: AbaId[]) {
  return ids.some((id) => abas.has(id));
}

export async function carregarAlertasVixe(supabase: SupabaseClient, abasLiberadas: AbaId[]): Promise<ResultadoAlertas> {
  const abas: Abas = new Set(abasLiberadas);
  const hoje = hojeIsoLocal();
  const falhas: string[] = [];
  const categorias: CategoriaAlerta[] = [];
  const blocos: AlertaVixe[][] = [];

  const tarefas: Promise<void>[] = [];

  if (tem(abas, "estoque", "produtos")) {
    categorias.push("estoque");
    tarefas.push(
      estoque(supabase).then(
        (a) => void blocos.push(a),
        (e) => void falhas.push(`estoque (${mensagem(e)})`),
      ),
    );
  }
  if (tem(abas, "precificacao")) {
    categorias.push("margem");
    tarefas.push(
      margem(supabase).then(
        (a) => void blocos.push(a),
        (e) => void falhas.push(`margem (${mensagem(e)})`),
      ),
    );
  }
  if (tem(abas, "financeiro")) {
    categorias.push("financeiro");
    tarefas.push(
      contas(supabase, hoje).then(
        (a) => void blocos.push(a),
        (e) => void falhas.push(`contas e fiado (${mensagem(e)})`),
      ),
    );
  }
  if (tem(abas, "precificacao", "produtos")) {
    categorias.push("preco");
    tarefas.push(
      precos(supabase).then(
        (a) => void blocos.push(a),
        (e) => void falhas.push(`preços (${mensagem(e)})`),
      ),
    );
  }

  await Promise.all(tarefas);
  return { alertas: ordenarAlertas(blocos.flat()), categorias, falhas };
}

function mensagem(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "erro";
}

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

async function estoque(supabase: SupabaseClient): Promise<AlertaVixe[]> {
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 30);
  const [alertasRes, produtosRes, saidasRes] = await Promise.all([
    supabase.from("alertas").select("id, mensagem, produto_id").eq("status", "novo").order("criado_em", { ascending: false }).limit(100),
    supabase.from("produtos").select("id, nome, estoque").eq("ativo", true),
    supabase.from("estoque_movimentacoes").select("produto_id, quantidade").eq("tipo", "saida").gte("data_movimentacao", hojeIsoLocal(inicio)),
  ]);
  const minimos = ok<{ id: string; mensagem: string; produto_id: string | null }[]>(alertasRes);
  const produtos = ok<{ id: string; nome: string; estoque: number }[]>(produtosRes);
  const saidas = ok<{ produto_id: string | null; quantidade: number }[]>(saidasRes);

  const saidasPorProduto = new Map<string, number>();
  for (const s of saidas) {
    if (s.produto_id) saidasPorProduto.set(s.produto_id, (saidasPorProduto.get(s.produto_id) ?? 0) + s.quantidade);
  }
  const comMinimo = new Set(minimos.map((m) => m.produto_id).filter((id): id is string => !!id));
  return [...alertasEstoqueMinimo(minimos), ...alertasRuptura(calcularPrevisaoRuptura(produtos, saidasPorProduto), comMinimo)];
}

async function margem(supabase: SupabaseClient): Promise<AlertaVixe[]> {
  const linhas = ok<{ produto_id: string; produto_nome: string; custo_compra: number; custo_precificacao: number }[]>(
    await supabase.rpc("custos_recentes_por_produto"),
  );
  const compras = new Map(linhas.map((c) => [c.produto_id, { custo_unitario: c.custo_compra, produto_nome: c.produto_nome }]));
  const precificacoes = new Map(linhas.map((c) => [c.produto_id, { custo: c.custo_precificacao }]));
  return alertasMargem(calcularErosaoMargem(precificacoes, compras));
}

interface ParcelaBruta {
  id: string;
  venda_id: string;
  numero: number;
  total_parcelas: number;
  valor: number;
  data_vencimento: string;
  vendas: { numero: number | null; cliente_nome: string | null; clientes: { whatsapp: string | null } | null } | null;
}

async function contas(supabase: SupabaseClient, hoje: string): Promise<AlertaVixe[]> {
  const [parcelasRes, cprRes, perfilRes] = await Promise.all([
    supabase
      .from("venda_parcelas")
      .select("id, venda_id, numero, total_parcelas, valor, data_vencimento, vendas(numero, cliente_nome, clientes(whatsapp))")
      .eq("status", "pendente")
      .lt("data_vencimento", hoje)
      .order("data_vencimento")
      .limit(100),
    supabase
      .from("contas_a_pagar_receber")
      .select("id, tipo, descricao, valor, data_vencimento, referencia_venda_id")
      .eq("status", "pendente")
      .lt("data_vencimento", hoje)
      .order("data_vencimento")
      .limit(100),
    supabase.from("perfil_negocio").select("nome_negocio").maybeSingle(),
  ]);
  const parcelas = ok<ParcelaBruta[]>(parcelasRes as never);
  const cpr = ok<{ id: string; tipo: "pagar" | "receber"; descricao: string; valor: number; data_vencimento: string; referencia_venda_id: string | null }[]>(cprRes);

  // Venda parcelada no fiado tem as parcelas em `venda_parcelas`; a conta a receber ligada a
  // ela (se houver) seria o mesmo dinheiro contado duas vezes — mesma regra da 0030.
  const idsVendaCpr = [...new Set(cpr.map((c) => c.referencia_venda_id).filter((id): id is string => !!id))];
  const vendasComParcelas = new Set<string>();
  if (idsVendaCpr.length > 0) {
    const r = await supabase.from("venda_parcelas").select("venda_id").in("venda_id", idsVendaCpr);
    for (const v of ok<{ venda_id: string }[]>(r)) vendasComParcelas.add(v.venda_id);
  }

  const itens: ContaVencida[] = [
    ...parcelas.map((p) => ({
      id: p.id,
      tipo: "fiado" as const,
      descricao: `Venda${p.vendas?.numero != null ? ` #${p.vendas.numero}` : ""}, parcela ${p.numero}/${p.total_parcelas}`,
      valor: p.valor,
      vencimento: p.data_vencimento,
      clienteNome: p.vendas?.cliente_nome ?? null,
      whatsapp: p.vendas?.clientes?.whatsapp ?? null,
    })),
    ...cpr
      .filter((c) => !(c.referencia_venda_id && vendasComParcelas.has(c.referencia_venda_id)))
      .map((c) => ({ id: c.id, tipo: c.tipo, descricao: c.descricao, valor: c.valor, vencimento: c.data_vencimento })),
  ];

  const nomeNegocio = (perfilRes.data as { nome_negocio: string | null } | null)?.nome_negocio?.trim() || null;
  return alertasContasVencidas(itens, hoje, nomeNegocio);
}

async function precos(supabase: SupabaseClient): Promise<AlertaVixe[]> {
  const [produtosRes, vinculosRes, lojasRes, canaisRes, faixasRes] = await Promise.all([
    supabase.from("produtos").select("id, nome, preco_venda").eq("ativo", true),
    supabase.from("produto_lojas").select("produto_id, loja_id"),
    supabase.from("lojas_canal").select("id, canal_id"),
    supabase.from("canais").select("id, nome").eq("tipo_taxa", "faixas"),
    supabase.from("faixas_comissao_canal").select("canal_id, preco_min, preco_max, comissao_pct, tarifa_fixa").order("ordem"),
  ]);
  const produtos = new Map(ok<{ id: string; nome: string; preco_venda: number }[]>(produtosRes).map((p) => [p.id, p]));
  const lojaParaCanal = new Map(ok<{ id: string; canal_id: string }[]>(lojasRes).map((l) => [l.id, l.canal_id]));
  const canais = new Map(ok<{ id: string; nome: string }[]>(canaisRes).map((c) => [c.id, c.nome]));
  const faixas = new Map<string, FaixaComissao[]>();
  for (const f of ok<{ canal_id: string; preco_min: number; preco_max: number | null; comissao_pct: number; tarifa_fixa: number }[]>(faixasRes)) {
    const lista = faixas.get(f.canal_id) ?? [];
    lista.push({ min: f.preco_min, max: f.preco_max, comissaoPct: f.comissao_pct, tarifaFixa: f.tarifa_fixa });
    faixas.set(f.canal_id, lista);
  }

  const itens: PrecoEmZonaMorta[] = [];
  const vistos = new Set<string>();
  for (const v of ok<{ produto_id: string; loja_id: string }[]>(vinculosRes)) {
    const produto = produtos.get(v.produto_id);
    const canalId = lojaParaCanal.get(v.loja_id);
    if (!produto || !canalId || !canais.has(canalId)) continue;
    // Duas lojas do mesmo canal têm a mesma tabela: um alerta por produto e canal.
    const chave = `${produto.id}:${canalId}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const zona = zonaMortaDeFaixa(faixas.get(canalId) ?? [], produto.preco_venda);
    if (zona) itens.push({ produtoId: produto.id, produtoNome: produto.nome, preco: produto.preco_venda, canalNome: canais.get(canalId)!, zona });
  }
  return alertasZonaMorta(itens);
}

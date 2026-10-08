/**
 * Fechamento mensal do Financeiro (migração 0088). Código de SERVIDOR.
 *
 * Roda de dois lugares: o cron diário (`/api/cron/fechamento`, cliente de SERVIÇO, sem RLS) e
 * a Server Action do Financeiro (chave anônima + RLS). Por isso TODA consulta aqui filtra
 * `user_id` explícito — no cron é a única trava; na action é redundante e inofensivo.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fimDoMes, inicioDoMes, projetarSaldo } from "./saldo-projetado";
import { montarEntradaProjecao, type DadosProjecao, type ParcelaCrua, type PedidoMkt } from "./projecao-dados";
import type { DespesaFixaFonte } from "./despesas-fixas-calendario";
import {
  agregarMes,
  categoriasEmAlta,
  desvioProjecao,
  lerFechamento,
  maioresSaidas,
  mesesAnteriores,
  planejarFechamentos,
  rotuloMes,
  type DetalhesMes,
  type FechamentoMes,
  type MovimentoFonte,
} from "./fechamento-mensal";
import type { ContextoRelatorioIA } from "./ia/prompts-relatorio";

type Consulta = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** Lê todas as páginas (o PostgREST devolve no máximo 1.000 linhas por pedido). Teto de 20 páginas. */
async function lerTodas<T>(consulta: (de: number, ate: number) => Consulta, paginas = 20): Promise<T[]> {
  const tudo: T[] = [];
  for (let p = 0; p < paginas; p++) {
    const { data, error } = await consulta(p * 1000, p * 1000 + 999);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    tudo.push(...lote);
    if (lote.length < 1000) break;
  }
  return tudo;
}

type Movimento = MovimentoFonte & { descricao: string | null };

async function movimentosDoMes(supabase: SupabaseClient, userId: string, mes: string): Promise<Movimento[]> {
  return lerTodas<Movimento>((de, ate) =>
    supabase
      .from("movimentacoes_financeiras")
      .select("valor, categoria, afeta_lucro, descricao, referencia_venda_id, referencia_pedido_compra_id")
      .eq("user_id", userId)
      .gte("data_movimentacao", mes)
      .lte("data_movimentacao", fimDoMes(mes))
      .order("id")
      .range(de, ate),
  );
}

async function saldoAtualDasContas(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase.from("contas").select("saldo").eq("user_id", userId);
  if (error) throw new Error(error.message);
  return Math.round(((data ?? []) as { saldo: number }[]).reduce((s, c) => s + Number(c.saldo), 0) * 100) / 100;
}

/**
 * Tudo que o saldo projetado precisa, com `user_id` explícito. A tela do Financeiro monta a
 * mesma `EntradaProjecao` pelos mesmos dados (`projecao-dados.ts`), então o número do histórico
 * é o da tela.
 */
async function dadosDaProjecao(supabase: SupabaseClient, userId: string, hoje: string, saldoAtual: number): Promise<DadosProjecao> {
  const inicioMes = inicioDoMes(hoje);
  const desde120 = new Date(Date.now() - 120 * 86_400_000).toISOString();
  const [contas, parcelas, despesasFixas, pagas, pedidosRes, diasRes, existentes] = await Promise.all([
    // `*`: valor_pago, aguardando_liberacao e referencia_pedido_marketplace_id só existem nas migrações novas.
    lerTodas<DadosProjecao["contas"][number] & { vendas?: { total_parcelas_fiado: number | null } | null }>((de, ate) =>
      supabase.from("contas_a_pagar_receber").select("*, vendas(total_parcelas_fiado)").eq("user_id", userId).eq("status", "pendente").order("id").range(de, ate),
    ),
    lerTodas<ParcelaCrua>((de, ate) =>
      supabase.from("venda_parcelas").select("status, valor, valor_pago, data_vencimento, vendas(status)").eq("user_id", userId).eq("status", "pendente").order("id").range(de, ate),
    ),
    lerTodas<DespesaFixaFonte>((de, ate) => supabase.from("despesas_fixas").select("id, nome, valor, dia_vencimento, criado_em").eq("user_id", userId).order("id").range(de, ate)),
    lerTodas<{ referencia_despesa_fixa_id: string; data_movimentacao: string }>((de, ate) =>
      supabase
        .from("movimentacoes_financeiras")
        .select("referencia_despesa_fixa_id, data_movimentacao")
        .eq("user_id", userId)
        .not("referencia_despesa_fixa_id", "is", null)
        .gte("data_movimentacao", inicioMes)
        .order("id")
        .range(de, ate),
    ),
    // Falha aqui só tira a precisão da data prevista do repasse (vale o prazo padrão).
    supabase.from("pedidos_marketplace").select("id, loja_id, escrow_liberado_em").eq("user_id", userId).eq("status", "concluido").gte("pago_em", desde120).limit(1000),
    // 0089: sem a migração a consulta falha e vale o prazo padrão.
    supabase.from("lojas_canal").select("id, dias_liberacao_repasse").eq("user_id", userId),
    // Contas a pagar do mês em diante, de qualquer status: serve só para a fixa já paga por conta não contar de novo.
    lerTodas<{ tipo: "pagar" | "receber"; descricao: string; data_vencimento: string }>((de, ate) =>
      supabase.from("contas_a_pagar_receber").select("tipo, descricao, data_vencimento").eq("user_id", userId).eq("tipo", "pagar").gte("data_vencimento", inicioMes).order("id").range(de, ate),
    ),
  ]);
  const pedidos = new Map<string, PedidoMkt>(
    ((pedidosRes.error ? [] : (pedidosRes.data ?? [])) as { id: string; loja_id: string | null; escrow_liberado_em: string | null }[]).map((p) => [p.id, { loja_id: p.loja_id, escrow_liberado_em: p.escrow_liberado_em }]),
  );
  return {
    saldoAtual,
    hoje,
    contas: contas.map((c) => ({ ...c, valor: Number(c.valor), total_parcelas_fiado: c.vendas?.total_parcelas_fiado ?? null })),
    parcelas: parcelas.map((p) => ({ ...p, valor: Number(p.valor) })),
    despesasFixas: despesasFixas.map((d) => ({ ...d, valor: Number(d.valor) })),
    pagamentosFixas: pagas.map((m) => ({ despesa_id: String(m.referencia_despesa_fixa_id), data: String(m.data_movimentacao) })),
    pedidos,
    contasExistentes: existentes,
    diasPorLoja: Object.fromEntries(((diasRes.error ? [] : (diasRes.data ?? [])) as { id: string; dias_liberacao_repasse: number }[]).map((l) => [l.id, l.dias_liberacao_repasse])),
  };
}

async function linhasDeFechamento(supabase: SupabaseClient, userId: string, limite: number): Promise<FechamentoMes[]> {
  const { data, error } = await supabase.from("fechamentos_mensais").select("*").eq("user_id", userId).order("mes", { ascending: false }).limit(limite);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(lerFechamento);
}

/** Os fechamentos mais recentes (para a tela). Sem a migração 0088 devolve vazio em vez de derrubar a página. */
export async function listarFechamentos(supabase: SupabaseClient, userId: string, limite = 24): Promise<FechamentoMes[]> {
  try {
    return await linhasDeFechamento(supabase, userId, limite);
  } catch {
    return [];
  }
}

/**
 * Guarda a foto de hoje: cria o mês corrente (primeira foto = saldo inicial e projeção
 * inicial), atualiza a projeção, o saldo e os detalhes dele, e fecha os meses passados que
 * ainda estavam abertos. Idempotente: rodar duas vezes no mesmo dia não muda o resultado.
 */
export async function atualizarFechamentos(supabase: SupabaseClient, userId: string, hoje: string): Promise<void> {
  const { data: existentesBrutos, error: erroLeitura } = await supabase.from("fechamentos_mensais").select("mes, fechado_em").eq("user_id", userId);
  if (erroLeitura) throw new Error(erroLeitura.message);
  const plano = planejarFechamentos(hoje, ((existentesBrutos ?? []) as { mes: string; fechado_em: string | null }[]));

  const saldoAtual = await saldoAtualDasContas(supabase, userId);
  const [dados, movimentosAtual] = await Promise.all([dadosDaProjecao(supabase, userId, hoje, saldoAtual), movimentosDoMes(supabase, userId, plano.mesAtual)]);
  const projecao = projetarSaldo(montarEntradaProjecao(dados), fimDoMes(plano.mesAtual)).saldoProjetado;
  const detalhesAtual = agregarMes(movimentosAtual);
  const agora = new Date().toISOString();

  if (plano.criarAtual) {
    const { error } = await supabase.from("fechamentos_mensais").insert({
      user_id: userId,
      mes: plano.mesAtual,
      saldo_inicial: saldoAtual,
      projetado_inicial: projecao,
      projetado_atual: projecao,
      saldo_real: saldoAtual,
      detalhes: detalhesAtual,
    });
    // 23505: duas execuções no mesmo instante (cron + clique) — a outra já criou.
    if (error && error.code !== "23505") throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("fechamentos_mensais")
      .update({ projetado_atual: projecao, saldo_real: saldoAtual, detalhes: detalhesAtual, atualizado_em: agora })
      .eq("user_id", userId)
      .eq("mes", plano.mesAtual)
      .is("fechado_em", null);
    if (error) throw new Error(error.message);
  }

  for (const { mes, congelarSaldoAgora } of plano.fechar) {
    const detalhes = await movimentosDoMes(supabase, userId, mes).then(agregarMes);
    const { error } = await supabase
      .from("fechamentos_mensais")
      .update({ detalhes, fechado_em: agora, atualizado_em: agora, ...(congelarSaldoAgora ? { saldo_real: saldoAtual } : {}) })
      .eq("user_id", userId)
      .eq("mes", mes)
      .is("fechado_em", null);
    if (error) throw new Error(error.message);
  }
}

/** Contas ativas de usuário (para o cron). */
export async function contasAtivas(supabase: SupabaseClient): Promise<string[]> {
  // Master também: quem administra o sistema costuma ser o dono de um negócio e precisa do próprio histórico.
  const { data, error } = await supabase.from("perfis_acesso").select("user_id").in("papel", ["usuario", "master"]).eq("status", "ativo");
  if (error) throw new Error(error.message);
  return ((data ?? []) as { user_id: string }[]).map((c) => c.user_id);
}

interface LinhaDre {
  mes: string;
  receita_bruta: number;
  taxas_marketplace: number;
  impostos: number;
  cmv: number;
  anuncios: number;
  despesas: number;
  lucro_liquido: number;
  pedidos: number;
}

/**
 * Tudo que a IA recebe sobre um mês, já agregado. Só roda com sessão do dono (a
 * `dre_mensal` filtra por `auth.uid()`), então é chamado pela Server Action, não pelo cron.
 * Não leva dado de cliente: só totais, categorias de despesa e descrição das saídas avulsas.
 */
export async function montarContextoRelatorio(
  supabase: SupabaseClient,
  userId: string,
  mes: string,
  hoje: string,
): Promise<{ contexto: ContextoRelatorioIA; fechamento: FechamentoMes }> {
  const fechamentos = await linhasDeFechamento(supabase, userId, 24);
  const fechamento = fechamentos.find((f) => f.mes === mes);
  if (!fechamento) throw new Error("Esse mês ainda não tem histórico guardado.");

  const anteriores = mesesAnteriores(mes, 3);
  const [movimentos, dreRes, fixasRes] = await Promise.all([
    movimentosDoMes(supabase, userId, mes),
    supabase.rpc("dre_mensal", { p_inicio: anteriores[anteriores.length - 1], p_fim: fimDoMes(mes) }),
    supabase.from("despesas_fixas").select("nome, valor").eq("user_id", userId).order("valor", { ascending: false }).limit(12),
  ]);
  const dre = ((dreRes.error ? [] : (dreRes.data ?? [])) as Record<string, unknown>[]).map(
    (d): LinhaDre => ({
      mes: String(d.mes).slice(0, 10),
      receita_bruta: Number(d.receita_bruta),
      taxas_marketplace: Number(d.taxas_marketplace),
      impostos: Number(d.impostos),
      cmv: Number(d.cmv),
      anuncios: Number(d.anuncios),
      despesas: Number(d.despesas),
      lucro_liquido: Number(d.lucro_liquido),
      pedidos: Number(d.pedidos),
    }),
  );
  const doMes = dre.find((d) => d.mes === mes) ?? null;

  const detalhes: DetalhesMes = agregarMes(movimentos);
  const despesasAnteriores = anteriores
    .map((m) => fechamentos.find((f) => f.mes === m && f.fechado_em))
    .filter((f): f is FechamentoMes => !!f)
    .map((f) => f.detalhes.despesas);

  const emAndamento = !fechamento.fechado_em && mes === inicioDoMes(hoje);
  const contexto: ContextoRelatorioIA = {
    mes: rotuloMes(mes),
    emAndamento,
    saldo: {
      inicial: fechamento.saldo_inicial,
      projetadoInicial: fechamento.projetado_inicial,
      projetadoAtual: fechamento.projetado_atual,
      real: fechamento.saldo_real,
      // Mês aberto: o saldo de hoje não é o do fim do mês, então compara a previsão de hoje com a primeira.
      desvioPct: desvioProjecao(fechamento.projetado_inicial, emAndamento ? fechamento.projetado_atual : fechamento.saldo_real).pct,
    },
    caixa: { entradas: detalhes.entradas, saidas: detalhes.saidas, resultado: detalhes.resultadoCaixa },
    dre: doMes && {
      receitaBruta: doMes.receita_bruta,
      taxasMarketplace: doMes.taxas_marketplace,
      impostos: doMes.impostos,
      cmv: doMes.cmv,
      anuncios: doMes.anuncios,
      despesas: doMes.despesas,
      lucroLiquido: doMes.lucro_liquido,
      pedidos: doMes.pedidos,
    },
    mesesAnteriores: anteriores
      .map((m) => {
        const d = dre.find((x) => x.mes === m);
        const f = fechamentos.find((x) => x.mes === m);
        if (!d && !f) return null;
        return {
          mes: rotuloMes(m),
          lucroLiquido: d ? d.lucro_liquido : null,
          receitaBruta: d ? d.receita_bruta : null,
          desvioPct: f?.fechado_em ? desvioProjecao(f.projetado_inicial, f.saldo_real).pct : null,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null),
    despesasEmAlta: categoriasEmAlta(detalhes.despesas, despesasAnteriores),
    despesasFixas: ((fixasRes.error ? [] : (fixasRes.data ?? [])) as { nome: string; valor: number }[]).map((d) => ({ nome: d.nome, valor: Number(d.valor) })),
    maioresSaidas: maioresSaidas(movimentos),
  };
  return { contexto, fechamento };
}

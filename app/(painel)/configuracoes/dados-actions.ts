"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { comResultado } from "@/lib/acao";
import { validar } from "@/lib/validacao";
import { comRotulo, mapaGrupos } from "@/lib/produtos";
import { montarBackup } from "@/lib/backup";

/**
 * Central de Dados (Configurações → Dados, Fase 8.5). Tudo é buscado no clique, não ao
 * abrir a página: exportar é raro, e carregar vendas/movimentações de todo o período em
 * cada visita às Configurações pesaria à toa. O RLS garante que só vêm dados da conta.
 */

const periodoSchema = z.object({
  de: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  armazemId: z.string().uuid().nullable(),
});
type Periodo = z.infer<typeof periodoSchema>;

/** Fim do dia, para `ate` incluir o dia inteiro nas colunas timestamptz. */
const fimDoDia = (d: string) => `${d}T23:59:59.999-03:00`;

export async function carregarProdutosExportacao() {
  return comResultado(async () => {
    const supabase = await createClient();
    const [produtosRes, gruposRes, categoriasRes, fornecedoresRes, armazensRes] = await Promise.all([
      supabase.from("produtos").select("*").order("nome"),
      supabase.from("produto_grupos").select("id, nome"),
      supabase.from("categorias").select("id, nome"),
      supabase.from("fornecedores").select("id, nome"),
      supabase.from("armazens").select("id, nome"),
    ]);
    if (produtosRes.error) lancarErroSupabase(produtosRes.error);
    const grupos = mapaGrupos(gruposRes.data ?? []);
    const nome = (lista: { id: string; nome: string }[] | null) => new Map((lista ?? []).map((x) => [x.id, x.nome]));
    const categorias = nome(categoriasRes.data);
    const fornecedores = nome(fornecedoresRes.data);
    const armazens = nome(armazensRes.data);
    return (produtosRes.data ?? []).map((p) => {
      const r = comRotulo(p, grupos);
      return {
        id: r.id as string,
        sku: r.sku as string,
        nome: r.nome,
        categoria: (r.categoria_id && categorias.get(r.categoria_id)) || "",
        fornecedor: (r.fornecedor_id && fornecedores.get(r.fornecedor_id)) || "",
        armazem: (r.armazem_id && armazens.get(r.armazem_id)) || "",
        custo: Number(r.custo ?? 0),
        preco_venda: Number(r.preco_venda ?? 0),
        preco_atacado: r.preco_atacado == null ? null : Number(r.preco_atacado),
        estoque: Number(r.estoque ?? 0),
        estoque_minimo: Number(r.estoque_minimo ?? 0),
        codigo_barras: (r.codigo_barras as string | null) ?? "",
        peso_g: (r.peso_g as number | null) ?? null,
        ativo: !!r.ativo,
      };
    });
  });
}

export async function carregarSaldosExportacao() {
  return comResultado(async () => {
    const supabase = await createClient();
    const [saldosRes, produtosRes, armazensRes] = await Promise.all([
      supabase.from("estoque_armazem").select("produto_id, armazem_id, quantidade"),
      supabase.from("produtos").select("id, sku, nome, custo, estoque, armazem_id, variante_nome"),
      supabase.from("armazens").select("id, nome"),
    ]);
    if (produtosRes.error) lancarErroSupabase(produtosRes.error);
    const produtos = new Map((produtosRes.data ?? []).map((p) => [p.id, p]));
    const armazens = new Map((armazensRes.data ?? []).map((a) => [a.id, a.nome]));
    // Sem a 0041 não há saldo por armazém: cada produto conta inteiro no armazém dele.
    const saldos = saldosRes.error
      ? (produtosRes.data ?? []).filter((p) => p.estoque > 0).map((p) => ({ produto_id: p.id, armazem_id: p.armazem_id, quantidade: p.estoque }))
      : (saldosRes.data ?? []);
    return saldos
      .filter((s) => s.quantidade > 0)
      .map((s) => {
        const p = produtos.get(s.produto_id);
        return {
          armazem: (s.armazem_id && armazens.get(s.armazem_id)) || "Sem armazém",
          sku: p?.sku ?? "",
          nome: p ? p.nome + (p.variante_nome ? ` — ${p.variante_nome}` : "") : "",
          quantidade: s.quantidade,
          custo: Number(p?.custo ?? 0),
        };
      })
      .sort((a, b) => a.armazem.localeCompare(b.armazem, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"));
  });
}

export async function carregarMovimentacoesExportacao(filtro: Periodo) {
  return comResultado(async () => {
    const f = validar(periodoSchema, filtro);
    const supabase = await createClient();
    let q = supabase.from("estoque_movimentacoes").select("*").order("data_movimentacao", { ascending: false }).limit(20000);
    if (f.de) q = q.gte("data_movimentacao", f.de);
    if (f.ate) q = q.lte("data_movimentacao", fimDoDia(f.ate));
    if (f.armazemId) q = q.or(`armazem_id.eq.${f.armazemId},armazem_destino_id.eq.${f.armazemId}`);
    const [movsRes, armazensRes] = await Promise.all([q, supabase.from("armazens").select("id, nome")]);
    if (movsRes.error) lancarErroSupabase(movsRes.error);
    const armazens = new Map((armazensRes.data ?? []).map((a) => [a.id, a.nome]));
    return (movsRes.data ?? []).map((m) => ({
      data: m.data_movimentacao as string,
      tipo: m.tipo === "entrada" ? "Entrada" : m.tipo === "saida" ? "Saída" : "Transferência",
      produto: m.produto_nome as string,
      quantidade: Number(m.quantidade),
      custo_unitario: m.custo_unitario == null ? null : Number(m.custo_unitario),
      armazem: (m.armazem_id && armazens.get(m.armazem_id)) || "",
      destino: (m.armazem_destino_id && armazens.get(m.armazem_destino_id)) || "",
      motivo: (m.motivo as string | null) ?? "",
    }));
  });
}

export async function carregarVendasExportacao(filtro: Periodo) {
  return comResultado(async () => {
    const f = validar(periodoSchema, filtro);
    const supabase = await createClient();
    let q = supabase
      .from("vendas")
      .select("numero, data_venda, cliente_nome, status, forma_pagamento, subtotal, desconto, valor_entrega, total, custo_total, lucro, venda_itens(produto_nome, produto_sku, quantidade, preco_unitario, custo_unitario)")
      .order("data_venda", { ascending: false })
      .limit(5000);
    if (f.de) q = q.gte("data_venda", f.de);
    if (f.ate) q = q.lte("data_venda", fimDoDia(f.ate));
    const { data, error } = await q;
    if (error) lancarErroSupabase(error);
    type Item = { produto_nome: string; produto_sku: string | null; quantidade: number; preco_unitario: number; custo_unitario: number };
    return (data ?? []).flatMap((v) =>
      ((v.venda_itens ?? []) as Item[]).map((i) => ({
        numero: v.numero as string,
        data: v.data_venda as string,
        cliente: (v.cliente_nome as string | null) ?? "",
        status: v.status as string,
        pagamento: (v.forma_pagamento as string | null) ?? "",
        sku: i.produto_sku ?? "",
        produto: i.produto_nome,
        quantidade: Number(i.quantidade),
        preco: Number(i.preco_unitario),
        custo: Number(i.custo_unitario),
        total_venda: Number(v.total),
        lucro_venda: Number(v.lucro),
      })),
    );
  });
}

export async function carregarFinanceiroExportacao(filtro: Periodo) {
  return comResultado(async () => {
    const f = validar(periodoSchema, filtro);
    const supabase = await createClient();
    let q = supabase.from("contas_a_pagar_receber").select("tipo, descricao, valor, data_vencimento, status, conta_id").order("data_vencimento").limit(10000);
    if (f.de) q = q.gte("data_vencimento", f.de);
    if (f.ate) q = q.lte("data_vencimento", f.ate);
    const [cprRes, contasRes] = await Promise.all([q, supabase.from("contas").select("id, nome")]);
    if (cprRes.error) lancarErroSupabase(cprRes.error);
    const contas = new Map((contasRes.data ?? []).map((c) => [c.id, c.nome]));
    return (cprRes.data ?? []).map((c) => ({
      tipo: c.tipo === "pagar" ? "A pagar" : "A receber",
      descricao: c.descricao as string,
      valor: Number(c.valor),
      vencimento: c.data_vencimento as string,
      status: c.status === "pendente" ? "Pendente" : c.status === "pago" ? "Pago" : "Recebido",
      conta: (c.conta_id && contas.get(c.conta_id)) || "",
    }));
  });
}

/** Opções para o modal de importação de pedidos de compra. */
export async function carregarOpcoesImportacaoPedidos() {
  return comResultado(async () => {
    const supabase = await createClient();
    const [produtosRes, gruposRes, fornecedoresRes, armazensRes, contasRes, formasRes] = await Promise.all([
      supabase.from("produtos").select("id, sku, nome, custo, grupo_id, variante_nome").eq("ativo", true),
      supabase.from("produto_grupos").select("id, nome"),
      supabase.from("fornecedores").select("id, nome").eq("status", "ativo").order("nome"),
      supabase.from("armazens").select("id, nome").order("nome"),
      supabase.from("contas").select("id, nome").order("nome"),
      supabase.from("formas_pagamento").select("id, nome").order("nome"),
    ]);
    if (produtosRes.error) lancarErroSupabase(produtosRes.error);
    const grupos = mapaGrupos(gruposRes.data ?? []);
    return {
      produtos: (produtosRes.data ?? []).map((p) => {
        const r = comRotulo(p, grupos);
        return { id: r.id, sku: r.sku, nome: r.nome, custo: r.custo };
      }),
      fornecedores: fornecedoresRes.data ?? [],
      armazens: armazensRes.data ?? [],
      contas: contasRes.data ?? [],
      formasPagamento: formasRes.data ?? [],
    };
  });
}

/**
 * Backup completo em JSON: tudo o que a conta cadastrou, tabela por tabela. Mais completo
 * que o backup da aba Conta (que leva só cadastros básicos).
 */
export async function backupCompleto() {
  return comResultado(async () => {
    const supabase = await createClient();
    // Sessão do usuário: o RLS já limita à conta (lib/backup.ts, mesma lista do cron semanal).
    return montarBackup(supabase, null);
  });
}

/** Backups automáticos da semana (0076): os arquivos da própria pasta no bucket `backups`. */
export async function listarBackupsAutomaticos() {
  return comResultado(async () => {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");
    const { data, error } = await supabase.storage.from("backups").list(auth.user.id, { limit: 20, sortBy: { column: "name", order: "desc" } });
    // Sem a 0076 o bucket não existe: lista vazia, a tela explica.
    if (error) return [] as { nome: string; tamanho: number | null }[];
    return (data ?? [])
      .filter((a) => /^\d{4}-\d{2}-\d{2}\.json$/.test(a.name))
      .map((a) => ({ nome: a.name, tamanho: (a.metadata as { size?: number } | null)?.size ?? null }));
  });
}

/** Link de download (1 minuto) de um backup automático da própria conta. */
export async function linkBackupAutomatico(nome: string) {
  return comResultado(async () => {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(nome)) throw new Error("Arquivo inválido.");
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");
    const { data, error } = await supabase.storage.from("backups").createSignedUrl(`${auth.user.id}/${nome}`, 60, { download: `sertao-backup-${nome}` });
    if (error || !data) throw new Error("Não foi possível gerar o link deste backup.");
    return data.signedUrl;
  });
}

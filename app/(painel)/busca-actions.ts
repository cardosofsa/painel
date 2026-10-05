"use server";

import { createClient } from "@/lib/supabase/server";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";
import { normalizarAbas } from "@/lib/acesso";
import { comResultado } from "@/lib/acao";
import { termoBusca } from "@/lib/busca";

export interface ResultadoBusca {
  tipo: "produto" | "cliente" | "venda" | "pedido" | "compra";
  titulo: string;
  detalhe: string;
  href: string;
}

/**
 * Busca global (Ctrl+K): até 5 de cada — produtos, clientes, vendas, pedidos de marketplace
 * e compras —, só nas abas que a pessoa (ou o operador do turno) pode abrir. O isolamento
 * entre contas continua sendo o RLS; a checagem de aba aqui só evita mostrar o que a tela
 * dela nem abriria.
 */
export async function buscarGlobal(q: string) {
  return comResultado(async (): Promise<ResultadoBusca[]> => {
    const t = termoBusca(String(q ?? ""));
    if (t.length < 2) return [];
    const acesso = await acessoAtual();
    if (!acesso) throw new Error("Sessão expirada. Entre de novo.");
    let abas: string[] = normalizarAbas(acesso.abas);
    if (acesso.operador && acesso.operador.id !== "dono") abas = abas.filter((a) => acesso.operador!.abas.includes(a));
    const pode = (...a: string[]) => a.some((x) => abas.includes(x));

    const supabase = await createClient();
    const like = `*${t}*`;
    const digitos = t.replace(/\D/g, "");
    const vazio = Promise.resolve({ data: [] as Record<string, unknown>[] });

    const [produtos, clientes, vendas, pedidos, compras] = await Promise.all([
      pode("produtos", "estoque", "precificacao", "pdv")
        ? supabase.from("produtos").select("id, nome, sku, estoque, preco_venda").or(`nome.ilike.${like},sku.ilike.${like}${digitos.length >= 8 ? `,codigo_barras.eq.${digitos}` : ""}`).order("nome").limit(5)
        : vazio,
      pode("clientes")
        ? supabase.from("clientes").select("id, nome, whatsapp, cidade").or(`nome.ilike.${like}${digitos.length >= 4 ? `,whatsapp.ilike.*${digitos}*` : ""}`).order("nome").limit(5)
        : vazio,
      pode("vendas") ? supabase.from("vendas").select("id, numero, cliente_nome, total, data_venda").or(`numero.ilike.${like},cliente_nome.ilike.${like}`).order("data_venda", { ascending: false }).limit(5) : vazio,
      pode("vendas") ? supabase.from("pedidos_marketplace").select("id, numero, comprador, subtotal").or(`numero.ilike.${like},comprador.ilike.${like}`).order("criado_em_plataforma", { ascending: false }).limit(5) : vazio,
      pode("compras") ? supabase.from("pedidos_compra").select("id, numero, valor_total, data_pedido").ilike("numero", `%${t}%`).order("data_pedido", { ascending: false }).limit(5) : vazio,
    ]);

    const brl = (n: unknown) => Number(n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const saida: ResultadoBusca[] = [];
    for (const p of (produtos.data ?? []) as Record<string, unknown>[])
      saida.push({ tipo: "produto", titulo: String(p.nome), detalhe: `${p.sku ? `SKU ${p.sku} · ` : ""}${p.estoque} em estoque · ${brl(p.preco_venda)}`, href: `/produtos?busca=${encodeURIComponent(String(p.sku || p.nome))}` });
    for (const c of (clientes.data ?? []) as Record<string, unknown>[])
      saida.push({ tipo: "cliente", titulo: String(c.nome), detalhe: [c.whatsapp, c.cidade].filter(Boolean).join(" · ") || "Cliente", href: `/clientes/${c.id}` });
    for (const v of (vendas.data ?? []) as Record<string, unknown>[])
      saida.push({ tipo: "venda", titulo: `Venda ${v.numero}`, detalhe: `${v.cliente_nome ?? "Sem cliente"} · ${brl(v.total)}`, href: `/vendas?busca=${encodeURIComponent(String(v.numero))}` });
    for (const p of (pedidos.data ?? []) as Record<string, unknown>[])
      saida.push({ tipo: "pedido", titulo: `Pedido ${p.numero}`, detalhe: `${p.comprador ?? "Marketplace"} · ${brl(p.subtotal)}`, href: `/vendas?busca=${encodeURIComponent(String(p.numero))}` });
    for (const c of (compras.data ?? []) as Record<string, unknown>[])
      saida.push({ tipo: "compra", titulo: `Compra ${c.numero}`, detalhe: brl(c.valor_total), href: `/compras?busca=${encodeURIComponent(String(c.numero))}` });
    return saida;
  });
}

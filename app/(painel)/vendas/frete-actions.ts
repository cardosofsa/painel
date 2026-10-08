"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { conexaoFrete, pacoteDosProdutos, provedorDa, regrasDa } from "@/lib/frete/servidor";
import { aplicarRegras, cepValido, soDigitosCep } from "@/lib/frete/tipos";
import type { Endereco } from "@/lib/frete/melhor-envio";

/**
 * Frete nas vendas (Fase 10.6): cotar no PDV, cotar e comprar a etiqueta de uma venda com
 * entrega (Para Enviar). Comprar COBRA do saldo do Melhor Envio — a tela confirma antes.
 */

const itensSchema = z.array(z.object({ produto_id: z.string().uuid(), quantidade: z.number().int().min(1).max(10_000) })).min(1).max(200);

async function sessao() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada. Entre de novo.");
  const c = await conexaoFrete(supabase, data.user.id);
  if (!c?.token_cifrado) throw new Error("Conecte o Melhor Envio em Configurações → Frete.");
  return { supabase, user: data.user, conexao: c };
}

/** PDV: cotar para um CEP com os itens do carrinho. */
export async function cotarFretePdv(cep: string, itens: { produto_id: string; quantidade: number }[], subtotal: number) {
  return comResultado(async () => {
    if (!cepValido(cep)) throw new Error("CEP inválido.");
    const lista = validar(itensSchema, itens);
    const { supabase, user, conexao } = await sessao();
    const { pacote, semMedida, valorDeclarado } = await pacoteDosProdutos(supabase, user.id, lista);
    const cotacoes = await provedorDa(conexao, user.email ?? "sem-email").cotar({ origem: conexao.cep_origem!, destino: cep, pacote, valorDeclarado });
    return { opcoes: aplicarRegras(cotacoes, regrasDa(conexao), subtotal), semMedida };
  });
}

interface VendaFrete {
  id: string;
  numero: string;
  subtotal: number;
  frete_servico_id?: number | null;
  frete_etiqueta_id?: string | null;
  cliente_id: string | null;
  cliente_nome: string | null;
  venda_itens: { produto_id: string | null; produto_nome: string; quantidade: number; preco_unitario: number }[];
}

/** Destinatário: o cadastro do cliente; sem endereço lá, o endereço do pedido da vitrine. */
async function destinoDaVenda(supabase: Awaited<ReturnType<typeof createClient>>, v: VendaFrete): Promise<Endereco | null> {
  if (v.cliente_id) {
    const { data: c } = await supabase.from("clientes").select("*").eq("id", v.cliente_id).maybeSingle();
    if (c?.cep && c.endereco)
      return { nome: c.nome, telefone: c.whatsapp, email: c.email, documento: c.cpf ?? c.documento ?? null, cep: c.cep, endereco: c.endereco, numero: c.numero ?? "", complemento: c.complemento, bairro: c.bairro ?? "", cidade: c.cidade ?? "", uf: c.uf ?? "" };
  }
  const { data: p } = await supabase.from("pedidos_vitrine").select("*").eq("venda_id", v.id).maybeSingle();
  if (p?.entrega_cep && p.entrega_logradouro)
    return { nome: p.cliente_nome, telefone: p.cliente_whatsapp, email: p.cliente_email, cep: p.entrega_cep, endereco: p.entrega_logradouro, numero: p.entrega_numero ?? "", bairro: p.entrega_bairro ?? "", cidade: p.entrega_cidade ?? "", uf: p.entrega_uf ?? "" };
  return null;
}

async function carregarVenda(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<VendaFrete> {
  const { data, error } = await supabase.from("vendas").select("*, venda_itens(produto_id, produto_nome, quantidade, preco_unitario)").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Venda não encontrada.");
  return data as VendaFrete;
}

/** Cotação para a venda (com o endereço do cliente). */
export async function cotarFreteVenda(vendaId: string) {
  return comResultado(async () => {
    const id = validar(z.string().uuid(), vendaId);
    const { supabase, user, conexao } = await sessao();
    const v = await carregarVenda(supabase, id);
    const destino = await destinoDaVenda(supabase, v);
    if (!destino) throw new Error("O cliente desta venda não tem endereço com CEP. Complete o cadastro do cliente.");
    const itens = v.venda_itens.filter((i) => i.produto_id).map((i) => ({ produto_id: i.produto_id as string, quantidade: i.quantidade }));
    const { pacote, semMedida, valorDeclarado } = await pacoteDosProdutos(supabase, user.id, itens);
    const cotacoes = await provedorDa(conexao, user.email ?? "sem-email").cotar({ origem: conexao.cep_origem!, destino: destino.cep, pacote, valorDeclarado });
    return {
      // Sem acréscimo/grátis: aqui é o CUSTO real da etiqueta para a loja.
      opcoes: aplicarRegras(cotacoes, { ...regrasDa(conexao), acrescimo: 0, freteGratisAcima: null }, Number(v.subtotal)),
      sugerido: v.frete_servico_id ?? null,
      jaComprada: !!v.frete_etiqueta_id,
      destino: `${destino.nome} · ${destino.cidade}/${destino.uf} · CEP ${soDigitosCep(destino.cep)}`,
      semMedida,
    };
  });
}

/** Compra a etiqueta (cobra do saldo do Melhor Envio), grava rastreio e devolve o link de impressão. */
export async function comprarEtiquetaVenda(vendaId: string, servicoId: number) {
  return comResultado(async () => {
    const id = validar(z.string().uuid(), vendaId);
    const servico = validar(z.number().int().positive(), servicoId);
    const { supabase, user, conexao } = await sessao();
    const v = await carregarVenda(supabase, id);
    if (v.frete_etiqueta_id) throw new Error("Esta venda já tem etiqueta comprada.");
    const destino = await destinoDaVenda(supabase, v);
    if (!destino) throw new Error("O cliente desta venda não tem endereço com CEP.");
    const { data: perfil } = await supabase.from("perfil_negocio").select("*").maybeSingle();
    if (!perfil?.cep || !perfil.endereco || !perfil.cidade)
      throw new Error("Complete o endereço da empresa em Configurações → Conta (é o remetente da etiqueta).");
    const remetente: Endereco = {
      nome: perfil.nome_negocio || "Loja",
      telefone: perfil.telefone ?? perfil.whatsapp,
      email: perfil.email ?? user.email,
      documento: perfil.cnpj,
      cep: conexao.cep_origem || perfil.cep,
      endereco: perfil.endereco,
      numero: perfil.numero ?? "",
      bairro: perfil.bairro ?? "",
      cidade: perfil.cidade,
      uf: perfil.uf ?? "",
    };
    const itens = v.venda_itens.filter((i) => i.produto_id).map((i) => ({ produto_id: i.produto_id as string, quantidade: i.quantidade }));
    const { pacote, valorDeclarado } = await pacoteDosProdutos(supabase, user.id, itens);
    const provedor = provedorDa(conexao, user.email ?? "sem-email");
    const cotacao = (await provedor.cotar({ origem: remetente.cep, destino: destino.cep, pacote, valorDeclarado })).find((c) => c.servicoId === servico);
    if (!cotacao) throw new Error("Este serviço não atende mais o trecho. Cote de novo.");
    const r = await provedor.comprarEtiqueta({
      servicoId: servico,
      remetente,
      destinatario: destino,
      pacote,
      valorDeclarado,
      produtos: v.venda_itens.map((i) => ({ nome: i.produto_nome, quantidade: i.quantidade, valor: Number(i.preco_unitario) })),
      numeroPedido: v.numero,
    });
    const { error } = await supabase
      .from("vendas")
      .update({
        frete_servico: `${cotacao.transportadora} ${cotacao.servico}`.trim(),
        frete_servico_id: servico,
        frete_etiqueta_id: r.etiquetaId,
        // O gatilho trg_lucro_venda (0083) tira este frete do lucro da venda na mesma gravação.
        frete_custo: cotacao.valor,
        rastreio: r.rastreio,
        logistica: `${cotacao.transportadora} ${cotacao.servico}`.trim(),
      })
      .eq("id", id);
    if (error) console.error("[frete] gravar etiqueta:", error.message);
    revalidatePath("/vendas");
    return { url: r.urlImpressao, rastreio: r.rastreio, valor: cotacao.valor };
  });
}

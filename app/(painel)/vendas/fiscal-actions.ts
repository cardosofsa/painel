"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { decifrar } from "@/lib/ia/cofre";
import { consultarNfeFocus, emitirNfeFocus, montarNfe, pendenciasFiscais, statusDaFocus, urlFocus, type Ambiente, type ConfigFiscal, type DestinatarioFiscal } from "@/lib/fiscal/focus-nfe";

/**
 * Etapa Emitir (11.7): "comprovante do sistema" (só registra e segue) ou NF-e pelo emissor.
 * A NF-e só sai com Configurações → Fiscal preenchido; até lá a tela explica o que falta.
 */

type Supa = Awaited<ReturnType<typeof createClient>>;

async function avancarParaEnviar(supabase: Supa, vendaId: string) {
  const { error } = await supabase.rpc("avancar_etapa_vendas", { p_ids: [vendaId], p_etapa: "enviar" });
  if (error) lancarErroSupabase(error);
}

function revalidar() {
  revalidatePath("/vendas");
  revalidatePath("/estoque");
}

export async function emitirComprovante(vendaId: string) {
  return comResultado(async () => {
    const id = validar(z.string().uuid(), vendaId);
    const supabase = await createClient();
    // Registro (0062); sem a migração, segue só avançando a etapa.
    await supabase.from("notas_fiscais").insert({ venda_id: id, tipo: "comprovante", status: "autorizada" });
    await avancarParaEnviar(supabase, id);
    revalidar();
    return { url: `/vendas/${id}/comprovante` };
  });
}

async function configuracao(supabase: Supa, userId: string): Promise<{ token: string; config: ConfigFiscal }> {
  const { data, error } = await supabase.from("fiscal_config").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data?.token_cifrado) throw new Error("A NF-e ainda não está ligada: preencha Configurações → Fiscal (emissor e token).");
  return { token: decifrar(data.token_cifrado as string, `${userId}:fiscal`), config: data as unknown as ConfigFiscal };
}

export async function emitirNfe(vendaId: string) {
  return comResultado(async () => {
    const id = validar(z.string().uuid(), vendaId);
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");
    const { token, config } = await configuracao(supabase, auth.user.id);

    const { data: venda } = await supabase.from("vendas").select("*, venda_itens(produto_id, produto_nome, produto_sku, quantidade, preco_unitario)").eq("id", id).maybeSingle();
    if (!venda) throw new Error("Venda não encontrada.");
    const ids = (venda.venda_itens as { produto_id: string | null }[]).map((i) => i.produto_id).filter((x): x is string => !!x);
    const [{ data: produtos }, { data: perfil }, { data: cliente }, { data: pedido }] = await Promise.all([
      supabase.from("produtos").select("*").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("perfil_negocio").select("*").maybeSingle(),
      venda.cliente_id ? supabase.from("clientes").select("*").eq("id", venda.cliente_id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from("pedidos_vitrine").select("*").eq("venda_id", id).maybeSingle(),
    ]);
    const porId = new Map((produtos ?? []).map((p) => [p.id as string, p]));
    const itens = (venda.venda_itens as { produto_id: string | null; produto_nome: string; produto_sku: string | null; quantidade: number; preco_unitario: number }[]).map((i) => {
      const p = i.produto_id ? porId.get(i.produto_id) : null;
      return { codigo: i.produto_sku ?? p?.sku ?? "ITEM", descricao: i.produto_nome, quantidade: i.quantidade, valorUnitario: Number(i.preco_unitario), ncm: (p?.ncm as string | null) ?? null, origem: Number(p?.origem_fiscal ?? 0), cfop: (p?.cfop as string | null) ?? null };
    });
    const destinatario: DestinatarioFiscal = {
      nome: (cliente?.nome as string | null) ?? (pedido?.cliente_nome as string | null) ?? venda.cliente_nome ?? null,
      documento: (cliente?.documento as string | null) ?? null,
      email: (cliente?.email as string | null) ?? (pedido?.cliente_email as string | null) ?? null,
      cep: (cliente?.cep as string | null) ?? (pedido?.entrega_cep as string | null) ?? null,
      endereco: (cliente?.endereco as string | null) ?? (pedido?.entrega_logradouro as string | null) ?? null,
      numero: (cliente?.numero as string | null) ?? (pedido?.entrega_numero as string | null) ?? null,
      bairro: (cliente?.bairro as string | null) ?? (pedido?.entrega_bairro as string | null) ?? null,
      cidade: (cliente?.cidade as string | null) ?? (pedido?.entrega_cidade as string | null) ?? null,
      uf: (cliente?.uf as string | null) ?? (pedido?.entrega_uf as string | null) ?? null,
    };
    const empresa = { cnpj: (perfil?.cnpj as string | null) ?? null, nome: (perfil?.nome_negocio as string | null) ?? null, uf: (perfil?.uf as string | null) ?? null };
    const vendaFiscal = { numero: venda.numero as string, data: new Date().toISOString(), desconto: Number(venda.desconto ?? 0), frete: Number(venda.valor_entrega ?? 0), presencial: !pedido && Number(venda.valor_entrega ?? 0) === 0, itens };
    const falta = pendenciasFiscais(vendaFiscal, empresa, destinatario);
    if (falta.length) throw new Error(`Antes de emitir a NF-e, falta: ${falta.join(" ")}`);

    const ref = `sertao-${String(venda.numero).replace(/\W/g, "")}-${id.slice(0, 8)}-${Date.now().toString(36)}`;
    const { data: nota, error: erroNota } = await supabase.from("notas_fiscais").insert({ venda_id: id, tipo: "nfe", status: "processando", ambiente: config.ambiente, ref }).select("id").single();
    if (erroNota) lancarErroSupabase(erroNota);

    const resposta = await emitirNfeFocus(token, config.ambiente as Ambiente, ref, montarNfe(vendaFiscal, config, empresa, destinatario));
    let s = statusDaFocus(resposta as never);
    let ultima = resposta;
    // A Sefaz costuma autorizar em segundos: confere algumas vezes antes de devolver.
    for (let t = 0; t < 4 && s.status === "processando"; t++) {
      await new Promise((r) => setTimeout(r, 2000));
      ultima = await consultarNfeFocus(token, config.ambiente as Ambiente, ref);
      s = statusDaFocus(ultima as never);
    }
    await gravarNota(supabase, nota!.id as string, config.ambiente as Ambiente, ultima, s);
    if (s.status === "autorizada") await avancarParaEnviar(supabase, id);
    revalidar();
    return { status: s.status, mensagem: s.mensagem, danfe: urlFocus(config.ambiente as Ambiente, ultima?.caminho_danfe) };
  });
}

async function gravarNota(supabase: Supa, notaId: string, ambiente: Ambiente, j: Record<string, unknown> | null, s: ReturnType<typeof statusDaFocus>) {
  await supabase
    .from("notas_fiscais")
    .update({
      status: s.status,
      numero: (j?.numero as string | undefined) ?? null,
      serie: (j?.serie as string | undefined) ?? null,
      chave: (j?.chave_nfe as string | undefined) ?? null,
      danfe_url: urlFocus(ambiente, j?.caminho_danfe),
      xml_url: urlFocus(ambiente, j?.caminho_xml_nota_fiscal),
      mensagem: s.mensagem?.slice(0, 1000) ?? null,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", notaId);
}

/** NF-e que ficou "processando": consulta de novo no emissor. */
export async function atualizarNfe(vendaId: string) {
  return comResultado(async () => {
    const id = validar(z.string().uuid(), vendaId);
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Sessão expirada. Entre de novo.");
    const { token, config } = await configuracao(supabase, auth.user.id);
    const { data: nota } = await supabase.from("notas_fiscais").select("*").eq("venda_id", id).eq("tipo", "nfe").order("criado_em", { ascending: false }).limit(1).maybeSingle();
    if (!nota?.ref) throw new Error("Nenhuma NF-e emitida para esta venda.");
    const j = await consultarNfeFocus(token, (nota.ambiente as Ambiente) ?? config.ambiente, nota.ref as string);
    const s = statusDaFocus(j as never);
    await gravarNota(supabase, nota.id as string, (nota.ambiente as Ambiente) ?? config.ambiente, j, s);
    if (s.status === "autorizada") await avancarParaEnviar(supabase, id);
    revalidar();
    return { status: s.status, mensagem: s.mensagem, danfe: urlFocus((nota.ambiente as Ambiente) ?? config.ambiente, j?.caminho_danfe) };
  });
}

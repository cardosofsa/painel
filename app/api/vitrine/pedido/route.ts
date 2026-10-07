import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pedidoVitrineSchema } from "@/lib/vitrine-pedido";
import { traduzirErroSupabase } from "@/lib/erros";
import { clienteServico } from "@/lib/supabase/servico";
import { conferirCotacao } from "@/lib/frete/assinatura";
import { conexaoFrete } from "@/lib/frete/servidor";

/**
 * Recebe o carrinho da vitrine pública e cria o pedido.
 *
 * ## Esta rota tem peso de segurança ZERO
 *
 * Vale dizer isso alto, porque é fácil olhar para ela e achar o contrário. A aplicação usa
 * a **anon key**: qualquer pessoa chama `criar_pedido_vitrine` direto no PostgREST, pelo
 * console do navegador, sem passar por aqui. Toda trava que importa — preço recalculado no
 * servidor, produto obrigatoriamente do dono do catálogo, tetos, backlog, idempotência —
 * mora **dentro da RPC** (migração 0027). O que está aqui é conveniência, e a validação
 * Zod abaixo existe para dar mensagem decente ao cliente, não para proteger o banco.
 *
 * ## Então por que a rota existe
 *
 * Peso de bundle. `/vitrine/[slug]` é a página que abre no celular de um cliente vindo de
 * um link do WhatsApp, e hoje nenhum componente dela importa `@supabase/supabase-js` —
 * chamar a RPC do navegador embarcaria ~40KB gzip numa página cujo propósito inteiro é
 * abrir rápido. Um `fetch` para cá custa zero.
 *
 * Content-type, teto de corpo e o 405 por método não exportado seguem
 * `app/api/csp-report/route.ts`, que é o outro POST público do projeto.
 */

const LIMITE_CORPO = 32 * 1024;

export async function POST(request: NextRequest) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ erro: "Formato inválido." }, { status: 415 });
  }

  const declarado = Number(request.headers.get("content-length") ?? 0);
  if (declarado > LIMITE_CORPO) {
    return NextResponse.json({ erro: "Pedido grande demais." }, { status: 413 });
  }

  const texto = await request.text();
  // O `content-length` é forjável; o teto que vale é este, sobre o corpo já lido.
  if (texto.length > LIMITE_CORPO) {
    return NextResponse.json({ erro: "Pedido grande demais." }, { status: 413 });
  }

  // JSON quebrado é erro de quem chamou (400), não exceção da rota (500).
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto || "{}");
  } catch {
    return NextResponse.json({ erro: "Formato inválido." }, { status: 400 });
  }
  const analise = pedidoVitrineSchema.safeParse(corpo);
  if (!analise.success) {
    return NextResponse.json({ erro: analise.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const dados = analise.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("criar_pedido_vitrine", {
      p_slug: dados.slug,
      p_itens: dados.itens,
      p_nome: dados.nome,
      p_whatsapp: dados.whatsapp,
      p_observacao: dados.observacao,
      p_idempotencia: dados.idempotencia,
      p_email: dados.email,
      p_cep: dados.cep,
      p_logradouro: dados.logradouro,
      p_numero: dados.numero,
      p_bairro: dados.bairro,
      p_cidade: dados.cidade,
      p_uf: dados.uf,
    })
    .maybeSingle<{ numero: string; total: number }>();

  if (error) {
    // As mensagens que a RPC levanta são `P0001` e foram escritas para o cliente final ver
    // ("Este catálogo não está disponível."). `traduzirErroSupabase` repassa essas direto e
    // troca qualquer erro de infraestrutura por um texto genérico.
    console.error("[vitrine] criar_pedido_vitrine:", error.code, error.message);
    return NextResponse.json({ erro: traduzirErroSupabase(error) }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ erro: "Não foi possível registrar o pedido." }, { status: 400 });
  }

  // Forma de pagamento (0051): a RPC só grava se o catálogo aceita e se a chave é deste
  // checkout. Falha aqui (migração ausente) não derruba o pedido, que já foi criado.
  if (dados.forma_pagamento) {
    const { error: e2 } = await supabase.rpc("definir_pagamento_pedido_vitrine", { p_slug: dados.slug, p_idempotencia: dados.idempotencia, p_forma: dados.forma_pagamento });
    if (e2) console.error("[vitrine] forma de pagamento:", e2.code, e2.message);
  }

  const frete = await gravarFrete(dados, data).catch((e) => {
    console.error("[vitrine] frete do pedido:", e instanceof Error ? e.message : e);
    return null;
  });

  return NextResponse.json({ numero: data.numero, total: data.total, frete });
}

/**
 * Frete escolhido (0055). Só grava com a assinatura da cotação válida, do mesmo catálogo e
 * CEP; frete grátis ainda exige o total recalculado pela RPC acima do mínimo. Grava com a
 * service key porque pedidos_vitrine não aceita escrita anônima. Falha não derruba o pedido.
 */
async function gravarFrete(dados: ReturnType<typeof pedidoVitrineSchema.parse>, pedido: { numero: string; total: number }) {
  const f = dados.frete;
  const segredo = process.env.IA_CHAVE_COFRE;
  const servico = clienteServico();
  if (!f || !segredo || !servico) return null;
  if (f.slug !== dados.slug || f.cep !== dados.cep || !conferirCotacao(f, segredo)) return null;
  const { data: cat } = await servico.from("catalogos").select("id, user_id").eq("slug", dados.slug).maybeSingle();
  if (!cat) return null;
  if (f.gratis) {
    const c = await conexaoFrete(servico, cat.user_id as string);
    if (c?.frete_gratis_acima == null || Number(pedido.total) < c.frete_gratis_acima) return null;
  }
  const { error } = await servico
    .from("pedidos_vitrine")
    .update({ frete_servico: f.servico, frete_servico_id: f.servicoId, frete_valor: f.valor, frete_prazo_dias: f.prazoDias })
    .eq("catalogo_id", cat.id)
    .eq("idempotencia", dados.idempotencia);
  if (error) throw new Error(error.message);
  return { servico: f.servico, valor: f.valor, prazoDias: f.prazoDias };
}

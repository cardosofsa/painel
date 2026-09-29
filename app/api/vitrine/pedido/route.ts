import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pedidoVitrineSchema } from "@/lib/vitrine-pedido";
import { traduzirErroSupabase } from "@/lib/erros";

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

  const analise = pedidoVitrineSchema.safeParse(JSON.parse(texto || "{}"));
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

  return NextResponse.json({ numero: data.numero, total: data.total });
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { clienteServico } from "@/lib/supabase/servico";
import { conexaoFrete, pacoteDosProdutos, provedorDa, regrasDa } from "@/lib/frete/servidor";
import { aplicarRegras, cepValido, soDigitosCep } from "@/lib/frete/tipos";
import { assinarCotacao } from "@/lib/frete/assinatura";
import { MAX_ITENS, MAX_QTD } from "@/lib/vitrine-pedido";
import { conferirCotaFrete, MENSAGEM_LIMITE_FRETE } from "@/lib/frete/cota";
import { hashIpDaRequisicao } from "@/lib/ip";

/**
 * Cotação de frete do checkout da vitrine (Fase 10.6). Pública: o cliente final não tem
 * login. Lê, com a service key, só o necessário do dono do catálogo (regras de frete, token
 * cifrado, medidas dos produtos do carrinho) e devolve opções ASSINADAS — o pedido só grava
 * o frete se a assinatura bate (`/api/vitrine/pedido`).
 *
 * Desligada (responde `ativo: false`) sem service key, sem cofre, sem conexão ou com
 * "Cotar frete na vitrine" desmarcado. Erro do provedor vira mensagem genérica.
 *
 * Cota (0077): antes de cotar, `vitrine_frete_permitido` conta por (catálogo, hash do IP) e
 * por catálogo no dia — passou do limite, 429. Ver `lib/frete/cota.ts`.
 */

export const maxDuration = 20;

const LIMITE_CORPO = 16 * 1024;

const schema = z.object({
  slug: z.string().trim().min(1).max(64),
  cep: z.string().refine(cepValido, "CEP inválido"),
  subtotal: z.number().finite().min(0).max(10_000_000),
  itens: z
    .array(z.object({ produto_id: z.string().uuid(), quantidade: z.number().int().min(1).max(MAX_QTD) }))
    .min(1)
    .max(MAX_ITENS),
});

const DESLIGADO = { ativo: false, opcoes: [] };

export async function POST(request: NextRequest) {
  const texto = await request.text();
  if (texto.length > LIMITE_CORPO) return NextResponse.json({ erro: "Pedido grande demais." }, { status: 413 });
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto || "{}");
  } catch {
    return NextResponse.json({ erro: "Formato inválido." }, { status: 400 });
  }
  const analise = schema.safeParse(corpo);
  if (!analise.success) return NextResponse.json({ erro: analise.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const d = analise.data;

  const servico = clienteServico();
  const segredo = process.env.IA_CHAVE_COFRE;
  if (!servico || !segredo) return NextResponse.json(DESLIGADO);

  const { data: cat } = await servico.from("catalogos").select("user_id, ativo").eq("slug", d.slug).maybeSingle();
  if (!cat?.ativo) return NextResponse.json(DESLIGADO);
  const conexao = await conexaoFrete(servico, cat.user_id as string);
  if (!conexao?.na_vitrine || !conexao.token_cifrado || !conexao.cep_origem) return NextResponse.json(DESLIGADO);
  // Só gasta a cota quando ia mesmo cotar. Conta suspensa: desligado, como catálogo inativo.
  const cota = await conferirCotaFrete(servico, d.slug, await hashIpDaRequisicao(request.headers, segredo), conexao.user_id);
  if (cota === "inativa") return NextResponse.json(DESLIGADO);
  if (cota === "limitada") return NextResponse.json({ ativo: true, opcoes: [], erro: MENSAGEM_LIMITE_FRETE }, { status: 429 });

  try {
    const { pacote, valorDeclarado } = await pacoteDosProdutos(servico, conexao.user_id, d.itens);
    const { data: perfil } = await servico.from("perfil_negocio").select("email").eq("user_id", conexao.user_id).maybeSingle();
    const cotacoes = await provedorDa(conexao, (perfil?.email as string | null) || "sem-email").cotar({ origem: conexao.cep_origem, destino: d.cep, pacote, valorDeclarado });
    const cep = soDigitosCep(d.cep);
    const opcoes = aplicarRegras(cotacoes, regrasDa(conexao), d.subtotal).map((c) =>
      assinarCotacao({ slug: d.slug, cep, servicoId: c.servicoId, servico: `${c.transportadora} ${c.servico}`.trim(), valor: c.valor, prazoDias: c.prazoDias, gratis: c.gratis }, segredo),
    );
    return NextResponse.json({ ativo: true, opcoes });
  } catch (e) {
    console.error("[vitrine] frete:", e instanceof Error ? e.message : e);
    return NextResponse.json({ ativo: true, opcoes: [], erro: "Não foi possível calcular o frete agora. Finalize e combine a entrega com a loja." });
  }
}

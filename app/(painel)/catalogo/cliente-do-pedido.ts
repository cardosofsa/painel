import type { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, clienteSchema } from "@/lib/validacao";
import { formatarCep } from "@/lib/cep";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Só dígitos e sem o DDI 55, para comparar "(75) 99255-2305" com "5575992552305". */
export function telefoneNormalizado(valor: string | null | undefined): string {
  return (valor ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
}

/**
 * Cliente do pedido da vitrine: reaproveita o cadastro que já tem esse WhatsApp; se não
 * houver, cria um **inativo** com os dados que o comprador informou (nome, e-mail, endereço).
 *
 * Só roda quando o dono aceita/converte o pedido — não quando ele chega. A vitrine é
 * pública, então criar cliente a cada pedido deixaria qualquer visitante encher a lista de
 * cadastros falsos.
 */
export async function garantirClienteDoPedido(
  supabase: Supabase,
  pedidoId: string,
): Promise<{ clienteId: string; criado: boolean } | null> {
  const { data: pedido, error } = await supabase
    .from("pedidos_vitrine")
    // `*`: `cliente_id` só existe a partir da 0043.
    .select("*")
    .eq("id", pedidoId)
    .maybeSingle();
  if (error) lancarErroSupabase(error);
  if (!pedido) return null;

  // Desde a 0043 o banco já liga (ou cria, inativo) o cliente quando o pedido chega.
  if (pedido.cliente_id) return { clienteId: pedido.cliente_id as string, criado: false };

  const alvo = telefoneNormalizado(pedido.cliente_whatsapp);

  // O WhatsApp fica gravado com máscara diferente de cliente pra cliente; filtra pelos
  // 4 últimos dígitos no banco (sempre contíguos) e compara o número inteiro aqui.
  const { data: candidatos, error: erroBusca } = await supabase
    .from("clientes")
    .select("id, whatsapp")
    .ilike("whatsapp", `%${alvo.slice(-4)}%`);
  if (erroBusca) lancarErroSupabase(erroBusca);

  const existente = (candidatos ?? []).find((c) => telefoneNormalizado(c.whatsapp) === alvo);
  if (existente) return { clienteId: existente.id, criado: false };

  const dados = validar(clienteSchema, {
    nome: pedido.cliente_nome,
    whatsapp: pedido.cliente_whatsapp,
    email: pedido.cliente_email,
    documento: null,
    data_nascimento: null,
    cep: pedido.entrega_cep ? formatarCep(pedido.entrega_cep) : null,
    endereco: pedido.entrega_logradouro,
    numero: pedido.entrega_numero,
    bairro: pedido.entrega_bairro,
    complemento: null,
    cidade: pedido.entrega_cidade,
    uf: pedido.entrega_uf,
    observacao: `Cadastrado a partir do pedido ${pedido.numero} da vitrine.`,
    permite_fiado: false,
    limite_fiado: 0,
    status: "inativo" as const,
  });

  const { data: novo, error: erroCriar } = await supabase.from("clientes").insert(dados).select("id").single();
  if (erroCriar) lancarErroSupabase(erroCriar);
  return { clienteId: novo.id, criado: true };
}

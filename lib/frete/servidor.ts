import type { SupabaseClient } from "@supabase/supabase-js";
import { decifrar } from "@/lib/ia/cofre";
import { melhorEnvio, type AmbienteFrete } from "./melhor-envio";
import { montarPacote, type ItemPacote, type RegrasFrete } from "./tipos";

/** Frete do lado do servidor: conexão da conta, provedor com o token decifrado e pacote. */

export interface ConexaoFrete {
  user_id: string;
  provedor: "melhorenvio";
  ambiente: AmbienteFrete;
  token_cifrado: string | null;
  cep_origem: string | null;
  servicos: number[];
  acrescimo: number;
  frete_gratis_acima: number | null;
  na_vitrine: boolean;
}

/** AAD do cofre: o token de uma conta não decifra na linha de outra. */
export const aadFrete = (userId: string) => `${userId}:frete`;

export async function conexaoFrete(supabase: SupabaseClient, userId: string): Promise<ConexaoFrete | null> {
  const { data, error } = await supabase.from("frete_conexoes").select("*").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return { ...(data as ConexaoFrete), acrescimo: Number(data.acrescimo ?? 0), frete_gratis_acima: data.frete_gratis_acima == null ? null : Number(data.frete_gratis_acima) };
}

export function regrasDa(c: ConexaoFrete): RegrasFrete {
  return { servicos: c.servicos ?? [], acrescimo: c.acrescimo, freteGratisAcima: c.frete_gratis_acima };
}

export function provedorDa(c: ConexaoFrete, contato: string) {
  if (!c.token_cifrado) throw new Error("Conecte o Melhor Envio em Configurações → Frete.");
  if (!c.cep_origem) throw new Error("Informe o CEP de origem em Configurações → Frete.");
  return melhorEnvio(decifrar(c.token_cifrado, aadFrete(c.user_id)), c.ambiente, contato);
}

/** Pacote dos produtos (peso/medidas da 0041) para as quantidades pedidas. */
export async function pacoteDosProdutos(supabase: SupabaseClient, userId: string, itens: { produto_id: string; quantidade: number }[]) {
  const ids = [...new Set(itens.map((i) => i.produto_id))];
  const { data } = ids.length
    ? await supabase.from("produtos").select("id, nome, preco_venda, peso_g, altura_cm, largura_cm, comprimento_cm").eq("user_id", userId).in("id", ids)
    : { data: [] };
  const porId = new Map((data ?? []).map((p) => [p.id as string, p]));
  const linhas: ItemPacote[] = [];
  let valor = 0;
  for (const i of itens) {
    const p = porId.get(i.produto_id);
    if (!p) continue;
    linhas.push({ nome: p.nome as string, quantidade: i.quantidade, peso_g: p.peso_g as number | null, altura_cm: p.altura_cm as number | null, largura_cm: p.largura_cm as number | null, comprimento_cm: p.comprimento_cm as number | null });
    valor += Number(p.preco_venda ?? 0) * i.quantidade;
  }
  return { ...montarPacote(linhas), valorDeclarado: Math.round(valor * 100) / 100 };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { cifrar, cofreDisponivel } from "@/lib/ia/cofre";
import { melhorEnvio } from "@/lib/frete/melhor-envio";
import { aadFrete, conexaoFrete, provedorDa, regrasDa } from "@/lib/frete/servidor";
import { aplicarRegras, cepValido, PADRAO_ITEM, soDigitosCep } from "@/lib/frete/tipos";

/**
 * Configurações → Frete. O token do Melhor Envio só existe em texto DENTRO destas funções:
 * entra pelo formulário, é testado (saldo), cifrado e gravado. A tela só sabe se há token.
 */

const freteSchema = z.object({
  token: z.string().trim().max(4000).optional(),
  ambiente: z.enum(["sandbox", "producao"]),
  cep_origem: z.string().refine(cepValido, "CEP de origem inválido."),
  servicos: z.array(z.number().int().positive()).max(30),
  acrescimo: z.number().finite().min(0).max(1000),
  frete_gratis_acima: z.number().finite().min(0).max(1_000_000).nullable(),
  na_vitrine: z.boolean(),
});

async function sessao() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sessão expirada. Entre de novo.");
  return { supabase, user: data.user };
}

export async function salvarFrete(dados: z.input<typeof freteSchema>) {
  return comResultado(async () => {
    const v = validar(freteSchema, dados);
    const { supabase, user } = await sessao();
    const linha: Record<string, unknown> = {
      user_id: user.id,
      provedor: "melhorenvio",
      ambiente: v.ambiente,
      cep_origem: soDigitosCep(v.cep_origem),
      servicos: v.servicos,
      acrescimo: v.acrescimo,
      frete_gratis_acima: v.frete_gratis_acima,
      na_vitrine: v.na_vitrine,
      atualizado_em: new Date().toISOString(),
    };
    let saldo: number | null = null;
    if (v.token) {
      if (!cofreDisponivel()) throw new Error("O cofre de chaves não está configurado neste sistema. Avise o administrador.");
      // Prova o token antes de guardar (saldo é leitura barata e exige token válido).
      saldo = await melhorEnvio(v.token, v.ambiente, user.email ?? "sem-email").saldo();
      if (saldo === null) throw new Error("O Melhor Envio não aceitou este token (confira o ambiente: sandbox ou produção).");
      linha.token_cifrado = cifrar(v.token, aadFrete(user.id));
    }
    const { error } = await supabase.from("frete_conexoes").upsert(linha, { onConflict: "user_id" });
    if (error?.code === "PGRST205" || error?.code === "42P01") throw new Error("O frete precisa da migração 0055.");
    if (error) lancarErroSupabase(error);
    revalidatePath("/configuracoes");
    revalidatePath("/catalogo");
    return { saldo };
  });
}

export async function desconectarFrete() {
  return comResultado(async () => {
    const { supabase, user } = await sessao();
    const { error } = await supabase.from("frete_conexoes").update({ token_cifrado: null, na_vitrine: false }).eq("user_id", user.id);
    if (error) lancarErroSupabase(error);
    revalidatePath("/configuracoes");
  });
}

/** "Testar cotação": um pacote padrão do CEP de origem até o CEP informado, com as regras. */
export async function testarFrete(cepDestino: string) {
  return comResultado(async () => {
    if (!cepValido(cepDestino)) throw new Error("CEP de destino inválido.");
    const { supabase, user } = await sessao();
    const c = await conexaoFrete(supabase, user.id);
    if (!c) throw new Error("Salve a configuração de frete primeiro.");
    const cotacoes = await provedorDa(c, user.email ?? "sem-email").cotar({
      origem: c.cep_origem!,
      destino: cepDestino,
      pacote: { peso: PADRAO_ITEM.peso_g / 1000, altura: PADRAO_ITEM.altura_cm, largura: PADRAO_ITEM.largura_cm, comprimento: PADRAO_ITEM.comprimento_cm },
      valorDeclarado: 50,
    });
    return { todas: cotacoes, comRegras: aplicarRegras(cotacoes, regrasDa(c), 0) };
  });
}

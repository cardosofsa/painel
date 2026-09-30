"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { lancarErroSupabase } from "@/lib/erros";
import { validar, iaChaveSchema, iaCadastroSchema } from "@/lib/validacao";
import { comResultado } from "@/lib/acao";
import { cifrar, cofreDisponivel, finalDaChave } from "@/lib/ia/cofre";
import { ErroIA } from "@/lib/ia/erro";
import { chamarProvedor, listarModelos, PROVEDORES } from "@/lib/ia/provedores";

/**
 * Cadastro de IAs da conta. A chave em texto só existe DENTRO destas funções: entra pelo
 * formulário, é testada, cifrada e gravada. Nada aqui a devolve ao navegador — a tela só
 * recebe provedor, modelo e os 4 últimos caracteres.
 */

const MAX_IAS_POR_CONTA = 8;
const idSchema = z.object({ id: z.string().uuid() });

function revalidarIA() {
  revalidatePath("/configuracoes");
  // Os botões "Gerar com IA" dessas telas dependem de a conta ter alguma IA disponível.
  revalidatePath("/produtos");
  revalidatePath("/precificacao");
  revalidatePath("/catalogo");
}

/** Testa a chave e devolve os modelos que ela enxerga. Chave errada volta como erro claro. */
export async function testarChaveIA(dados: { provedor: string; chave: string }) {
  return comResultado(async (): Promise<string[]> => {
    const v = validar(iaChaveSchema, dados);
    // Exige sessão: sem isso a action viraria um testador de chaves roubadas aberto ao mundo.
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error("Sessão expirada. Entre de novo.");
    return listarModelos(v.provedor, v.chave);
  });
}

/**
 * Faz uma chamada mínima de verdade. Listar modelos prova que a chave vale; só uma geração
 * prova que ESTE modelo responde (id digitado errado, modelo sem acesso, sem saldo).
 * Resposta vazia ou recusa de conteúdo contam como sucesso: a chamada chegou ao modelo.
 */
async function provarModelo(provedor: z.infer<typeof iaChaveSchema>["provedor"], chave: string, modelo: string) {
  try {
    await chamarProvedor({ provedor, chave, modelo }, 'Responda com o JSON {"ok": true}.', {
      maxTokens: 60,
      temperatura: 0,
      esquema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
      timeoutMs: 25_000,
    });
  } catch (e) {
    if (e instanceof ErroIA && (e.codigo === "vazio" || e.codigo === "bloqueado_seguranca")) return;
    // A chave lista modelos sem crédito (listar é grátis), mas gerar não: conta sem saldo ou
    // sem cobrança ativada. A mensagem genérica de `sem_credito` fala da IA do sistema, que
    // não é o caso aqui.
    if (e instanceof ErroIA && e.codigo === "sem_credito") {
      throw new Error(
        "A chave é válida, mas a conta do provedor está sem crédito. Ative a cobrança ou adicione saldo no site do provedor e tente de novo.",
      );
    }
    throw e;
  }
}

export async function adicionarIA(dados: { provedor: string; chave: string; modelo: string; padrao: boolean }) {
  return comResultado(async () => {
    const v = validar(iaCadastroSchema, dados);
    if (!cofreDisponivel()) {
      throw new Error("O cofre de chaves não está configurado neste sistema. Avise o administrador.");
    }

    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) throw new Error("Sessão expirada. Entre de novo.");

    const { count, error: erroContagem } = await supabase
      .from("ia_provedores")
      .select("id", { count: "exact", head: true });
    if (erroContagem) lancarErroSupabase(erroContagem);
    if ((count ?? 0) >= MAX_IAS_POR_CONTA) {
      throw new Error(`Limite de ${MAX_IAS_POR_CONTA} IAs cadastradas. Remova alguma antes de adicionar outra.`);
    }

    await provarModelo(v.provedor, v.chave, v.modelo);

    const { data: nova, error } = await supabase
      .from("ia_provedores")
      .insert({
        provedor: v.provedor,
        modelo: v.modelo,
        chave_cifrada: cifrar(v.chave, user.id),
        chave_final: finalDaChave(v.chave),
        ultimo_teste_em: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) lancarErroSupabase(error);

    // A primeira IA da conta vira padrão sozinha; nas seguintes, só se a pessoa pediu.
    if (v.padrao || (count ?? 0) === 0) {
      const { error: erroPadrao } = await supabase.rpc("ia_definir_padrao", { p_id: nova.id });
      if (erroPadrao) lancarErroSupabase(erroPadrao);
    }
    revalidarIA();
    return { rotulo: `${PROVEDORES[v.provedor].nome} · ${v.modelo}` };
  });
}

export async function definirIAPadrao(id: string) {
  return comResultado(async () => {
    const v = validar(idSchema, { id });
    const supabase = await createClient();
    const { error } = await supabase.rpc("ia_definir_padrao", { p_id: v.id });
    if (error) lancarErroSupabase(error);
    revalidarIA();
  });
}

/** Volta a usar a IA do sistema: nenhuma das próprias fica como padrão. */
export async function usarIADoSistema() {
  return comResultado(async () => {
    const supabase = await createClient();
    const { error } = await supabase.from("ia_provedores").update({ padrao: false }).eq("padrao", true);
    if (error) lancarErroSupabase(error);
    revalidarIA();
  });
}

export async function removerIA(id: string) {
  return comResultado(async () => {
    const v = validar(idSchema, { id });
    const supabase = await createClient();
    const { error } = await supabase.from("ia_provedores").delete().eq("id", v.id);
    if (error) lancarErroSupabase(error);
    revalidarIA();
  });
}

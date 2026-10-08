import { createClient } from "@/lib/supabase/server";
import { carregarAvisosWhatsapp } from "@/lib/vixe/mensagens-servidor";
import { rotuloPlanoTopo, temPlanoAcima, type Plano, type ResumoAssinatura } from "@/lib/planos";
import { TopBar } from "./TopBar";

type PropsComuns = {
  ehMaster: boolean;
  /** Abas que a pessoa (ou o operador) pode abrir: a busca Ctrl+K só mostra essas. */
  abas: string[];
  veMensagens: boolean;
  operador: string | null;
  exigeOperador: boolean;
};

/**
 * Cabeçalho com os dados que NÃO precisam segurar a página: nome do negócio, alertas, plano e
 * avisos de WhatsApp. O layout o monta dentro de um `<Suspense>` com o mesmo cabeçalho vazio
 * de reserva, então a página aparece na hora e o sino/selo entram em seguida. Antes eram 3 a
 * 5 consultas em série antes de qualquer tela, em toda navegação.
 */
export async function TopBarServidor({ ehMaster, abas, veMensagens, operador, exigeOperador }: PropsComuns) {
  const supabase = await createClient();
  const [perfilNegocioRes, alertasRes, planosRes, assinaturaRes, avisosWhatsapp] = await Promise.all([
    supabase.from("perfil_negocio").select("nome_negocio").maybeSingle(),
    // Alertas pendentes (estoque mínimo). Se a tabela ainda não existir (migração 0034 não
    // aplicada), o erro é ignorado e o sino aparece vazio — não derruba o painel.
    supabase
      .from("alertas")
      // `*`: tipo, link e canal (pedidos novos) só existem a partir da 0050.
      .select("*")
      .eq("status", "novo")
      .order("criado_em", { ascending: false })
      .limit(30),
    // Plano no topo (0057). Master não assina nada; sem a migração o selo some.
    ehMaster ? null : supabase.from("planos").select("id, nome, ativo, ordem").eq("ativo", true),
    ehMaster ? null : supabase.rpc("minha_assinatura"),
    // Falha aqui não derruba o painel: o sino fica só com os alertas.
    veMensagens ? carregarAvisosWhatsapp(supabase).catch(() => null) : null,
  ]);

  let plano: { rotulo: string; upgrade: boolean } | null = null;
  if (planosRes && assinaturaRes && !planosRes.error && !assinaturaRes.error && assinaturaRes.data) {
    const resumo = assinaturaRes.data as ResumoAssinatura;
    const planos = (planosRes.data ?? []) as Pick<Plano, "id" | "nome" | "ativo" | "ordem">[];
    plano = { rotulo: rotuloPlanoTopo(resumo, planos), upgrade: temPlanoAcima(resumo, planos) };
  }

  return (
    <TopBar
      nomeNegocio={perfilNegocioRes.data?.nome_negocio ?? null}
      alertas={alertasRes.data ?? []}
      mensagens={avisosWhatsapp?.mensagens ?? []}
      verVixe={veMensagens}
      abas={abas}
      plano={plano}
      operador={operador}
      exigeOperador={exigeOperador}
    />
  );
}

/** Reserva enquanto os dados chegam: o mesmo cabeçalho, sem sino nem selo. */
export function TopBarReserva({ abas, operador, exigeOperador }: Pick<PropsComuns, "abas" | "operador" | "exigeOperador">) {
  return <TopBar nomeNegocio={null} alertas={[]} abas={abas} operador={operador} exigeOperador={exigeOperador} />;
}

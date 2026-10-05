import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SidebarMobileProvider } from "@/components/layout/SidebarMobileContext";
import { GuardaNumericos } from "@/components/ui/GuardaNumericos";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";
import { ABAS_OBRIGATORIAS } from "@/lib/acesso";
import { carregarAvisosWhatsapp } from "@/lib/vixe/mensagens-servidor";
import { rotuloPlanoTopo, temPlanoAcima, type Plano, type ResumoAssinatura } from "@/lib/planos";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // Papel e abas vêm do middleware (JWT validado + `perfis_acesso` ou o cookie assinado),
  // pelo cabeçalho interno — antes eram `getUser()` + `perfis_acesso` aqui de novo, dois
  // round-trips em série em toda navegação.
  const acesso = await acessoAtual();

  // A marcação de visita (para o painel master saber quem usa de verdade) roda DEPOIS da
  // resposta: o resultado não é usado e esperar por ela atrasava todas as navegações.
  after(async () => {
    await supabase.rpc("tocar_ultimo_acesso");
  });

  const ehMaster = acesso?.papel === "master";
  const abasOperador = acesso?.operador && acesso.operador.id !== "dono" ? acesso.operador.abas : null;
  // Avisos de WhatsApp (Vixe → Mensagens) no sino: só para quem enxerga a aba Vixe.
  const veMensagens = !ehMaster && !!acesso?.abas.includes("vixe") && (!abasOperador || abasOperador.includes("vixe"));
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
    <SidebarMobileProvider>
      <GuardaNumericos />
      <div className="flex min-h-screen bg-background">
        <Sidebar abas={acesso?.abas ?? ABAS_OBRIGATORIAS} ehMaster={ehMaster} abasOperador={abasOperador} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar
            nomeNegocio={perfilNegocioRes.data?.nome_negocio ?? null}
            alertas={alertasRes.data ?? []}
            mensagens={avisosWhatsapp?.mensagens ?? []}
            verVixe={veMensagens}
            plano={plano}
            operador={acesso?.operador?.nome ?? null}
            exigeOperador={!!acesso?.exigeOperador}
          />
          <main className="flex-1 p-4 sm:p-6 print:p-0 max-w-[1700px] w-full mx-auto">{children}</main>
        </div>
      </div>
    </SidebarMobileProvider>
  );
}

import { Suspense } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBarReserva, TopBarServidor } from "@/components/layout/TopBarServidor";
import { SidebarMobileProvider } from "@/components/layout/SidebarMobileContext";
import { GuardaNumericos } from "@/components/ui/GuardaNumericos";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acessoAtual } from "@/lib/supabase/acesso-servidor";
import { ABAS_OBRIGATORIAS, normalizarAbas } from "@/lib/acesso";

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
  const abasDaPessoa = ehMaster ? [] : normalizarAbas(acesso?.abas ?? ABAS_OBRIGATORIAS).filter((a) => !abasOperador || abasOperador.includes(a));
  const operador = acesso?.operador?.nome ?? null;
  const exigeOperador = !!acesso?.exigeOperador;

  return (
    <SidebarMobileProvider>
      <GuardaNumericos />
      <div className="flex min-h-screen bg-background">
        <Sidebar abas={acesso?.abas ?? ABAS_OBRIGATORIAS} ehMaster={ehMaster} abasOperador={abasOperador} />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Os dados do cabeçalho chegam em streaming: a página não espera por eles. */}
          <Suspense fallback={<TopBarReserva abas={abasDaPessoa} operador={operador} exigeOperador={exigeOperador} />}>
            <TopBarServidor ehMaster={ehMaster} abas={abasDaPessoa} veMensagens={veMensagens} operador={operador} exigeOperador={exigeOperador} />
          </Suspense>
          <main className="flex-1 p-4 sm:p-6 print:p-0 max-w-[1700px] w-full mx-auto">{children}</main>
        </div>
      </div>
    </SidebarMobileProvider>
  );
}

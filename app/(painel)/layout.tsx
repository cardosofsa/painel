import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SidebarMobileProvider } from "@/components/layout/SidebarMobileContext";
import { createClient } from "@/lib/supabase/server";
import { ABAS_OBRIGATORIAS } from "@/lib/acesso";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // A marcação de visita (para o painel master saber quem usa de verdade) entra no mesmo
  // `Promise.all`: o resultado dela não é usado, e esperá-la em série custava um
  // round-trip inteiro ao Supabase ANTES de qualquer `page.tsx` começar a renderizar —
  // em 100% das navegações do painel. A função em si já ignora chamadas seguidas, mas
  // isso só evita a escrita, não a ida até o banco.
  const [perfilNegocioRes, acessoRes] = await Promise.all([
    supabase.from("perfil_negocio").select("nome_negocio").maybeSingle(),
    supabase.from("perfis_acesso").select("papel, abas").maybeSingle(),
    supabase.rpc("tocar_ultimo_acesso"),
  ]);

  return (
    <SidebarMobileProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar abas={acessoRes.data?.abas ?? ABAS_OBRIGATORIAS} ehMaster={acessoRes.data?.papel === "master"} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar nomeNegocio={perfilNegocioRes.data?.nome_negocio ?? null} />
          <main className="flex-1 p-4 sm:p-6 max-w-[1700px] w-full mx-auto">{children}</main>
        </div>
      </div>
    </SidebarMobileProvider>
  );
}

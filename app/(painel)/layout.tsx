import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SidebarMobileProvider } from "@/components/layout/SidebarMobileContext";
import { createClient } from "@/lib/supabase/server";
import { ABAS_OBRIGATORIAS } from "@/lib/acesso";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  const [perfilNegocioRes, acessoRes] = await Promise.all([
    supabase.from("perfil_negocio").select("nome_negocio").maybeSingle(),
    supabase.from("perfis_acesso").select("papel, abas").maybeSingle(),
  ]);

  // Marca a visita para o painel master saber quem usa de verdade. A própria função
  // ignora chamadas seguidas (só grava se a última foi há mais de uma hora).
  await supabase.rpc("tocar_ultimo_acesso");

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

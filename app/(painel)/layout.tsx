import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SidebarMobileProvider } from "@/components/layout/SidebarMobileContext";
import { createClient } from "@/lib/supabase/server";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: perfil } = await supabase.from("perfil_negocio").select("nome_negocio").maybeSingle();

  return (
    <SidebarMobileProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar nomeNegocio={perfil?.nome_negocio ?? null} />
          <main className="flex-1 p-4 sm:p-6 max-w-[1700px] w-full mx-auto">{children}</main>
        </div>
      </div>
    </SidebarMobileProvider>
  );
}

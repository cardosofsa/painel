import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SidebarMobileProvider } from "@/components/layout/SidebarMobileContext";
import { GuardaNumericos } from "@/components/ui/GuardaNumericos";
import { createClient } from "@/lib/supabase/server";
import { ABAS_OBRIGATORIAS } from "@/lib/acesso";

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();

  // `perfis_acesso` é a única tabela cuja policy não devolve só a própria linha: a
  // `le_perfil_acesso` (migração 0020) é `auth.uid() = user_id OR e_master()`. Para o
  // master isso traz TODAS as contas, o `maybeSingle()` abaixo estourava PGRST116, o
  // `data` vinha nulo — e o próprio master ficava sem o link do /admin e com o menu
  // reduzido às abas obrigatórias. Por isso o `.eq("user_id", ...)`, e por isso o
  // `getUser()` precisa vir antes. É um round-trip a mais por navegação; a alternativa
  // (ler o id do cookie sem validar) trocaria um bug visível por uma dúvida de segurança.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A marcação de visita (para o painel master saber quem usa de verdade) entra no mesmo
  // `Promise.all`: o resultado dela não é usado, e esperá-la em série custava um
  // round-trip inteiro ao Supabase ANTES de qualquer `page.tsx` começar a renderizar —
  // em 100% das navegações do painel. A função em si já ignora chamadas seguidas, mas
  // isso só evita a escrita, não a ida até o banco.
  const [perfilNegocioRes, acessoRes, alertasRes] = await Promise.all([
    supabase.from("perfil_negocio").select("nome_negocio").maybeSingle(),
    supabase.from("perfis_acesso").select("papel, abas").eq("user_id", user?.id ?? "").maybeSingle(),
    supabase.rpc("tocar_ultimo_acesso"),
    // Alertas pendentes (estoque mínimo). Se a tabela ainda não existir (migração 0034 não
    // aplicada), o erro é ignorado e o sino aparece vazio — não derruba o painel.
    supabase
      .from("alertas")
      .select("id, mensagem, produto_id, criado_em")
      .eq("status", "novo")
      .order("criado_em", { ascending: false })
      .limit(30),
  ]);

  return (
    <SidebarMobileProvider>
      <GuardaNumericos />
      <div className="flex min-h-screen bg-background">
        <Sidebar abas={acessoRes.data?.abas ?? ABAS_OBRIGATORIAS} ehMaster={acessoRes.data?.papel === "master"} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar nomeNegocio={perfilNegocioRes.data?.nome_negocio ?? null} alertas={alertasRes.data ?? []} />
          <main className="flex-1 p-4 sm:p-6 print:p-0 max-w-[1700px] w-full mx-auto">{children}</main>
        </div>
      </div>
    </SidebarMobileProvider>
  );
}

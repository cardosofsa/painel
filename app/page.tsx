import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Calculator, Sparkles, Store } from "lucide-react";
import { IconeCacto } from "@/components/ui/IconeCacto";
import { LinksLegais } from "@/components/legal/LinksLegais";
import { createClient } from "@/lib/supabase/server";

/**
 * Página inicial pública. Quem já entrou vai direto para o painel; quem não entrou vê o que
 * o SERTÃO faz. O texto é exigido pelo Google para verificar o login: a página inicial
 * precisa explicar a finalidade do app e como ele usa os dados da conta Google.
 */
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const recursos = [
    {
      icone: Calculator,
      titulo: "Precificação",
      texto:
        "Calcule o preço de venda de cada produto considerando custo, taxas e comissão de cada marketplace, e veja a margem real.",
    },
    {
      icone: Boxes,
      titulo: "Estoque, compras e vendas",
      texto:
        "Controle produtos, fornecedores, pedidos de compra, vendas, fiado e o financeiro do negócio num só lugar.",
    },
    {
      icone: Store,
      titulo: "Vitrine online",
      texto:
        "Publique um catálogo com link próprio para seus clientes verem os produtos e enviarem pedidos pelo celular.",
    },
    {
      icone: Sparkles,
      titulo: "Ajuda de IA",
      texto:
        "Gere títulos e descrições de anúncios com IA, usando a IA do sistema no teste ou a sua própria chave.",
    },
  ];

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <main className="max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <span className="w-8 h-8 rounded-md bg-accent flex items-center justify-center text-accent-on shrink-0">
            <IconeCacto size={18} strokeWidth={2.25} />
          </span>
          <span className="font-semibold tracking-tight text-text-primary text-xl">
            SERTÃO
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-semibold text-text-primary leading-tight">
          Sistema de gestão para pequenos negócios que vendem online
        </h1>
        <p className="mt-3 text-text-secondary leading-relaxed">
          O SERTÃO ajuda quem vende em marketplaces e no WhatsApp a saber quanto
          cobrar, quanto tem em estoque e quanto realmente lucra em cada venda.
          Você cria uma conta, cadastra seus produtos e usa as ferramentas
          abaixo.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-md bg-accent text-accent-on text-sm font-medium px-4 py-2 hover:bg-accent-hover"
          >
            Entrar
          </Link>
          <Link
            href="/signup"
            className="rounded-md border border-border text-text-primary text-sm font-medium px-4 py-2 hover:bg-surface-2"
          >
            Criar conta
          </Link>
        </div>

        <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {recursos.map(({ icone: Icone, titulo, texto }) => (
            <li
              key={titulo}
              className="bg-surface-1 border border-border rounded-lg p-4"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icone size={16} className="text-accent" />
                <h2 className="font-semibold text-text-primary text-sm">
                  {titulo}
                </h2>
              </div>
              <p className="text-sm text-text-secondary leading-relaxed">
                {texto}
              </p>
            </li>
          ))}
        </ul>

        <section className="mt-10 text-sm text-text-secondary leading-relaxed">
          <h2 className="font-semibold text-text-primary mb-1.5">
            Entrar com o Google
          </h2>
          <p>
            Você pode entrar com sua conta Google. O SERTÃO recebe apenas seu
            nome, e-mail e foto de perfil, usados para identificar sua conta.
            Não acessamos seus e-mails, contatos ou arquivos, e não
            compartilhamos esses dados. Veja os detalhes na{" "}
            <Link href="/privacidade" className="text-accent hover:underline">
              Política de Privacidade
            </Link>
            .
          </p>
        </section>

        <LinksLegais className="mt-10" />
      </main>
    </div>
  );
}

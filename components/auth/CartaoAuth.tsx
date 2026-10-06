import type { ReactNode } from "react";
import Link from "next/link";
import { Calculator, CalendarDays, ShieldCheck } from "lucide-react";
import { LogoSertao } from "@/components/ui/LogoSertao";

const DESTAQUES = [
  { icone: Calculator, titulo: "Preço certo em cada canal", texto: "Taxas e faixas de comissão da Shopee e do Mercado Livre, com o lucro real de cada venda." },
  { icone: CalendarDays, titulo: "Nada passa batido", texto: "Feriados do seu estado, datas que vendem e contas a pagar no mesmo calendário." },
  { icone: ShieldCheck, titulo: "Seus dados, só seus", texto: "Cada conta isolada no banco, com backup e exportação quando quiser." },
];

/**
 * Casca das telas de autenticação (entrar, criar conta, recuperar senha, redefinir senha).
 *
 * Em tela grande, divide em duas: à esquerda a marca e o que o sistema resolve (quem chega
 * pelo login também está decidindo se fica), à direita o formulário. No celular, só o
 * formulário. O logo leva de volta à página inicial.
 */
export function CartaoAuth({
  titulo,
  descricao,
  children,
  rodape,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] bg-background">
      <aside className="hidden lg:flex flex-col justify-between bg-accent text-accent-on p-10 xl:p-14">
        <Link href="/" className="flex items-center gap-2 w-fit rounded-md">
          <span className="rounded-lg bg-background p-1">
            <LogoSertao tamanho={32} prioridade />
          </span>
          <span className="font-semibold tracking-tight text-xl">Sertão</span>
        </Link>
        <div className="max-w-md">
          <p className="text-3xl font-semibold tracking-tight leading-tight">Saiba quanto cobrar, quanto tem e quanto lucra de verdade.</p>
          <ul className="mt-8 space-y-5">
            {DESTAQUES.map(({ icone: Icone, titulo: t, texto }) => (
              <li key={t} className="flex items-start gap-3">
                <span className="mt-0.5 rounded-md bg-accent-hover w-8 h-8 flex items-center justify-center shrink-0">
                  <Icone size={18} />
                </span>
                <span>
                  <span className="block font-medium">{t}</span>
                  <span className="block text-sm opacity-85 leading-relaxed">{texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs opacity-75">Gestão para quem vende online e no WhatsApp.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="flex items-center gap-2 mb-6 w-fit rounded-md lg:hidden">
            <LogoSertao tamanho={36} prioridade />
            <span className="font-semibold tracking-tight text-text-primary text-lg">Sertão</span>
          </Link>

          <div className="bg-surface-1 border border-border rounded-lg shadow-elev-1 p-6">
            <h1 className="text-lg font-semibold text-text-primary mb-1">{titulo}</h1>
            {descricao && <p className="text-sm text-text-secondary mb-5">{descricao}</p>}
            {!descricao && <div className="mb-5" />}
            {children}
          </div>

          {rodape && <div className="text-center text-xs text-text-secondary mt-4">{rodape}</div>}
        </div>
      </main>
    </div>
  );
}

/**
 * Mensagem de erro do formulário. `role="alert"` é o que faz o leitor de tela anunciar o
 * problema — antes o erro aparecia só visualmente e era silencioso.
 */
export function ErroAuth({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-negative mb-4">
      {children}
    </p>
  );
}

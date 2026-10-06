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
      {/* Faixa da marca: tokens `--marca-*`, escuros nos dois temas. Com `bg-accent` o
          modo noturno virava um verde-limão com texto preto. */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-marca-fundo text-marca-texto p-10 xl:p-14">
        <FundoMarca />
        <Link href="/" className="relative flex items-center gap-2 w-fit rounded-md">
          <span className="rounded-lg bg-marca-texto p-1">
            <LogoSertao tamanho={32} prioridade />
          </span>
          <span className="font-semibold tracking-tight text-xl">Sertão</span>
        </Link>
        <div className="relative max-w-md">
          <p className="text-3xl xl:text-4xl font-semibold tracking-tight leading-tight">
            Saiba quanto cobrar, quanto tem e <span className="text-marca-sol">quanto lucra</span> de verdade.
          </p>
          <ul className="mt-9 space-y-5">
            {DESTAQUES.map(({ icone: Icone, titulo: t, texto }) => (
              <li key={t} className="flex items-start gap-3">
                <span className="mt-0.5 rounded-lg bg-marca-realce border border-marca-borda w-9 h-9 flex items-center justify-center shrink-0 text-marca-sol">
                  <Icone size={18} aria-hidden />
                </span>
                <span>
                  <span className="block font-medium">{t}</span>
                  <span className="block text-sm text-marca-texto-suave leading-relaxed">{texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-marca-texto-suave">Gestão para quem vende online e no WhatsApp.</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <Link href="/" className="flex items-center gap-2 mb-6 w-fit rounded-md lg:hidden">
            <LogoSertao tamanho={36} prioridade />
            <span className="font-semibold tracking-tight text-text-primary text-lg">Sertão</span>
          </Link>

          <div className="bg-surface-1 border border-border rounded-xl shadow-elev-2 p-6 sm:p-7">
            <h1 className="text-xl font-semibold tracking-tight text-text-primary mb-1">{titulo}</h1>
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
 * Fundo decorativo da faixa da marca: o sol do logo como brilho no canto e um relevo de
 * dunas embaixo. Tudo em `currentColor`/tokens, então segue o tema sozinho.
 */
function FundoMarca() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-marca-sol opacity-[0.12] blur-3xl" />
      <div className="absolute top-24 right-16 w-28 h-28 rounded-full border border-marca-sol opacity-25" />
      <svg className="absolute bottom-0 left-0 w-full h-48 text-marca-realce" viewBox="0 0 600 200" preserveAspectRatio="none">
        <path fill="currentColor" d="M0 140 C 120 90, 220 170, 340 120 S 520 80, 600 120 L600 200 L0 200 Z" opacity="0.9" />
        <path fill="currentColor" d="M0 170 C 140 130, 260 200, 400 160 S 540 140, 600 160 L600 200 L0 200 Z" opacity="0.6" />
      </svg>
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

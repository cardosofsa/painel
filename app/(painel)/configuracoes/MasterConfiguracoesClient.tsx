import { PageHeader } from "@/components/layout/PageHeader";
import { ContaCard } from "./ContaCard";
import { PlanosEditor } from "@/components/admin/PlanosEditor";
import type { Plano } from "@/lib/planos";

/**
 * Versão enxuta de Configurações para o master. A tela cheia (`ConfiguracoesClient.tsx`)
 * mistura 5 cards de dado de loja (perfil do negócio, regime tributário, PIN de vendas,
 * backup) que não fazem sentido para quem administra o sistema e não roda loja nenhuma por
 * esta conta — só o e-mail/senha (`ContaCard`) é relevante aqui.
 */
export function MasterConfiguracoesClient({ email, planos }: { email: string; planos: Plano[] | null }) {
  return (
    <>
      <PageHeader eyebrow="Conta master" title="Minha Conta" />
      <div className="grid gap-4 lg:grid-cols-[28rem_minmax(0,1fr)] items-start">
        <ContaCard email={email} />
        <PlanosEditor planos={planos} />
      </div>
    </>
  );
}

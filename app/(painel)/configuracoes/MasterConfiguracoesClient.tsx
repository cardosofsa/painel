import { PageHeader } from "@/components/layout/PageHeader";
import { ContaCard } from "./ContaCard";

/**
 * Versão enxuta de Configurações para o master. A tela cheia (`ConfiguracoesClient.tsx`)
 * mistura 5 cards de dado de loja (perfil do negócio, regime tributário, PIN de vendas,
 * backup) que não fazem sentido para quem administra o sistema e não roda loja nenhuma por
 * esta conta — só o e-mail/senha (`ContaCard`) é relevante aqui.
 */
export function MasterConfiguracoesClient({ email }: { email: string }) {
  return (
    <>
      <PageHeader eyebrow="Conta master" title="Minha Conta" />
      <div className="max-w-md">
        <ContaCard email={email} />
      </div>
    </>
  );
}

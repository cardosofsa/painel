"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AlertTriangle } from "lucide-react";
import { reportarErroNavegador } from "@/app/erros-actions";

/**
 * Boundary do painel autenticado.
 *
 * Existe para que uma falha numa tela não caia no boundary raiz, que substitui a página
 * INTEIRA — incluindo a barra lateral e o topo — e deixa o usuário sem navegação nenhuma,
 * só com um botão. Aqui o erro fica contido dentro do `<main>` e o menu continua de pé.
 */
export default function PainelErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
    // Observabilidade (0076): vai para o Admin → Erros. Disparo e esquece.
    reportarErroNavegador({ mensagem: error.message, rota: window.location.pathname, digest: error.digest ?? null }).catch(() => undefined);
  }, [error]);

  return (
    <div className="min-h-[50vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-surface-1 border border-border rounded-lg p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-negative-soft text-negative flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={20} />
        </div>
        <h1 className="text-lg font-semibold text-text-primary mb-2">Não foi possível carregar esta tela</h1>
        <p className="text-sm text-text-secondary mb-5">
          Costuma ser temporário. Tente de novo; se continuar, use o menu ao lado para seguir
          para outra área enquanto isso.
        </p>
        <div className="flex gap-2 justify-center">
          <Button variant="primary" onClick={reset}>
            Tentar de novo
          </Button>
          <Button variant="secondary" onClick={() => router.push("/dashboard")}>
            Ir para o início
          </Button>
        </div>
        {error.digest && <p className="text-xs text-text-tertiary mt-4 font-mono">Código: {error.digest}</p>}
      </div>
    </div>
  );
}

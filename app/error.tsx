"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { AlertTriangle } from "lucide-react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-surface-1 border border-border rounded-lg shadow-elev-1 p-6 text-center">
        <div className="w-10 h-10 rounded-full bg-negative-soft text-negative flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={20} />
        </div>
        <h1 className="text-lg font-semibold text-text-primary mb-2">Algo deu errado ao carregar esta página</h1>
        <p className="text-sm text-text-secondary mb-5">
          A consulta ao banco de dados falhou. Isso costuma ser temporário — tente de novo. Se continuar, pode ser
          que uma migração do banco ainda não tenha sido aplicada.
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

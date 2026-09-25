"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { AlertTriangle } from "lucide-react";

/**
 * Boundary da vitrine pública.
 *
 * Quem vê esta tela é o CLIENTE FINAL do lojista, que abriu um link do WhatsApp — não o
 * dono do sistema. O boundary raiz fala em "migração do banco não aplicada" e oferece um
 * botão para /dashboard, uma rota autenticada que essa pessoa não consegue abrir. Aqui a
 * linguagem é de loja e a única ação oferecida é recarregar.
 */
export default function VitrineErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="max-w-sm w-full text-center">
        <div className="w-10 h-10 rounded-full bg-negative-soft text-negative flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={20} />
        </div>
        <h1 className="text-lg font-semibold text-text-primary mb-2">Catálogo indisponível no momento</h1>
        <p className="text-sm text-text-secondary mb-5">
          Não conseguimos carregar os produtos agora. Tente de novo em instantes.
        </p>
        <Button variant="primary" onClick={reset}>
          Tentar de novo
        </Button>
      </div>
    </div>
  );
}

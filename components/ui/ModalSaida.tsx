"use client";

import { useEffect, useRef } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";
import type { ProtecaoSaida } from "@/lib/hooks/useProtegerSaida";

/**
 * "Você tem alterações não salvas": o modal da proteção de saída (`useProtegerSaida`).
 * "Continuar aqui" é o padrão e recebe o foco: Enter por engano não descarta nada.
 */
export function ModalSaida({ protecao }: { protecao: ProtecaoSaida }) {
  const ficar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Depois do efeito do <Modal> (filho roda antes), que foca o painel.
    if (protecao.aberto) ficar.current?.focus();
  }, [protecao.aberto]);

  return (
    <Modal open={protecao.aberto} onClose={protecao.continuar} title="Você tem alterações não salvas" width="max-w-lg">
      <p className="text-sm text-text-secondary mb-5">Se sair agora, o que você mudou desde o último salvamento se perde.</p>
      <div className="flex flex-col sm:flex-row gap-2">
        {protecao.podeSalvar && (
          <Button variant="primary" className="flex-1" onClick={() => void protecao.salvarESair()} loading={protecao.salvando}>
            Salvar rascunho e sair
          </Button>
        )}
        <Button variant="destructive" className="flex-1" onClick={protecao.sair} disabled={protecao.salvando}>
          Sair sem salvar
        </Button>
        <Button ref={ficar} variant="secondary" className="flex-1" onClick={protecao.continuar} disabled={protecao.salvando}>
          Continuar aqui
        </Button>
      </div>
    </Modal>
  );
}

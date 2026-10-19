"use client";

import { useCallback, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  /** Só em `escolher()`: terceiro botão, entre Cancelar e o de confirmar. */
  alternativaLabel?: string;
}

export type Escolha = "confirmar" | "alternativa" | "cancelar";

/**
 * Hook de confirmação: `await confirm({...})` resolve `true`/`false` conforme o clique do usuário.
 * Renderize `ConfirmDialog` uma vez no componente que usa o hook.
 */
export function useConfirm() {
  const [opcoes, setOpcoes] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(valor: Escolha) => void>(null);

  const escolher = useCallback((options: ConfirmOptions) => {
    setOpcoes(options);
    return new Promise<Escolha>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => escolher({ ...options, alternativaLabel: undefined }).then((e) => e === "confirmar"),
    [escolher],
  );

  function responder(valor: Escolha) {
    setOpcoes(null);
    resolver.current?.(valor);
  }

  const ConfirmDialog = (
    <Modal open={!!opcoes} onClose={() => responder("cancelar")} title={opcoes?.title ?? ""}>
      <p className="text-sm text-text-secondary mb-5">{opcoes?.message}</p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => responder("cancelar")}>
          Cancelar
        </Button>
        {opcoes?.alternativaLabel && (
          <Button variant="secondary" className="flex-1" onClick={() => responder("alternativa")}>
            {opcoes.alternativaLabel}
          </Button>
        )}
        <Button variant="destructive" className="flex-1" onClick={() => responder("confirmar")}>
          {opcoes?.confirmLabel ?? "Remover"}
        </Button>
      </div>
    </Modal>
  );

  return { confirm, escolher, ConfirmDialog };
}

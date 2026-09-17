"use client";

import { useCallback, useRef, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
}

/**
 * Hook de confirmação: `await confirm({...})` resolve `true`/`false` conforme o clique do usuário.
 * Renderize `ConfirmDialog` uma vez no componente que usa o hook.
 */
export function useConfirm() {
  const [opcoes, setOpcoes] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(valor: boolean) => void>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpcoes(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function responder(valor: boolean) {
    setOpcoes(null);
    resolver.current?.(valor);
  }

  const ConfirmDialog = (
    <Modal open={!!opcoes} onClose={() => responder(false)} title={opcoes?.title ?? ""}>
      <p className="text-sm text-text-secondary mb-5">{opcoes?.message}</p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => responder(false)}>
          Cancelar
        </Button>
        <Button variant="destructive" className="flex-1" onClick={() => responder(true)}>
          {opcoes?.confirmLabel ?? "Remover"}
        </Button>
      </div>
    </Modal>
  );

  return { confirm, ConfirmDialog };
}

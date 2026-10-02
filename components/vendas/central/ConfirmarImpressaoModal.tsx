"use client";

import { Printer } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Depois de mandar imprimir: confirma que saiu no papel antes de mover para Para Retirada.
 * Se a impressora falhou, Cancelar deixa o pedido em Para Imprimir.
 */
export function ConfirmarImpressaoModal({
  numeros,
  onImprimirDeNovo,
  onConfirmar,
  onClose,
  carregando,
}: {
  numeros: string[];
  onImprimirDeNovo: () => void;
  onConfirmar: () => void;
  onClose: () => void;
  carregando: boolean;
}) {
  const um = numeros.length === 1;
  return (
    <Modal open onClose={onClose} title={um ? `Pedido #${numeros[0]} impresso?` : `${numeros.length} pedidos impressos?`} width="max-w-sm">
      {!um && <p className="text-sm font-mono text-text-secondary mb-3 break-words">{numeros.map((n) => `#${n}`).join(", ")}</p>}
      <p className="text-sm text-text-secondary mb-4">
        Confirme quando a impressão sair. {um ? "O pedido vai" : "Os pedidos vão"} para <strong className="text-text-primary">Para Retirada</strong>.
      </p>
      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="ghost" onClick={onImprimirDeNovo}>
          <Printer size={14} /> Imprimir de novo
        </Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={carregando} onClick={onConfirmar}>
            Marcar como impresso
          </Button>
        </div>
      </div>
    </Modal>
  );
}

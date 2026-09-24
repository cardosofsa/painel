"use client";

import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import { linkComprovanteWhatsapp, textoComprovante, type DadosComprovante } from "@/lib/comprovante";

export function ReciboModal({
  recibo,
  whatsappCliente,
  onClose,
  onNovaVenda,
}: {
  recibo: DadosComprovante | null;
  whatsappCliente: string | null;
  onClose: () => void;
  onNovaVenda: () => void;
}) {
  async function copiar() {
    if (!recibo) return;
    try {
      await navigator.clipboard.writeText(textoComprovante(recibo));
      toast.success("Comprovante copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <Modal open={!!recibo} onClose={onClose} title={recibo ? `Venda ${recibo.numero} registrada` : ""} width="max-w-sm">
      {recibo && (
        <div>
          <div className="text-center mb-4">
            <div className="font-mono text-3xl font-semibold text-positive">{formatBRL(recibo.total)}</div>
            {recibo.clienteNome && <div className="text-sm text-text-secondary mt-1">{recibo.clienteNome}</div>}
          </div>

          <div className="divide-y divide-border border-y border-border mb-4">
            {recibo.itens.map((item, i) => (
              <div key={i} className="py-2 flex justify-between gap-3 text-sm">
                <span className="text-text-secondary">
                  {item.quantidade}× {item.nome}
                </span>
                <span className="font-mono text-text-primary shrink-0">{formatBRL(item.preco_unitario * item.quantidade)}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 mb-3">
            <a
              href={linkComprovanteWhatsapp(recibo, whatsappCliente)}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button variant="primary" className="w-full">
                <MessageCircle size={16} />
                {whatsappCliente ? "Enviar comprovante ao cliente" : "Enviar comprovante por WhatsApp"}
              </Button>
            </a>
            <Button variant="secondary" className="w-full" onClick={copiar}>
              <Copy size={14} />
              Copiar comprovante
            </Button>
          </div>

          <Button variant="secondary" className="w-full" onClick={onNovaVenda}>
            Nova venda
          </Button>
        </div>
      )}
    </Modal>
  );
}

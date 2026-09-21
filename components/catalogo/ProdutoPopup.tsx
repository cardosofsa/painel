"use client";

import { useState } from "react";
import { ImageIcon, MessageCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import type { ItemVitrine } from "./VitrineView";

/** Monta o link do WhatsApp: com o número do negócio quando cadastrado, ou o mesmo formato
 * sem número já usado em outras partes do sistema (deixa a pessoa escolher o contato). */
function linkComprarAgora(item: ItemVitrine, whatsapp: string | null) {
  const mensagem = `Olá! Tenho interesse no produto "${item.produto_nome}" (${formatBRL(item.preco)}).`;
  const texto = encodeURIComponent(mensagem);
  const digitos = whatsapp?.replace(/\D/g, "");
  if (digitos) {
    const numero = digitos.startsWith("55") ? digitos : `55${digitos}`;
    return `https://wa.me/${numero}?text=${texto}`;
  }
  return `https://wa.me/?text=${texto}`;
}

export function ProdutoPopup({
  item,
  negocioWhatsapp,
  onClose,
}: {
  item: ItemVitrine | null;
  negocioWhatsapp: string | null;
  onClose: () => void;
}) {
  const imagens = item ? [item.imagem_url, ...item.imagens_extra].filter((url): url is string => !!url) : [];
  const [imagemAtiva, setImagemAtiva] = useState(0);

  return (
    <Modal
      key={item?.produto_id ?? "fechado"}
      open={!!item}
      onClose={onClose}
      title={item?.produto_nome ?? ""}
      width="max-w-lg"
    >
      {item && (
        <div>
          <div className="aspect-square bg-surface-2 rounded-lg flex items-center justify-center overflow-hidden mb-2">
            {imagens.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL pública do storage
              <img src={imagens[imagemAtiva]} alt={item.produto_nome} className="w-full h-full object-cover" />
            ) : (
              <ImageIcon size={40} className="text-text-tertiary" />
            )}
          </div>

          {imagens.length > 1 && (
            <div className="flex gap-2 mb-4 overflow-x-auto">
              {imagens.map((url, i) => (
                <button
                  key={url}
                  onClick={() => setImagemAtiva(i)}
                  className={`w-14 h-14 rounded-md overflow-hidden border shrink-0 ${
                    i === imagemAtiva ? "border-accent" : "border-border"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL pública do storage */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          <div className="font-mono text-2xl text-accent font-semibold mb-2">{formatBRL(item.preco)}</div>

          {item.descricao && <p className="text-sm text-text-secondary mb-4 whitespace-pre-wrap">{item.descricao}</p>}

          <a href={linkComprarAgora(item, negocioWhatsapp)} target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="primary" className="w-full">
              <MessageCircle size={16} />
              Comprar Agora
            </Button>
          </a>
        </div>
      )}
    </Modal>
  );
}

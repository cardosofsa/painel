"use client";

import { useState } from "react";
import { ImageIcon, MessageCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import type { ItemVitrine, VarianteVitrine } from "./VitrineView";

/** Monta o link do WhatsApp: com o número do negócio quando cadastrado, ou o mesmo formato
 * sem número já usado em outras partes do sistema (deixa a pessoa escolher o contato). */
function linkComprarAgora(nomeProduto: string, preco: number, whatsapp: string | null) {
  const mensagem = `Olá! Tenho interesse no produto "${nomeProduto}" (${formatBRL(preco)}).`;
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
  const [varianteId, setVarianteId] = useState<string | null>(null);
  const [imagemAtiva, setImagemAtiva] = useState(0);

  const variantes: VarianteVitrine[] = item?.variantes ?? [];
  const temVariantes = variantes.length > 1;
  // Sem escolha ainda, mostra a variante mais barata — a mesma que o card anunciou.
  const selecionada =
    variantes.find((v) => v.produto_id === varianteId) ??
    variantes.reduce<VarianteVitrine | null>((menor, v) => (!menor || v.preco < menor.preco ? v : menor), null);

  const imagens = selecionada
    ? [selecionada.imagem_url, ...selecionada.imagens_extra].filter((url): url is string => !!url)
    : [];

  const nomeCompleto =
    item && selecionada?.variante_nome ? `${item.produto_nome} — ${selecionada.variante_nome}` : (item?.produto_nome ?? "");

  function trocarVariante(id: string) {
    setVarianteId(id);
    setImagemAtiva(0);
  }

  return (
    <Modal
      key={item?.produto_id ?? "fechado"}
      open={!!item}
      onClose={onClose}
      title={item?.produto_nome ?? ""}
      width="max-w-lg"
    >
      {item && selecionada && (
        <div>
          <div className="aspect-square bg-surface-2 rounded-lg flex items-center justify-center overflow-hidden mb-2">
            {imagens.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL pública do storage
              <img src={imagens[Math.min(imagemAtiva, imagens.length - 1)]} alt={nomeCompleto} className="w-full h-full object-cover" />
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

          {temVariantes && (
            <div className="mb-3">
              <div className="text-xs font-medium text-text-secondary mb-1.5">Escolha uma opção</div>
              <div className="flex flex-wrap gap-2">
                {variantes.map((v) => (
                  <button
                    key={v.produto_id}
                    onClick={() => trocarVariante(v.produto_id)}
                    className={`h-9 px-3 rounded-md text-sm border transition-colors ${
                      v.produto_id === selecionada.produto_id
                        ? "bg-accent-soft border-accent-soft text-accent"
                        : "bg-surface-1 border-border text-text-secondary hover:text-text-primary"
                    }`}
                  >
                    {v.variante_nome ?? "Padrão"}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="font-mono text-2xl text-accent font-semibold mb-2">{formatBRL(selecionada.preco)}</div>

          {item.descricao && <p className="text-sm text-text-secondary mb-4 whitespace-pre-wrap">{item.descricao}</p>}

          <a
            href={linkComprarAgora(nomeCompleto, selecionada.preco, negocioWhatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
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

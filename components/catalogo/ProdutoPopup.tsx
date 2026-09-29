"use client";

import { useState } from "react";
import { ImageIcon, Minus, Plus, ShoppingCart } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import type { ItemVitrine, VarianteVitrine } from "./VitrineView";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { Chip } from "@/components/ui/Chip";
import { MAX_QTD, type ItemCarrinhoVitrine } from "@/lib/vitrine-pedido";

export function ProdutoPopup({
  item,
  onAdicionar,
  onClose,
}: {
  item: ItemVitrine | null;
  /** Manda o item escolhido para o carrinho, que vive em `VitrineInterativa`. */
  onAdicionar: (item: ItemCarrinhoVitrine) => void;
  onClose: () => void;
}) {
  const [varianteId, setVarianteId] = useState<string | null>(null);
  const [imagemAtiva, setImagemAtiva] = useState(0);
  const [quantidade, setQuantidade] = useState(1);

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
              <ImagemStorage src={imagens[Math.min(imagemAtiva, imagens.length - 1)]} alt={nomeCompleto} prioridade className="w-full h-full object-cover" />
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
                  <ImagemStorage src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {temVariantes && (
            <div className="mb-3">
              <div className="text-xs font-medium text-text-secondary mb-1.5">Escolha uma opção</div>
              <div className="flex flex-wrap gap-2">
                {variantes.map((v) => (
                  <Chip key={v.produto_id} onClick={() => trocarVariante(v.produto_id)} ativo={v.produto_id === selecionada.produto_id}>
                    {v.variante_nome ?? "Padrão"}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="font-mono text-2xl text-accent font-semibold mb-2">{formatBRL(selecionada.preco)}</div>

          {item.descricao && <p className="text-sm text-text-secondary mb-4 whitespace-pre-wrap">{item.descricao}</p>}

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 border border-border rounded-md p-1">
              <IconButton
                onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
                disabled={quantidade <= 1}
                aria-label="Diminuir quantidade"
              >
                <Minus size={16} />
              </IconButton>
              <span className="font-mono text-sm w-8 text-center tabular" aria-live="polite">
                {quantidade}
              </span>
              <IconButton
                onClick={() => setQuantidade((q) => Math.min(MAX_QTD, q + 1))}
                disabled={quantidade >= MAX_QTD}
                aria-label="Aumentar quantidade"
              >
                <Plus size={16} />
              </IconButton>
            </div>

            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                onAdicionar({
                  produto_id: selecionada.produto_id,
                  nome: nomeCompleto,
                  preco: selecionada.preco,
                  quantidade,
                });
                onClose();
              }}
            >
              <ShoppingCart size={16} />
              Adicionar {quantidade > 1 ? `· ${formatBRL(selecionada.preco * quantidade)}` : ""}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

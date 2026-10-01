"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ImageIcon, MessageCircle, Minus, Plus, Share2, ShoppingCart } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import type { ItemVitrine, VarianteVitrine } from "@/lib/vitrine-catalogo";
import { textoConsultarProduto } from "@/lib/vitrine-catalogo";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { Chip } from "@/components/ui/Chip";
import { MAX_QTD, linkPedidoWhatsapp, type ItemCarrinhoVitrine } from "@/lib/vitrine-pedido";

export function ProdutoPopup({
  slug,
  varianteInicial = null,
  item,
  nomeCatalogo,
  negocioWhatsapp,
  onAdicionar,
  onClose,
}: {
  /** Para montar o link de compartilhar o produto. */
  slug: string;
  /** Variante pedida pelo link compartilhado. */
  varianteInicial?: string | null;
  item: ItemVitrine | null;
  nomeCatalogo: string;
  negocioWhatsapp: string | null;
  /** Manda o item escolhido para o carrinho, que vive em `VitrineInterativa`. */
  onAdicionar: (item: ItemCarrinhoVitrine) => void;
  onClose: () => void;
}) {
  const [varianteId, setVarianteId] = useState<string | null>(() =>
    varianteInicial && item?.variantes.some((v) => v.produto_id === varianteInicial) ? varianteInicial : null,
  );

  /** Link do produto (com prévia própria no WhatsApp): /vitrine/<slug>/p/<id>. */
  async function compartilhar() {
    const id = varianteId ?? item?.variantes[0]?.produto_id;
    if (!id) return;
    const url = `${window.location.origin}/vitrine/${slug}/p/${id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: item?.produto_nome ?? "Produto", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link do produto copiado");
    } catch {
      // Cancelar o compartilhamento cai aqui; não é erro.
    }
  }
  const [imagemAtiva, setImagemAtiva] = useState(0);
  const [quantidade, setQuantidade] = useState(1);

  const variantes: VarianteVitrine[] = item?.variantes ?? [];
  const temVariantes = variantes.length > 1;
  // Sem escolha ainda, mostra a variante mais barata com preço — a mesma que o card anunciou.
  const maisBarata = variantes.reduce<VarianteVitrine | null>((menor, v) => {
    if (v.preco === null) return menor;
    return !menor || (menor.preco !== null && v.preco < menor.preco) ? v : menor;
  }, null);
  const selecionada = variantes.find((v) => v.produto_id === varianteId) ?? maisBarata ?? variantes[0] ?? null;

  const imagens = selecionada
    ? [selecionada.imagem_url, ...selecionada.imagens_extra].filter((url): url is string => !!url)
    : [];

  const nomeCompleto =
    item && selecionada?.variante_nome ? `${item.produto_nome} — ${selecionada.variante_nome}` : (item?.produto_nome ?? "");

  function trocarVariante(id: string) {
    setVarianteId(id);
    setImagemAtiva(0);
  }

  /** Variante sem preço não entra no carrinho: o cliente pergunta pelo WhatsApp. */
  const consultar = !!selecionada && selecionada.preco === null;
  const preco = selecionada?.preco ?? 0;

  const linkConsultar = item
    ? linkPedidoWhatsapp(textoConsultarProduto(item.produto_nome, nomeCatalogo, selecionada?.variante_nome), negocioWhatsapp)
    : "#";

  function adicionar() {
    if (!item || !selecionada || selecionada.preco === null) return;
    const opcoes = variantes
      .filter((v): v is VarianteVitrine & { preco: number } => v.preco !== null)
      .map((v) => ({ produto_id: v.produto_id, rotulo: v.variante_nome ?? "Padrão", preco: v.preco }));
    onAdicionar({
      produto_id: selecionada.produto_id,
      nome: nomeCompleto,
      nomeBase: item.produto_nome,
      preco: selecionada.preco,
      quantidade,
      opcoes: opcoes.length > 1 ? opcoes : undefined,
    });
    onClose();
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
                    {v.preco === null && <span className="text-text-tertiary"> · consultar</span>}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div className="font-mono text-2xl text-accent font-semibold mb-2">
            {consultar ? <span className="font-sans text-xl text-text-secondary">Consultar</span> : formatBRL(preco)}
          </div>

          {item.descricao && <p className="text-sm text-text-secondary mb-4 whitespace-pre-wrap">{item.descricao}</p>}

          {consultar ? (
            <a href={linkConsultar} target="_blank" rel="noopener noreferrer" className="block">
              <Button variant="primary" className="w-full h-11">
                <MessageCircle size={16} />
                Consultar preço no WhatsApp
              </Button>
            </a>
          ) : (
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

              <Button variant="primary" className="flex-1" onClick={adicionar}>
                <ShoppingCart size={16} />
                Adicionar {quantidade > 1 ? `· ${formatBRL(preco * quantidade)}` : ""}
              </Button>
            </div>
          )}
          <button type="button" onClick={compartilhar} className="w-full mt-3 inline-flex items-center justify-center gap-1.5 text-sm text-text-secondary hover:text-accent py-1">
            <Share2 size={14} /> Compartilhar este produto
          </button>
        </div>
      )}
    </Modal>
  );
}

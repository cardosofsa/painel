import { ImageIcon } from "lucide-react";
import { formatBRL } from "@/lib/format";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import type { ItemVitrine } from "@/lib/vitrine-catalogo";

export type { ItemVitrine, VarianteVitrine, LinhaCatalogoPublico } from "@/lib/vitrine-catalogo";

/** Quantos produtos ganham a etiqueta "Mais pedido" (só os que já venderam de verdade). */
const TOP_MAIS_PEDIDOS = 3;
const SEM_VENDAS_MINIMO = 1_000_000;

/**
 * Grade de produtos usada na página pública (`/vitrine/[slug]`) e na prévia do painel.
 * Não sabe quem está vendo — só recebe os itens já prontos e um `onClickItem` para abrir o
 * pop-up. Produto sem preço (`preco === null`) aparece como **Consultar**.
 */
export function VitrineView({ itens, onClickItem }: { itens: ItemVitrine[]; onClickItem: (item: ItemVitrine) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {itens.map((item) => {
        const maisPedido = item.ordem <= TOP_MAIS_PEDIDOS && item.ordem < SEM_VENDAS_MINIMO;
        return (
          <button
            key={item.produto_id}
            onClick={() => onClickItem(item)}
            className="group text-left rounded-lg bg-surface-1 border border-border overflow-hidden hover:border-accent transition-colors"
          >
            <div className="relative aspect-square bg-surface-2 flex items-center justify-center overflow-hidden">
              {item.imagem_url ? (
                <ImagemStorage src={item.imagem_url} alt={item.produto_nome} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon size={28} className="text-text-tertiary" />
              )}
              {maisPedido && (
                <span className="absolute top-2 left-2 rounded-full bg-accent text-accent-on text-[10px] font-medium px-2 py-0.5">
                  Mais pedido
                </span>
              )}
            </div>
            <div className="p-3">
              <div className="text-sm text-text-primary font-medium leading-snug mb-1 line-clamp-2">{item.produto_nome}</div>
              {item.preco === null ? (
                <div className="text-sm font-medium text-text-secondary">Consultar</div>
              ) : (
                <div className="font-mono text-accent font-semibold">
                  {item.variantes.length > 1 ? `a partir de ${formatBRL(item.preco)}` : formatBRL(item.preco)}
                </div>
              )}
              {item.variantes.length > 1 && (
                <div className="text-xs text-text-tertiary mt-0.5">{item.variantes.length} opções</div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

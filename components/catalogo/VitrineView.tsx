import { ImageIcon } from "lucide-react";
import { formatBRL } from "@/lib/format";

/** Formato exato devolvido por `obter_catalogo_publico` — quando o catálogo existe mas
 * não tem produto elegível, vem uma única linha com `produto_nome`/`preco` nulos. */
export interface LinhaCatalogoPublico {
  catalogo_nome: string;
  produto_id: string | null;
  produto_nome: string | null;
  grupo_id: string | null;
  grupo_nome: string | null;
  variante_nome: string | null;
  descricao: string | null;
  imagem_url: string | null;
  categoria_nome: string | null;
  preco: number | null;
  imagens_extra: string[] | null;
  negocio_whatsapp: string | null;
}

/** Uma variante vendável dentro de um item da vitrine. */
export interface VarianteVitrine {
  produto_id: string;
  variante_nome: string | null;
  preco: number;
  imagem_url: string | null;
  imagens_extra: string[];
}

/**
 * Um item de verdade, já filtrado — o que a VitrineView de fato renderiza.
 * A RPC devolve uma linha por SKU; produtos do mesmo grupo viram UM item com
 * várias `variantes`, e o card mostra o menor preço.
 */
export interface ItemVitrine {
  produto_id: string;
  produto_nome: string;
  descricao: string | null;
  imagem_url: string | null;
  categoria_nome: string | null;
  preco: number;
  imagens_extra: string[];
  variantes: VarianteVitrine[];
}

/**
 * Grade de produtos usada tanto na prévia dentro do painel quanto na página pública
 * (`/vitrine/[slug]`) — não sabe se quem está vendo está autenticado ou não, só recebe
 * os itens já prontos (mesmo shape que `obter_catalogo_publico` devolve) e um `onClickItem`
 * pra abrir o pop-up de detalhe.
 */
export function VitrineView({ itens, onClickItem }: { itens: ItemVitrine[]; onClickItem: (item: ItemVitrine) => void }) {
  const categorias = Array.from(new Set(itens.map((i) => i.categoria_nome ?? "Outros")));
  const agrupar = categorias.length > 1;

  const grupos = agrupar
    ? categorias.map((nome) => ({ nome, itens: itens.filter((i) => (i.categoria_nome ?? "Outros") === nome) }))
    : [{ nome: null, itens }];

  return (
    <div className="space-y-8">
      {grupos.map((grupo) => (
        <div key={grupo.nome ?? "todos"}>
          {grupo.nome && <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide mb-3">{grupo.nome}</h2>}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {grupo.itens.map((item) => (
              <button
                key={item.produto_id}
                onClick={() => onClickItem(item)}
                className="text-left rounded-lg bg-surface-1 border border-border overflow-hidden hover:border-accent transition-colors"
              >
                <div className="aspect-square bg-surface-2 flex items-center justify-center overflow-hidden">
                  {item.imagem_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL pública do storage, catálogo é fora do domínio de otimização do Next
                    <img
                      src={item.imagem_url}
                      alt={item.produto_nome}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageIcon size={28} className="text-text-tertiary" />
                  )}
                </div>
                <div className="p-3">
                  <div className="text-sm text-text-primary font-medium leading-snug mb-1">{item.produto_nome}</div>
                  <div className="font-mono text-accent font-semibold">
                    {item.variantes.length > 1 ? `a partir de ${formatBRL(item.preco)}` : formatBRL(item.preco)}
                  </div>
                  {item.variantes.length > 1 && (
                    <div className="text-xs text-text-tertiary mt-0.5">{item.variantes.length} opções</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

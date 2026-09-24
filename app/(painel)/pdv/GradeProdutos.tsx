"use client";

import { useMemo, useState } from "react";
import { ImageIcon, PackageSearch, Search } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBRL } from "@/lib/format";
import { montarCards, rotuloProduto, type CardPdv, type ProdutoPdv } from "./tipos";

/**
 * Grade de produtos do caixa. O markup do card segue o da vitrine
 * (`components/catalogo/VitrineView.tsx`), acrescentando o estoque disponível —
 * no balcão, saber quanto tem é tão importante quanto o preço.
 */
export function GradeProdutos({
  produtos,
  quantidadeNoCarrinho,
  onAdicionar,
}: {
  produtos: ProdutoPdv[];
  quantidadeNoCarrinho: (produtoId: string) => number;
  onAdicionar: (produto: ProdutoPdv) => void;
}) {
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("Todas");
  const [grupoAberto, setGrupoAberto] = useState<CardPdv | null>(null);

  const categorias = useMemo(
    () => ["Todas", ...Array.from(new Set(produtos.map((p) => p.categoria_nome ?? "Outros")))],
    [produtos],
  );

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtos.filter((p) => {
      const passaCategoria = categoria === "Todas" || (p.categoria_nome ?? "Outros") === categoria;
      const passaBusca =
        termo === "" ||
        rotuloProduto(p).toLowerCase().includes(termo) ||
        p.sku.toLowerCase().includes(termo) ||
        (p.codigo_barras ?? "").toLowerCase().includes(termo);
      return passaCategoria && passaBusca;
    });
  }, [produtos, busca, categoria]);

  const cards = useMemo(() => montarCards(produtosFiltrados), [produtosFiltrados]);

  /**
   * Leitor de código de barras: o aparelho digita os dígitos e manda Enter. Se o termo
   * casar exatamente com um código, o produto entra direto no carrinho e a busca limpa.
   */
  function aoSubmeterBusca(e: React.FormEvent) {
    e.preventDefault();
    const termo = busca.trim();
    if (!termo) return;

    const porCodigo = produtos.find((p) => p.codigo_barras && p.codigo_barras === termo);
    const alvo = porCodigo ?? (produtosFiltrados.length === 1 ? produtosFiltrados[0] : null);
    if (!alvo) return;

    onAdicionar(alvo);
    setBusca("");
  }

  function aoClicarCard(card: CardPdv) {
    if (card.variantes.length === 1) {
      onAdicionar(card.variantes[0]);
      return;
    }
    setGrupoAberto(card);
  }

  return (
    <div>
      <form onSubmit={aoSubmeterBusca} className="flex flex-wrap gap-2 mb-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, SKU ou código de barras…"
            autoFocus
            className="w-full h-9 pl-8 pr-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
          />
        </div>
      </form>

      {categorias.length > 2 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {categorias.map((c) => (
            <button
              key={c}
              onClick={() => setCategoria(c)}
              className={`h-9 px-3 rounded-md text-sm border transition-colors ${
                categoria === c
                  ? "bg-accent-soft border-accent-soft text-accent"
                  : "bg-surface-1 border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {cards.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="Nenhum produto encontrado"
          description="Ajuste a busca ou a categoria. Produtos inativos não aparecem no caixa."
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {cards.map((card) => {
            const noCarrinho = card.variantes.reduce((acc, v) => acc + quantidadeNoCarrinho(v.id), 0);
            const restante = card.estoqueTotal - noCarrinho;
            const esgotado = restante <= 0;

            return (
              <button
                key={card.chave}
                onClick={() => aoClicarCard(card)}
                disabled={esgotado}
                className={`relative text-left rounded-lg bg-surface-1 border border-border overflow-hidden transition-colors ${
                  esgotado ? "opacity-50 cursor-not-allowed" : "hover:border-accent"
                }`}
              >
                {noCarrinho > 0 && (
                  <span className="absolute top-1.5 right-1.5 z-10 min-w-6 h-6 px-1.5 rounded-md bg-accent text-accent-on text-xs font-semibold flex items-center justify-center">
                    {noCarrinho}
                  </span>
                )}
                <div className="aspect-square bg-surface-2 flex items-center justify-center overflow-hidden">
                  {card.imagem_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL pública do storage
                    <img src={card.imagem_url} alt={card.nome} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={28} className="text-text-tertiary" />
                  )}
                </div>
                <div className="p-2.5">
                  <div className="text-sm text-text-primary font-medium leading-snug mb-1 line-clamp-2">{card.nome}</div>
                  <div className="font-mono text-accent font-semibold text-sm">
                    {card.precoMin === card.precoMax
                      ? formatBRL(card.precoMin)
                      : `a partir de ${formatBRL(card.precoMin)}`}
                  </div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    {esgotado
                      ? "Sem estoque"
                      : `${restante} em estoque${card.variantes.length > 1 ? ` · ${card.variantes.length} variantes` : ""}`}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <Modal
        open={!!grupoAberto}
        onClose={() => setGrupoAberto(null)}
        title={grupoAberto ? `Escolher variante — ${grupoAberto.nome}` : ""}
      >
        <div className="space-y-2">
          {grupoAberto?.variantes.map((v) => {
            const restante = v.estoque - quantidadeNoCarrinho(v.id);
            const esgotado = restante <= 0;
            return (
              <button
                key={v.id}
                disabled={esgotado}
                onClick={() => {
                  onAdicionar(v);
                  setGrupoAberto(null);
                }}
                className={`w-full flex items-center justify-between gap-3 border border-border rounded-md p-3 text-left transition-colors ${
                  esgotado ? "opacity-50 cursor-not-allowed" : "hover:border-accent"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm text-text-primary">{v.variante_nome ?? v.nome}</div>
                  <div className="text-xs text-text-tertiary font-mono">
                    {v.sku} · {esgotado ? "sem estoque" : `${restante} disponível`}
                  </div>
                </div>
                <div className="font-mono text-accent font-semibold shrink-0">{formatBRL(v.preco_venda)}</div>
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

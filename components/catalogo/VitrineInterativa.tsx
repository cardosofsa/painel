"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PackageSearch, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { VitrineView } from "./VitrineView";
import { ProdutoPopup } from "./ProdutoPopup";
import { CarrinhoVitrine } from "./CarrinhoVitrine";
import { FiltrosVitrine } from "./FiltrosVitrine";
import { SidebarCategorias } from "./SidebarCategorias";
import { consolidarCarrinho, quantidadeTotal, totalCarrinho, MAX_ITENS, type ItemCarrinhoVitrine } from "@/lib/vitrine-pedido";
import { formatBRL } from "@/lib/format";
import {
  FILTROS_PADRAO,
  aplicarFiltros,
  categoriasComContagem,
  codificarCarrinho,
  decodificarCarrinho,
  limitesDePreco,
  montarCarrinho,
  trocarVariante,
  type FiltrosVitrine as Filtros,
  type ItemVitrine,
} from "@/lib/vitrine-catalogo";

const chaveSalvo = (slug: string) => `sertao:vitrine:${slug}:carrinho`;

/** localStorage pode não existir ou lançar (navegação privada, dados de site bloqueados). */
function lerSalvo(slug: string): string | null {
  try {
    return window.localStorage.getItem(chaveSalvo(slug));
  } catch {
    return null;
  }
}

/**
 * Controla a vitrine inteira: filtros, categorias, pop-up de produto e carrinho.
 *
 * O carrinho nunca guarda preço confiável: o que fica salvo/compartilhado são só ids e
 * quantidades (`codificarCarrinho`), e quem reabre reconstrói com o catálogo de hoje.
 */
export function VitrineInterativa({
  nome,
  slug,
  itens,
  negocioWhatsapp,
  carrinhoInicial,
  produtoInicial = null,
  formasPagamento = [],
  freteAtivo = false,
}: {
  /** Cota frete no checkout (0055). */
  freteAtivo?: boolean;
  /** Produto (variante) vindo do link compartilhado: abre o pop-up dele direto. */
  produtoInicial?: string | null;
  /** Formas que o checkout oferece (0051); vazio = não pergunta. */
  formasPagamento?: string[];
  nome: string;
  slug: string;
  itens: ItemVitrine[];
  negocioWhatsapp: string | null;
  /** Vem do link de "Compartilhar carrinho" (?c=…), já reconstruído no servidor. */
  carrinhoInicial: ItemCarrinhoVitrine[];
}) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO);
  const [produtoAberto, setProdutoAberto] = useState<ItemVitrine | null>(() =>
    produtoInicial ? (itens.find((i) => i.variantes.some((v) => v.produto_id === produtoInicial)) ?? null) : null,
  );
  const [carrinho, setCarrinho] = useState<ItemCarrinhoVitrine[]>(carrinhoInicial);
  const [carrinhoAberto, setCarrinhoAberto] = useState(carrinhoInicial.length > 0);
  const [salvoCodigo, setSalvoCodigo] = useState<string | null>(null);

  const categorias = useMemo(() => categoriasComContagem(itens), [itens]);
  const limites = useMemo(() => limitesDePreco(itens), [itens]);
  const itensFiltrados = useMemo(() => aplicarFiltros(itens, filtros), [itens, filtros]);
  const salvoQuantidade = useMemo(
    () => (salvoCodigo ? montarCarrinho(decodificarCarrinho(salvoCodigo), itens).length : 0),
    [salvoCodigo, itens],
  );
  const pecas = quantidadeTotal(carrinho);

  function mudarFiltros(parcial: Partial<Filtros>) {
    setFiltros((prev) => ({ ...prev, ...parcial }));
  }

  function limparFiltros() {
    setFiltros((prev) => ({ ...FILTROS_PADRAO, ordenacao: prev.ordenacao }));
  }

  function abrirCarrinho() {
    setSalvoCodigo(lerSalvo(slug));
    setCarrinhoAberto(true);
  }

  function adicionarAoCarrinho(item: ItemCarrinhoVitrine) {
    setCarrinho((prev) => {
      const novo = consolidarCarrinho([...prev, item]);
      if (novo.length > MAX_ITENS) {
        toast.error(`No máximo ${MAX_ITENS} produtos diferentes por pedido.`);
        return prev;
      }
      return novo;
    });
    toast.success(`${item.nome} no carrinho`);
  }

  function mudarQuantidade(produtoId: string, quantidade: number) {
    setCarrinho((prev) => prev.map((i) => (i.produto_id === produtoId ? { ...i, quantidade } : i)));
  }

  function trocarOpcao(produtoId: string, novoProdutoId: string) {
    setCarrinho((prev) =>
      consolidarCarrinho(prev.map((i) => (i.produto_id === produtoId ? trocarVariante(i, novoProdutoId) : i))),
    );
  }

  function removerDoCarrinho(produtoId: string) {
    setCarrinho((prev) => prev.filter((i) => i.produto_id !== produtoId));
  }

  function codigoDoCarrinho() {
    return codificarCarrinho(carrinho.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })));
  }

  function salvarCarrinho() {
    try {
      window.localStorage.setItem(chaveSalvo(slug), codigoDoCarrinho());
      toast.success("Carrinho salvo neste aparelho");
    } catch {
      toast.error("Não foi possível salvar neste navegador.");
    }
  }

  async function compartilharCarrinho() {
    const url = `${window.location.origin}${window.location.pathname}?c=${codigoDoCarrinho()}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Carrinho — ${nome}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link do carrinho copiado");
    } catch {
      // Cancelar a folha de compartilhamento também cai aqui; não é erro que mereça aviso.
    }
  }

  function restaurarCarrinho() {
    if (!salvoCodigo) return;
    const restaurado = montarCarrinho(decodificarCarrinho(salvoCodigo), itens);
    if (restaurado.length === 0) {
      toast.error("Os produtos desse carrinho não estão mais disponíveis.");
      return;
    }
    setCarrinho(restaurado);
    toast.success("Carrinho restaurado com os preços de hoje");
  }

  function aposEnvio() {
    setCarrinho([]);
    try {
      window.localStorage.removeItem(chaveSalvo(slug));
    } catch {
      // sem localStorage não há o que limpar
    }
  }

  return (
    <div>
      {/* Barra fixa ao rolar: numa vitrine de 200 itens, filtrar exigia voltar ao topo. */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 mb-4 bg-background/95 backdrop-blur-sm border-b border-border/60">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <FiltrosVitrine
              filtros={filtros}
              onMudar={mudarFiltros}
              onLimpar={limparFiltros}
              resultados={itensFiltrados.length}
              limites={limites}
            />
          </div>
          <button
            onClick={abrirCarrinho}
            className="relative shrink-0 h-9 w-11 rounded-md border border-border bg-surface-1 text-text-primary hover:border-accent flex items-center justify-center transition-colors"
            aria-label={`Abrir carrinho${pecas > 0 ? `, ${pecas} ${pecas === 1 ? "item" : "itens"}` : ""}`}
          >
            <ShoppingCart size={18} />
            {pecas > 0 && (
              <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-accent text-accent-on text-[11px] font-semibold flex items-center justify-center tabular">
                {pecas > 99 ? "99+" : pecas}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="lg:flex lg:gap-8">
        <SidebarCategorias
          categorias={categorias}
          ativa={filtros.categoria}
          onEscolher={(categoria) => mudarFiltros({ categoria })}
        />

        <div className="flex-1 min-w-0">
          {itensFiltrados.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Nenhum produto com esses filtros"
              description="Tente outra categoria ou limpe a busca."
              action={
                <Button variant="secondary" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <VitrineView itens={itensFiltrados} onClickItem={setProdutoAberto} />
          )}
        </div>
      </div>

      {/* Celular: o carrinho fica sempre à mão, sem precisar voltar ao topo. */}
      {pecas > 0 && !carrinhoAberto && (
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-20 p-3 bg-background/95 backdrop-blur-sm border-t border-border">
          <button onClick={abrirCarrinho} className="w-full h-12 rounded-md bg-accent text-accent-on font-medium flex items-center justify-center gap-2">
            <ShoppingCart size={18} /> Ver carrinho · {pecas} {pecas === 1 ? "item" : "itens"} · {formatBRL(totalCarrinho(carrinho))}
          </button>
        </div>
      )}

      <ProdutoPopup
        key={produtoAberto?.produto_id ?? "fechado"}
        slug={slug}
        varianteInicial={produtoInicial}
        item={produtoAberto}
        nomeCatalogo={nome}
        negocioWhatsapp={negocioWhatsapp}
        onAdicionar={adicionarAoCarrinho}
        onClose={() => setProdutoAberto(null)}
      />

      <CarrinhoVitrine
        formasPagamento={formasPagamento}
        freteAtivo={freteAtivo}
        aberto={carrinhoAberto}
        onFechar={() => setCarrinhoAberto(false)}
        itens={carrinho}
        slug={slug}
        nomeCatalogo={nome}
        negocioWhatsapp={negocioWhatsapp}
        onMudarQuantidade={mudarQuantidade}
        onTrocarVariante={trocarOpcao}
        onRemover={removerDoCarrinho}
        onEnviado={aposEnvio}
        onSalvar={salvarCarrinho}
        onCompartilhar={compartilharCarrinho}
        salvoQuantidade={salvoQuantidade}
        onRestaurar={restaurarCarrinho}
      />
    </div>
  );
}

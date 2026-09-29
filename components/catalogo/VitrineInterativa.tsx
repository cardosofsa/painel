"use client";

import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Download, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { PackageSearch } from "lucide-react";
import { VitrineView, type ItemVitrine } from "./VitrineView";
import { ProdutoPopup } from "./ProdutoPopup";
import { BarraCarrinho, CarrinhoVitrine } from "./CarrinhoVitrine";
import { campoBase } from "@/components/ui/Modal";
import { consolidarCarrinho, MAX_ITENS, type ItemCarrinhoVitrine } from "@/lib/vitrine-pedido";

const ORDENACOES = [
  { id: "relevancia", label: "Padrão" },
  { id: "menor", label: "Menor preço" },
  { id: "maior", label: "Maior preço" },
  { id: "nome", label: "A-Z" },
] as const;
type Ordenacao = (typeof ORDENACOES)[number]["id"];

/** Controla a vitrine inteira: filtros (categoria, busca, faixa de preço), o pop-up de
 * produto e a exportação — nome, imagem e PDF só do que está filtrado/visível na hora. */
export function VitrineInterativa({
  nome,
  slug,
  itens,
  negocioWhatsapp,
}: {
  nome: string;
  slug: string;
  itens: ItemVitrine[];
  negocioWhatsapp: string | null;
}) {
  const [baixando, setBaixando] = useState(false);
  const [categoria, setCategoria] = useState<string>("Todas");
  const [busca, setBusca] = useState("");
  const [precoMax, setPrecoMax] = useState<number | null>(null);
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("relevancia");
  const [produtoAberto, setProdutoAberto] = useState<ItemVitrine | null>(null);
  const [carrinho, setCarrinho] = useState<ItemCarrinhoVitrine[]>([]);
  const [carrinhoAberto, setCarrinhoAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /** Categoria com a contagem ao lado: o chip só ajuda se disser quanto tem dentro. */
  const categorias = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const i of itens) {
      const c = i.categoria_nome ?? "Outros";
      contagem.set(c, (contagem.get(c) ?? 0) + 1);
    }
    return [
      { nome: "Todas", total: itens.length },
      ...[...contagem.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
        .map(([nome, total]) => ({ nome, total })),
    ];
  }, [itens]);

  const precoMaximoDoCatalogo = useMemo(() => Math.max(...itens.map((i) => i.preco), 0), [itens]);

  const itensFiltrados = useMemo(() => {
    const filtrados = itens.filter((item) => {
      const passaCategoria = categoria === "Todas" || (item.categoria_nome ?? "Outros") === categoria;
      const passaBusca = busca.trim() === "" || item.produto_nome.toLowerCase().includes(busca.trim().toLowerCase());
      const passaPreco = precoMax === null || item.preco <= precoMax;
      return passaCategoria && passaBusca && passaPreco;
    });

    // `relevancia` mantém a ordem do banco, que já vem por categoria e nome (0026:126).
    if (ordenacao === "menor") return [...filtrados].sort((a, b) => a.preco - b.preco);
    if (ordenacao === "maior") return [...filtrados].sort((a, b) => b.preco - a.preco);
    if (ordenacao === "nome") return [...filtrados].sort((a, b) => a.produto_nome.localeCompare(b.produto_nome, "pt-BR"));
    return filtrados;
  }, [itens, categoria, busca, precoMax, ordenacao]);

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

  function removerDoCarrinho(produtoId: string) {
    setCarrinho((prev) => prev.filter((i) => i.produto_id !== produtoId));
  }

  async function baixarImagem() {
    if (!ref.current) return;
    setBaixando(true);
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, backgroundColor: "#ffffff" });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `${nome.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}.png`;
      a.click();
    } catch {
      toast.error("Erro ao gerar imagem");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div>
      {/* Barra de filtros fixa ao rolar: numa vitrine de 200 itens, filtrar exigia voltar
          ao topo. `print:hidden` porque nada disso faz sentido no PDF. */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 mb-4 bg-background/95 backdrop-blur-sm print:hidden">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto…"
              aria-label="Buscar produto"
              className={`${campoBase} w-full pl-8`}
            />
          </div>
          <select
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
            aria-label="Ordenar por"
            className={campoBase}
          >
            {ORDENACOES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Chips no lugar do <select>: a categoria é a navegação principal de uma loja,
            e um menu fechado esconde o que a loja tem. A contagem vem junto. */}
        {categorias.length > 2 && (
          <ChipRow className="mb-2">
            {categorias.map((c) => (
              <Chip key={c.nome} ativo={categoria === c.nome} onClick={() => setCategoria(c.nome)}>
                {c.nome} <span className="text-text-tertiary">({c.total})</span>
              </Chip>
            ))}
          </ChipRow>
        )}

        {precoMaximoDoCatalogo > 0 && (
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            Até {precoMax === null ? "qualquer preço" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(precoMax)}
            <input
              type="range"
              min={0}
              max={precoMaximoDoCatalogo}
              step={precoMaximoDoCatalogo > 100 ? 10 : 1}
              value={precoMax ?? precoMaximoDoCatalogo}
              onChange={(e) => setPrecoMax(Number(e.target.value))}
              className="w-28 accent-accent"
            />
          </label>
        )}
      </div>

      <div className="flex gap-2 mb-6 print:hidden">
        <Button variant="secondary" onClick={baixarImagem} loading={baixando}>
          <Download size={14} />
          Baixar Imagem
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={14} />
          Salvar como PDF
        </Button>
      </div>

      <div ref={ref} className="bg-background">
        {itensFiltrados.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="Nenhum produto com esses filtros"
            description="Tente outra categoria ou limpe a busca."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setBusca("");
                  setCategoria("Todas");
                  setPrecoMax(null);
                }}
              >
                Limpar filtros
              </Button>
            }
          />
        ) : (
          <VitrineView itens={itensFiltrados} onClickItem={setProdutoAberto} />
        )}
      </div>

      {/* Espaço para a barra do carrinho não tapar o último produto da lista. */}
      {carrinho.length > 0 && <div className="h-20 print:hidden" aria-hidden="true" />}

      <ProdutoPopup item={produtoAberto} onAdicionar={adicionarAoCarrinho} onClose={() => setProdutoAberto(null)} />

      <BarraCarrinho itens={carrinho} onAbrir={() => setCarrinhoAberto(true)} />
      <CarrinhoVitrine
        aberto={carrinhoAberto}
        onFechar={() => setCarrinhoAberto(false)}
        itens={carrinho}
        slug={slug}
        nomeCatalogo={nome}
        negocioWhatsapp={negocioWhatsapp}
        onMudarQuantidade={mudarQuantidade}
        onRemover={removerDoCarrinho}
        onEnviado={() => setCarrinho([])}
      />
    </div>
  );
}

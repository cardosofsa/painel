"use client";

import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Download, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { VitrineView, type ItemVitrine } from "./VitrineView";
import { ProdutoPopup } from "./ProdutoPopup";

/** Controla a vitrine inteira: filtros (categoria, busca, faixa de preço), o pop-up de
 * produto e a exportação — nome, imagem e PDF só do que está filtrado/visível na hora. */
export function VitrineInterativa({
  nome,
  itens,
  negocioWhatsapp,
}: {
  nome: string;
  itens: ItemVitrine[];
  negocioWhatsapp: string | null;
}) {
  const [baixando, setBaixando] = useState(false);
  const [categoria, setCategoria] = useState<string>("Todas");
  const [busca, setBusca] = useState("");
  const [precoMax, setPrecoMax] = useState<number | null>(null);
  const [produtoAberto, setProdutoAberto] = useState<ItemVitrine | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const categorias = useMemo(() => ["Todas", ...Array.from(new Set(itens.map((i) => i.categoria_nome ?? "Outros")))], [itens]);
  const precoMaximoDoCatalogo = useMemo(() => Math.max(...itens.map((i) => i.preco), 0), [itens]);

  const itensFiltrados = useMemo(() => {
    return itens.filter((item) => {
      const passaCategoria = categoria === "Todas" || (item.categoria_nome ?? "Outros") === categoria;
      const passaBusca = busca.trim() === "" || item.produto_nome.toLowerCase().includes(busca.trim().toLowerCase());
      const passaPreco = precoMax === null || item.preco <= precoMax;
      return passaCategoria && passaBusca && passaPreco;
    });
  }, [itens, categoria, busca, precoMax]);

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
      <div className="flex flex-wrap items-center gap-2 mb-4 print:hidden">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto…"
            className="h-9 pl-8 pr-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent w-40 sm:w-52"
          />
        </div>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
        >
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
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
          <p className="text-sm text-text-tertiary text-center py-10">Nenhum produto encontrado com esses filtros.</p>
        ) : (
          <VitrineView itens={itensFiltrados} onClickItem={setProdutoAberto} />
        )}
      </div>

      <ProdutoPopup item={produtoAberto} negocioWhatsapp={negocioWhatsapp} onClose={() => setProdutoAberto(null)} />
    </div>
  );
}

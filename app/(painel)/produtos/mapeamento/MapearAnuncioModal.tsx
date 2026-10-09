"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { Modal, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { executarComToast } from "@/lib/acao-cliente";
import { buscarProdutosParaMapa, mapearAnuncio, type ProdutoParaMapa } from "../mapeamento-actions";
import type { AnuncioLinha } from "./MapeamentoClient";

/** Escolhe o produto de UM anúncio. Montado só quando aberto (`key` = anúncio): o estado nasce limpo. */
export function MapearAnuncioModal({ anuncio, onClose }: { anuncio: AnuncioLinha; onClose: () => void }) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ProdutoParaMapa[]>([]);
  const [buscando, setBuscando] = useState(true);
  const [escolhido, setEscolhido] = useState<ProdutoParaMapa | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Busca no servidor com pausa na digitação; a primeira (termo vazio) lista os primeiros produtos.
  useEffect(() => {
    let atual = true;
    const id = setTimeout(async () => {
      const r = await executarComToast(buscarProdutosParaMapa(termo), { erro: "Erro ao buscar produtos" });
      if (!atual) return;
      setBuscando(false);
      if (r.ok) setResultados(r.dado);
    }, termo ? 350 : 0);
    return () => {
      atual = false;
      clearTimeout(id);
    };
  }, [termo]);

  async function confirmar() {
    if (!escolhido) return;
    setSalvando(true);
    const r = await executarComToast(mapearAnuncio(anuncio.id, escolhido.id), { erro: "Erro ao mapear o anúncio" });
    setSalvando(false);
    if (!r.ok) return;
    const { pedidos, baixas } = r.dado;
    toast.success(pedidos > 0 ? `Anúncio mapeado: ${pedidos} ${pedidos === 1 ? "pedido recalculado" : "pedidos recalculados"}${baixas ? `, ${baixas} baixa(s) no estoque` : ""}.` : "Anúncio mapeado.");
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Mapear anúncio" width="max-w-2xl">
      <div className="flex items-center gap-3 rounded-md border border-border bg-surface-2 p-3 mb-4">
        {anuncio.imagem ? (
          <Image src={anuncio.imagem} alt="" width={44} height={44} unoptimized className="h-11 w-11 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="h-11 w-11 shrink-0 rounded-md border border-border bg-surface-1" aria-hidden />
        )}
        <div className="min-w-0 text-sm">
          <div className="truncate text-text-primary" title={anuncio.titulo}>
            {anuncio.titulo}
          </div>
          <div className="text-xs text-text-tertiary font-mono truncate">
            {[anuncio.variacao, anuncio.skuAnuncio, anuncio.anuncioId].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>

      <div className="relative mb-3">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden />
        <input autoFocus type="search" aria-label="Buscar produto" className={`${inputClass} pl-8`} placeholder="Nome ou SKU do produto" value={termo} onChange={(e) => setTermo(e.target.value)} />
      </div>

      <div className="max-h-72 overflow-y-auto rounded-md border border-border divide-y divide-border" role="listbox" aria-label="Produtos">
        {buscando && <p className="p-4 text-sm text-text-tertiary">Buscando…</p>}
        {!buscando && resultados.length === 0 && <p className="p-4 text-sm text-text-tertiary">Nenhum produto ativo encontrado.</p>}
        {resultados.map((p) => (
          <button
            key={p.id}
            type="button"
            role="option"
            aria-selected={escolhido?.id === p.id}
            onClick={() => setEscolhido(p)}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${escolhido?.id === p.id ? "bg-accent-soft" : "hover:bg-surface-2"}`}
          >
            {p.imagem ? <Image src={p.imagem} alt="" width={32} height={32} unoptimized className="h-8 w-8 shrink-0 rounded object-cover" /> : <div className="h-8 w-8 shrink-0 rounded border border-border bg-surface-2" aria-hidden />}
            <span className="min-w-0">
              <span className="block truncate text-text-primary">{p.nome}</span>
              {p.sku && <span className="block text-xs text-text-tertiary font-mono">{p.sku}</span>}
            </span>
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-text-tertiary">Um anúncio aponta para um produto. Produto com variações não aparece aqui: escolha a variação. Para combo (2 un., 3 un.), mapeie para o Kit cadastrado.</p>
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={confirmar} loading={salvando} disabled={!escolhido}>
          Mapear
        </Button>
      </div>
    </Modal>
  );
}

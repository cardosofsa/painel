"use client";

import { ExportarModal } from "@/components/ui/ExportarModal";
import { tabelaPrecificacoes, tabelaVariacoes } from "@/lib/precificacao-exportar";
import type { AnuncioSalvo, PrecificacaoHist } from "@/lib/precificacao-tipos";

type Empresa = { nome: string | null; logoUrl?: string | null } | null;

/** "O que exportar": cada grupo vira um escopo do modal (selecionadas, desta lista, todas…). */
export interface GrupoExport<T> {
  id: string;
  rotulo: string;
  lista: T[];
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Várias precificações de uma vez em Excel (.xlsx, abre também no Google Planilhas), PDF,
 * imagem ou CSV. Antes só havia "Exportar CSV" de tudo o que estava na tela.
 */
export function ExportarPrecificacoesModal({ grupos, onClose, empresa = null }: { grupos: GrupoExport<PrecificacaoHist>[]; onClose: () => void; empresa?: Empresa }) {
  return (
    <ExportarModal
      aberto
      onClose={onClose}
      titulo="Exportar precificações"
      escopos={grupos.map((g) => ({ id: g.id, rotulo: g.rotulo, quantidade: g.lista.length }))}
      montar={(id) => {
        const g = grupos.find((x) => x.id === id) ?? grupos[0];
        return tabelaPrecificacoes(g.lista, plural(g.lista.length, "precificação", "precificações"));
      }}
      empresa={empresa}
    />
  );
}

/** Produtos com variações: uma linha por variação. */
export function ExportarVariacoesModal({ grupos, onClose, empresa = null }: { grupos: GrupoExport<AnuncioSalvo>[]; onClose: () => void; empresa?: Empresa }) {
  return (
    <ExportarModal
      aberto
      onClose={onClose}
      titulo="Exportar produtos com variações"
      escopos={grupos.map((g) => ({ id: g.id, rotulo: g.rotulo, quantidade: g.lista.length }))}
      montar={(id) => {
        const g = grupos.find((x) => x.id === id) ?? grupos[0];
        return tabelaVariacoes(g.lista, plural(g.lista.length, "anúncio", "anúncios"));
      }}
      empresa={empresa}
    />
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { executarComToast } from "@/lib/acao-cliente";
import type { ProdutoDaFoto } from "@/lib/ia/prompts-foto";
import { gerarProdutoPelaFoto } from "@/app/(painel)/produtos/actions";

const LIMITE_NOME = 120;

/**
 * "Gerar pela foto" (10.7): a IA da conta olha a foto do produto e sugere nome, descrição,
 * categoria e atributos. Nada é aplicado sozinho — cada campo tem o seu "Usar".
 */
export function GerarPelaFoto({
  imagemUrl,
  nomeAtual,
  categorias,
  limiteDescricao,
  disponivel,
  onUsar,
}: {
  imagemUrl: string | null;
  nomeAtual: string;
  categorias: { id: string; nome: string }[];
  limiteDescricao: number;
  disponivel: boolean;
  onUsar: (campos: { nome?: string; descricao?: string; categoriaId?: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [sugestao, setSugestao] = useState<ProdutoDaFoto | null>(null);
  if (!disponivel || !imagemUrl) return null;

  function gerar() {
    startTransition(async () => {
      const r = await executarComToast(
        gerarProdutoPelaFoto({ url: imagemUrl!, nomeAtual: nomeAtual.trim() || null, categorias: categorias.map((c) => c.nome), limiteTitulo: LIMITE_NOME, limiteDescricao }),
        { erro: "Erro ao gerar pela foto" },
      );
      if (r.ok) {
        setSugestao(r.dado.produto);
        if (r.dado.doCache) toast.success("Sugestão já gerada antes para esta foto (não gastou geração).");
      }
    });
  }

  const categoriaId = sugestao?.categoria ? categorias.find((c) => c.nome === sugestao.categoria)?.id : undefined;
  const comAtributos = (s: ProdutoDaFoto) =>
    s.atributos.length ? `${s.descricao}\n\n${s.atributos.map((a) => `${a.nome}: ${a.valor}`).join(" · ")}`.slice(0, limiteDescricao) : s.descricao;

  return (
    <div className="mt-2">
      {!sugestao ? (
        <Button size="sm" variant="secondary" loading={pending} onClick={gerar}>
          <Camera size={14} /> Gerar nome e descrição pela foto
        </Button>
      ) : (
        <div className="rounded-md border border-accent/40 bg-accent-soft/40 p-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
              <Sparkles size={14} className="text-accent" /> Sugestão pela foto
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" loading={pending} onClick={gerar}>
                Gerar outra
              </Button>
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  onUsar({ nome: sugestao.nome || undefined, descricao: comAtributos(sugestao) || undefined, categoriaId });
                  setSugestao(null);
                }}
              >
                Usar tudo
              </Button>
            </div>
          </div>
          {sugestao.nome && (
            <Campo rotulo="Nome" valor={sugestao.nome} onUsar={() => onUsar({ nome: sugestao.nome })} />
          )}
          {sugestao.descricao && <Campo rotulo="Descrição" valor={sugestao.descricao} onUsar={() => onUsar({ descricao: sugestao.descricao })} />}
          {sugestao.categoria && categoriaId && <Campo rotulo="Categoria" valor={sugestao.categoria} onUsar={() => onUsar({ categoriaId })} />}
          {sugestao.atributos.length > 0 && (
            <Campo
              rotulo="Atributos"
              valor={sugestao.atributos.map((a) => `${a.nome}: ${a.valor}`).join(" · ")}
              acao="Pôr na descrição"
              onUsar={() => onUsar({ descricao: comAtributos(sugestao) })}
            />
          )}
          <p className="text-[11px] text-text-tertiary">Confira antes de salvar: a IA só vê a foto.</p>
        </div>
      )}
    </div>
  );
}

function Campo({ rotulo, valor, onUsar, acao = "Usar" }: { rotulo: string; valor: string; onUsar: () => void; acao?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-border/60 pt-2">
      <div className="min-w-0">
        <div className="text-[11px] text-text-tertiary">{rotulo}</div>
        <div className="text-text-primary whitespace-pre-wrap break-words">{valor}</div>
      </div>
      <button type="button" className="text-xs text-accent hover:underline shrink-0" onClick={onUsar}>
        {acao}
      </button>
    </div>
  );
}

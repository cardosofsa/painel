"use client";

import { useState, useTransition } from "react";
import { ImagePlus, Sparkles, Wand2 } from "lucide-react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { executarComToast } from "@/lib/acao-cliente";
import { TIPOS_IMAGEM, TIPOS_IMAGEM_LISTA, type TipoImagem } from "@/lib/ia/prompts-imagem";
import { gerarImagemProdutoIA } from "@/app/(painel)/produtos/estudio-actions";
import { adicionarImagemProduto } from "@/app/(painel)/produtos/actions";

/**
 * Estúdio de IA (Fase 2): a partir de uma foto do produto, gera a capa em fundo branco,
 * foto de ambiente, capa com selo, outra cor, imagem de medidas ou um pedido livre. A
 * imagem só entra na galeria quando a pessoa clica em "Adicionar". Cada geração conta na
 * cota de imagens do plano (conferida no banco, 0072).
 */
export function EstudioIAModal({ produto, onClose }: { produto: { id: string; nome: string; imagemPrincipal: string | null; imagens: { id: string; url: string }[] }; onClose: () => void }) {
  const fotos = [produto.imagemPrincipal, ...produto.imagens.map((i) => i.url)].filter((u): u is string => !!u);
  const [foto, setFoto] = useState<string | null>(fotos[0] ?? null);
  const [tipo, setTipo] = useState<TipoImagem>(fotos.length ? "fundo_branco" : "livre");
  const [extra, setExtra] = useState("");
  const [gerada, setGerada] = useState<{ url: string; usadas: number; limite: number | null } | null>(null);
  const [adicionadas, setAdicionadas] = useState<Set<string>>(new Set());
  const [gerando, startGerar] = useTransition();
  const [adicionando, startAdicionar] = useTransition();
  const def = TIPOS_IMAGEM[tipo];

  function gerar() {
    startGerar(async () => {
      const r = await executarComToast(gerarImagemProdutoIA({ produtoId: produto.id, tipo, extra: extra.trim() || null, fotoUrl: def.precisaFoto || foto ? foto : null }), { erro: "Não foi possível gerar a imagem" });
      if (r.ok) setGerada(r.dado);
    });
  }

  function adicionar() {
    if (!gerada) return;
    startAdicionar(async () => {
      const r = await executarComToast(adicionarImagemProduto(produto.id, gerada.url), { sucesso: "Imagem adicionada às fotos do produto.", erro: "Erro ao adicionar a imagem" });
      if (r.ok) setAdicionadas((s) => new Set(s).add(gerada.url));
    });
  }

  return (
    <Modal open onClose={onClose} title="Estúdio de IA" width="max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
        <div>
          <FormField label="Foto de base">
            {fotos.length ? (
              <div className="flex flex-wrap gap-2">
                {fotos.map((u) => (
                  <button key={u} type="button" onClick={() => setFoto(u)} aria-pressed={foto === u} className={`w-16 h-16 rounded-md overflow-hidden border-2 ${foto === u ? "border-accent" : "border-border"}`}>
                    <ImagemStorage src={u} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">Sem foto: adicione uma foto do produto para usar os tipos que editam a foto real.</p>
            )}
          </FormField>

          <FormField label="Tipo de imagem">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TIPOS_IMAGEM_LISTA.map((t) => {
                const d = TIPOS_IMAGEM[t];
                const bloqueado = d.precisaFoto && !fotos.length;
                return (
                  <button
                    key={t}
                    type="button"
                    disabled={bloqueado}
                    onClick={() => {
                      setTipo(t);
                      setExtra("");
                    }}
                    aria-pressed={tipo === t}
                    className={`text-left rounded-md border px-3 py-2 transition-colors disabled:opacity-50 ${tipo === t ? "border-accent bg-accent-soft" : "border-border bg-surface-1 hover:border-border-forte"}`}
                  >
                    <span className="block text-sm font-medium text-text-primary">{d.rotulo}</span>
                    <span className="block text-xs text-text-secondary leading-snug">{d.descricao}</span>
                  </button>
                );
              })}
            </div>
          </FormField>

          {def.campo && (
            <FormField label={def.campo.rotulo}>
              <input className={inputClass} value={extra} maxLength={160} onChange={(e) => setExtra(e.target.value)} placeholder={`Ex.: ${def.campo.exemplo}`} />
            </FormField>
          )}

          <Button variant="primary" className="w-full" onClick={gerar} loading={gerando} disabled={(def.precisaFoto && !foto) || (!!def.campo?.obrigatorio && !extra.trim())}>
            <Wand2 size={15} /> Gerar imagem
          </Button>
          <p className="text-xs text-text-tertiary mt-2">Leva de 15 a 40 segundos. Cada geração conta na cota de imagens do seu plano.</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-2 min-h-64 flex flex-col items-center justify-center p-3">
          {gerada ? (
            <>
              <ImagemStorage src={gerada.url} alt={`Imagem gerada: ${def.rotulo}`} className="w-full h-auto rounded-md border border-border bg-surface-1" />
              <div className="mt-3 flex w-full flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-text-tertiary">{gerada.limite !== null ? `${gerada.usadas} de ${gerada.limite} imagens este mês` : `${gerada.usadas} imagens este mês`}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={gerar} loading={gerando}>
                    Gerar outra
                  </Button>
                  <Button size="sm" variant="primary" onClick={adicionar} loading={adicionando} disabled={adicionadas.has(gerada.url)}>
                    <ImagePlus size={14} /> {adicionadas.has(gerada.url) ? "Adicionada" : "Adicionar às fotos"}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center text-text-tertiary px-6">
              <Sparkles size={28} className="mx-auto mb-2 text-accent" aria-hidden />
              <p className="text-sm">A imagem gerada aparece aqui. Ela só vai para as fotos do produto se você adicionar.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Copy, ExternalLink, Wand2 } from "lucide-react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { GeradorIA } from "@/components/ia/GeradorIA";
import { numeroOuNulo } from "@/lib/format";
import { checklistAnuncio, hashtags, LIMITE_DESCRICAO_SHOPEE, LIMITE_TITULO_SHOPEE, MAX_FOTOS_SHOPEE, textoAnuncio } from "@/lib/anuncio-shopee";
import { gerarDescricaoAnuncioIA, gerarTituloAnuncioIA } from "@/app/(painel)/precificacao/actions";

export interface ProdutoAnuncio {
  id: string;
  nome: string;
  sku: string | null;
  descricao: string | null;
  preco: number | null;
  custo: number;
  palavrasChave: string[];
  fotos: string[];
  pesoG: number | null;
  medidas: { altura: number | null; largura: number | null; comprimento: number | null };
}

/**
 * Montar anúncio para a Shopee (Fase 2): título e descrição (com IA), preço, fotos na
 * ordem, hashtags e um checklist do que a Shopee exige. "Copiar tudo" leva o texto pronto
 * para colar no Seller Centre. Publicar direto pela API fica para quando a loja estiver
 * conectada (categoria e atributos obrigatórios variam por categoria).
 */
export function AnuncioShopeeModal({ produto, iaDisponivel, onEstudio, onClose }: { produto: ProdutoAnuncio; iaDisponivel: boolean; onEstudio?: () => void; onClose: () => void }) {
  const [titulo, setTitulo] = useState(produto.nome.slice(0, LIMITE_TITULO_SHOPEE));
  const [descricao, setDescricao] = useState((produto.descricao ?? "").slice(0, LIMITE_DESCRICAO_SHOPEE));
  const [preco, setPreco] = useState(produto.preco ? produto.preco.toFixed(2).replace(".", ",") : "");
  const precoNum = numeroOuNulo(preco.replace(",", "."));
  const rascunho = { titulo, descricao, preco: precoNum, sku: produto.sku, fotos: produto.fotos, palavrasChave: produto.palavrasChave, pesoG: produto.pesoG, medidas: produto.medidas, produtoNome: produto.nome };
  const { itens, pronto } = checklistAnuncio(rascunho);
  const tags = hashtags(produto.palavrasChave);
  const contexto = { produtoNome: produto.nome, sku: produto.sku, canal: "Shopee", loja: null, palavrasChave: produto.palavrasChave, componentes: [] as { nome: string; quantidade: number }[] };

  function copiar() {
    navigator.clipboard
      .writeText(textoAnuncio(rascunho))
      .then(() => toast.success("Anúncio copiado. Cole no Seller Centre da Shopee."))
      .catch(() => toast.error("Não deu para copiar."));
  }

  return (
    <Modal open onClose={onClose} title="Montar anúncio para a Shopee" width="max-w-4xl">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5">
        <div>
          <FormField label={`Título (${titulo.length}/${LIMITE_TITULO_SHOPEE})`}>
            <input className={inputClass} value={titulo} maxLength={LIMITE_TITULO_SHOPEE} onChange={(e) => setTitulo(e.target.value)} />
          </FormField>
          <div className="mb-4 -mt-2">
            <GeradorIA
              rotulo="Gerar título com IA"
              tipo="titulo"
              limite={LIMITE_TITULO_SHOPEE}
              termoPrincipal={produto.nome}
              valorAtual={titulo}
              disponivel={iaDisponivel}
              gerar={(instrucaoExtra, tom) => gerarTituloAnuncioIA({ ...contexto, custo: produto.custo, precoCalculado: precoNum, concorrentes: [], limite: LIMITE_TITULO_SHOPEE, tom, instrucaoExtra })}
              onUsar={setTitulo}
            />
          </div>
          <FormField label={`Descrição (${descricao.length}/${LIMITE_DESCRICAO_SHOPEE.toLocaleString("pt-BR")})`}>
            <textarea className={`${inputClass} h-40 py-2 resize-y`} value={descricao} maxLength={LIMITE_DESCRICAO_SHOPEE} onChange={(e) => setDescricao(e.target.value)} />
          </FormField>
          <div className="mb-4 -mt-2">
            <GeradorIA
              rotulo="Gerar descrição com IA"
              tipo="descricao"
              limite={LIMITE_DESCRICAO_SHOPEE}
              valorAtual={descricao}
              disponivel={iaDisponivel}
              gerar={(instrucaoExtra, tom) => gerarDescricaoAnuncioIA({ ...contexto, produtoNome: titulo.trim() || produto.nome, descricaoAtual: descricao || null, limite: LIMITE_DESCRICAO_SHOPEE, tom, instrucaoExtra })}
              onUsar={setDescricao}
            />
          </div>
          <FormField label="Preço (R$)">
            <input className={`${inputClass} max-w-40`} inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" />
          </FormField>
          {tags.length > 0 && (
            <FormField label="Hashtags (das palavras-chave do produto)">
              <p className="text-sm text-text-secondary break-words">{tags.join(" ")}</p>
            </FormField>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-primary">Checklist</span>
              <span className={`text-xs font-medium rounded px-1.5 py-0.5 ${pronto ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative"}`}>{pronto ? "Pronto para publicar" : "Falta preencher"}</span>
            </div>
            <ul className="space-y-1.5 text-sm">
              {itens.map((i) => (
                <li key={i.texto} className={`flex items-start gap-2 ${i.ok ? "text-text-secondary" : i.recomendado ? "text-text-tertiary" : "text-negative"}`}>
                  {i.ok ? <CheckCircle2 size={15} className="text-positive shrink-0 mt-0.5" aria-hidden /> : <Circle size={15} className="shrink-0 mt-0.5" aria-hidden />}
                  <span>
                    {i.texto}
                    {!i.ok && i.recomendado && " (recomendado)"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-text-primary">Fotos na ordem ({Math.min(produto.fotos.length, MAX_FOTOS_SHOPEE)}/{MAX_FOTOS_SHOPEE})</span>
              {onEstudio && (
                <Button size="sm" variant="ghost" onClick={onEstudio}>
                  <Wand2 size={14} /> Estúdio de IA
                </Button>
              )}
            </div>
            {produto.fotos.length ? (
              <div className="grid grid-cols-3 gap-2">
                {produto.fotos.slice(0, MAX_FOTOS_SHOPEE).map((u, n) => (
                  <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="relative block rounded-md overflow-hidden border border-border group">
                    <ImagemStorage src={u} alt={`Foto ${n + 1}`} className="w-full aspect-square object-cover" />
                    <span className="absolute left-1 top-1 rounded bg-surface-1 px-1 text-xs font-mono text-text-primary">{n === 0 ? "Capa" : n + 1}</span>
                    <ExternalLink size={13} className="absolute right-1 top-1 text-text-primary opacity-0 group-hover:opacity-100" aria-hidden />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">Sem fotos. Adicione no produto ou crie no Estúdio de IA.</p>
            )}
            <p className="mt-1 text-xs text-text-tertiary">A primeira é a capa: a Shopee prefere fundo branco.</p>
          </div>

          <Button variant="primary" className="w-full" onClick={copiar} disabled={!titulo.trim()}>
            <Copy size={15} /> Copiar anúncio
          </Button>
        </div>
      </div>
    </Modal>
  );
}

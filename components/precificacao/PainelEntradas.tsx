"use client";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { CampoNumero } from "@/components/ui/CampoNumero";

import { inputClass } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { formatBRL } from "@/lib/format";
import { limiteEfetivo, LIMITE_DESCRICAO_ANUNCIO } from "@/lib/ia/prompts";
import { EditorInsumos } from "@/components/precificacao/EditorInsumos";
import { FotoPrecificacao } from "@/components/precificacao/FotoPrecificacao";
import type { EstadoPrecificacao, ProdutoOpcao } from "@/lib/precificacao-estado";

/**
 * Nome do produto/anúncio, título gerado por IA e a composição de custo (valor do produto +
 * insumos). Extraído de `PrecificacaoClient.tsx` — recebe o objeto inteiro devolvido por
 * `usePrecificacao()` de propósito: é uma extração mecânica de linhas que já existiam, não
 * uma reescrita, então nada foi renomeado na fronteira entre hook e painel.
 */
export function PainelEntradas({
  estado,
  produtos,
}: {
  estado: EstadoPrecificacao;
  produtos: ProdutoOpcao[];
}) {
  const {
    nomeProduto,
    setNomeProduto,
    setProdutoId,
    produtoId,
    sugestoesAbertas,
    setSugestoesAbertas,
    sugestoesProdutos,
    selecionarSugestao,
    nomeAnuncio,
    setNomeAnuncio,
    descricaoAnuncio,
    setDescricaoAnuncio,
    lojaSelecionada,
    custoTotal,
    componentes,
    custoProduto,
    setCustoProduto,
    custoInsumos,
    atualizarComponente,
    adicionarComponente,
    adicionarComponenteDoProduto,
    removerComponente,
  } = estado;

  const produtoVinculado = produtos.find((p) => p.id === produtoId);
  const limiteDescricao = limiteEfetivo("descricao", lojaSelecionada?.limiteDescricao ?? LIMITE_DESCRICAO_ANUNCIO);

  return (
    <>
      <Card>
        <div className="relative mb-3">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Nome do Produto <span className="text-negative">*</span>
          </label>
          <input
            value={nomeProduto}
            onChange={(e) => {
              setNomeProduto(e.target.value);
              setProdutoId(null);
              setSugestoesAbertas(true);
            }}
            onFocus={() => setSugestoesAbertas(true)}
            onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
            className={inputClass}
            placeholder="Insira aqui Nome do Produto"
          />
          {sugestoesAbertas && sugestoesProdutos.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface-1 border border-border rounded-md shadow-elev-2 max-h-48 overflow-auto">
              {sugestoesProdutos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selecionarSugestao(p)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 text-text-primary"
                >
                  <span className="font-mono text-xs text-text-tertiary">{p.sku}</span> — {p.nome}
                </button>
              ))}
            </div>
          )}
        </div>
        <FotoPrecificacao propria={estado.imagemPropria} doProduto={produtoVinculado?.imagem_url ?? null} onChange={estado.setImagemPropria} />
        <label className="block text-xs font-medium text-text-secondary mb-1.5">Nome do Anúncio</label>
        <input
          value={nomeAnuncio}
          onChange={(e) => setNomeAnuncio(e.target.value)}
          className={inputClass}
          placeholder="Insira aqui Nome do Anúncio"
        />
        <label className="block text-xs font-medium text-text-secondary mb-1.5">Descrição do Anúncio (opcional)</label>
        <textarea
          value={descricaoAnuncio}
          onChange={(e) => setDescricaoAnuncio(e.target.value)}
          className={`${inputClass} h-24 py-2 resize-y`}
          maxLength={limiteDescricao}
          placeholder="Vai junto quando esta precificação virar produto"
        />
        {/* Título e descrição com IA moram só no Anúncio (decisão 3 do plano): aqui fica o atalho. */}
        <div className="mb-3 mt-1.5">
          {produtoId ? (
            <Link href={`/anuncio/infinito?produto=${produtoId}${lojaSelecionada ? `&loja=${lojaSelecionada.id}` : ""}`} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
              <Sparkles size={14} aria-hidden /> Criar anúncio deste produto (título, capa e descrição com IA)
            </Link>
          ) : (
            <p className="text-xs text-text-tertiary">Escolha um produto cadastrado para criar o anúncio dele com IA na aba Anúncio.</p>
          )}
        </div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Custo do Produto (R$) <span className="text-negative">*</span>
        </label>
        <CampoNumero
          min={0}
          value={custoProduto}
          onChange={(n) => setCustoProduto(n)}
          className={inputClass}
          placeholder="0,00"
        />
      </Card>

      <Card>
        <EditorInsumos
          componentes={componentes}
          produtos={produtos}
          atualizarComponente={atualizarComponente}
          adicionarComponente={adicionarComponente}
          adicionarComponenteDoProduto={adicionarComponenteDoProduto}
          removerComponente={removerComponente}
        />
        <div className="mt-3 pt-3 border-t border-border space-y-1.5">
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>Custo do produto</span>
            <span className="font-mono">{formatBRL(custoProduto)}</span>
          </div>
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>Insumos</span>
            <span className="font-mono">{formatBRL(custoInsumos)}</span>
          </div>
          <div className="flex items-center justify-between pt-1.5 border-t border-border">
            <span className="text-sm text-text-secondary">Custo Total Direto</span>
            <span className="font-mono text-text-primary font-semibold">{formatBRL(custoTotal)}</span>
          </div>
        </div>
      </Card>
    </>
  );
}

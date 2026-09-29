"use client";

import { ProductThumb } from "@/components/ui/ProductThumb";
import { PriceHistoryChart } from "@/components/charts/PriceHistoryChart";
import { formatBRL, formatarDataHora, classeValor } from "@/lib/format";
import type {
  Produto,
  MovimentacaoEstoque,
  PrecificacaoHist,
  PrecoCanal,
} from "@/app/(painel)/produtos/ProdutosClient";

export function ProdutoResumo({
  produto,
  movimentacoes,
  precificacoes,
  canais,
}: {
  produto: Produto;
  movimentacoes: MovimentacaoEstoque[];
  precificacoes: PrecificacaoHist[];
  canais: PrecoCanal[];
}) {
  const valorEstoque = produto.custo * produto.estoque;
  const movs = movimentacoes.filter((m) => m.produto_id === produto.id).slice(0, 10);
  const precs = precificacoes.filter((h) => h.produto_id === produto.id).slice(0, 10);
  const abaixoDoMinimo = produto.estoque <= produto.estoque_minimo;
  const sugestaoCompra = Math.max(0, Math.ceil(produto.saida_media_semanal * 4) - produto.estoque);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <ProductThumb src={produto.imagem_url} sku={produto.sku} size={56} />
        <div className="flex-1">
          <div className="text-xs text-text-tertiary">
            {produto.categoria_nome ?? "Sem categoria"} · {produto.fornecedor_nome ?? "Sem fornecedor"}
          </div>
          <div className="text-xs text-text-tertiary">Armazém: {produto.armazem_nome ?? "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border rounded-md p-3">
          <div className="text-xs text-text-tertiary mb-1">Estoque Atual</div>
          <div className="font-mono text-lg text-text-primary">{produto.estoque} un.</div>
        </div>
        <div className="border border-border rounded-md p-3">
          <div className="text-xs text-text-tertiary mb-1">Custo</div>
          <div className="font-mono text-lg text-text-primary">{formatBRL(produto.custo)}</div>
        </div>
        <div className="border border-border rounded-md p-3">
          <div className="text-xs text-text-tertiary mb-1">Valor em Estoque</div>
          <div className="font-mono text-lg text-text-primary">{formatBRL(valorEstoque)}</div>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-text-primary mb-2">Preço por Canal</h4>
        {canais.length === 0 ? (
          <div className="border border-border rounded-md p-4 text-center">
            <p className="text-sm text-text-tertiary mb-2">Nenhuma precificação salva para este produto ainda.</p>
            <a href="/precificacao" className="text-sm text-accent hover:underline">
              Ir para Precificação →
            </a>
          </div>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border">
            {canais.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="text-text-primary">{c.canal_nome ?? "Manual"}</span>
                <div className="flex items-center gap-4 text-xs">
                  <span className="font-mono text-accent">{formatBRL(c.preco)}</span>
                  <span className={`font-mono ${classeValor(c.margem_pct)}`}>{(c.margem_pct * 100).toFixed(1)}% marg.</span>
                  <span className={`font-mono ${classeValor(c.markup_pct)}`}>{(c.markup_pct * 100).toFixed(1)}% markup</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {abaixoDoMinimo && (
        <div className="bg-negative-soft border border-negative/20 rounded-md p-3 flex items-center justify-between">
          <div className="text-sm text-negative">
            Estoque no mínimo ({produto.estoque_minimo} un.) — saída média de {produto.saida_media_semanal} un./semana.
          </div>
          {sugestaoCompra > 0 && (
            <span className="text-sm font-medium text-negative shrink-0 ml-3">Sugestão: comprar {sugestaoCompra} un.</span>
          )}
        </div>
      )}

      <div>
        <h4 className="text-sm font-medium text-text-primary mb-2">Movimentações Recentes</h4>
        {movs.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhuma movimentação registrada para este produto.</p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border">
            {movs.map((m, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="text-text-primary">{m.motivo}</div>
                  <div className="text-xs text-text-tertiary">{formatarDataHora(m.data_movimentacao)}</div>
                </div>
                <span className={`font-mono ${m.tipo === "entrada" ? "text-positive" : "text-negative"}`}>
                  {m.tipo === "entrada" ? "+" : "-"}
                  {m.quantidade} un
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium text-text-primary mb-2">Histórico de Precificação</h4>
        {precs.length >= 2 && (
          <div className="mb-3 border border-border rounded-md p-2">
            <PriceHistoryChart data={precs.map((h) => ({ data: h.criado_em, preco: h.preco_calculado }))} />
          </div>
        )}
        {precs.length === 0 ? (
          <p className="text-sm text-text-tertiary">Nenhuma precificação salva para este produto ainda.</p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border">
            {precs.map((h, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <div className="text-text-primary">{h.canal ?? "—"}</div>
                  <div className="text-xs text-text-tertiary">{formatarDataHora(h.criado_em)}</div>
                </div>
                <span className="font-mono text-accent">{formatBRL(h.preco_calculado)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

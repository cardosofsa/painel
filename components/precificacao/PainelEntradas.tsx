"use client";

import { inputClass } from "@/components/ui/Modal";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { formatBRL } from "@/lib/format";
import { GeradorIA } from "@/components/ia/GeradorIA";
import { LIMITE_TITULO } from "@/lib/ia/prompts";
import { gerarTituloAnuncioIA } from "@/app/(painel)/precificacao/actions";
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
  iaDisponivel,
}: {
  estado: EstadoPrecificacao;
  produtos: ProdutoOpcao[];
  iaDisponivel: boolean;
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
    lojaSelecionada,
    custoTotal,
    resultado,
    componentes,
    concorrentes,
    custoProduto,
    setCustoProduto,
    custoInsumos,
    atualizarComponente,
    adicionarComponente,
    removerComponente,
  } = estado;

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
        <label className="block text-xs font-medium text-text-secondary mb-1.5">Nome do Anúncio</label>
        <input
          value={nomeAnuncio}
          onChange={(e) => setNomeAnuncio(e.target.value)}
          className={inputClass}
          placeholder="Insira aqui Nome do Anúncio"
        />
        {/* `key` pelo produto: trocar de produto zera a sugestão sem useEffect. */}
        <div className="mb-3">
          <GeradorIA
            key={`ia-titulo-${produtoId ?? nomeProduto}`}
            rotulo="Gerar título com IA"
            limite={LIMITE_TITULO}
            valorAtual={nomeAnuncio}
            disponivel={iaDisponivel}
            desabilitado={!nomeProduto.trim()}
            motivoDesabilitado={!nomeProduto.trim() ? "Informe o nome do produto primeiro." : undefined}
            gerar={(instrucaoExtra) =>
              gerarTituloAnuncioIA({
                produtoNome: nomeProduto,
                sku: produtos.find((p) => p.id === produtoId)?.sku ?? null,
                canal: lojaSelecionada?.canalNome ?? null,
                loja: lojaSelecionada?.nome ?? null,
                custo: custoTotal,
                precoCalculado: resultado.viavel ? resultado.precoVenda : null,
                componentes: componentes.map((c) => ({ nome: c.nome, quantidade: c.quantidade })),
                // Só nome e preço: o link do concorrente não entra no prompt.
                concorrentes: concorrentes.map((c) => ({ nome: c.nome, preco: c.preco })),
                instrucaoExtra,
              })
            }
            onUsar={setNomeAnuncio}
          />
        </div>
        <label className="block text-xs font-medium text-text-secondary mb-1.5">
          Custo do Produto (R$) <span className="text-negative">*</span>
        </label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={custoProduto || ""}
          onChange={(e) => setCustoProduto(Number(e.target.value) || 0)}
          className={inputClass}
          placeholder="0,00"
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-text-primary">Composição de Insumos e Embalagem</h3>
          <button onClick={adicionarComponente} className="text-sm text-accent hover:underline">
            + Adicionar Insumo
          </button>
        </div>
        <Table>
          <Thead>
            <tr>
              <Th>Componente</Th>
              <Th align="right">Qtd</Th>
              <Th align="right">Custo Unit.</Th>
              <Th align="right">Subtotal</Th>
              <Th></Th>
            </tr>
          </Thead>
          <tbody>
            {componentes.map((c) => (
              <Tr key={c.id}>
                <Td>
                  <input
                    value={c.nome}
                    onChange={(e) => atualizarComponente(c.id, "nome", e.target.value)}
                    className="w-full bg-transparent text-text-primary outline-none"
                  />
                </Td>
                <Td align="right">
                  <input
                    type="number"
                    min={0}
                    value={c.quantidade}
                    onChange={(e) => atualizarComponente(c.id, "quantidade", e.target.value)}
                    className="w-14 bg-transparent text-text-primary text-right outline-none tabular"
                  />
                </Td>
                <Td align="right">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={c.custoUnitario}
                    onChange={(e) => atualizarComponente(c.id, "custoUnitario", e.target.value)}
                    className="w-20 bg-transparent text-text-primary text-right outline-none tabular"
                  />
                </Td>
                <Td align="right" mono>
                  {formatBRL(c.quantidade * c.custoUnitario)}
                </Td>
                <Td align="right">
                  <button onClick={() => removerComponente(c.id)} className="text-text-tertiary hover:text-negative">
                    ×
                  </button>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
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

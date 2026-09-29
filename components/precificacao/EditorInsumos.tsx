"use client";

import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { campoBase } from "@/components/ui/Modal";
import { formatBRL } from "@/lib/format";
import type { ComponenteKit } from "@/lib/pricing";

interface ProdutoParaInsumo {
  id: string;
  nome: string;
  custo: number;
}

/**
 * Tabela de insumos/embalagem (nome, quantidade, custo unitário), reaproveitada por
 * Precificação e Produtos — antes só existia dentro de `PrecificacaoClient.tsx`.
 *
 * "Insumo puxado do estoque": o seletor acima da tabela lista os produtos cadastrados;
 * escolher um adiciona uma linha já preenchida com o nome e o custo dele
 * (`produtoId` fica gravado na linha, mas quantidade/nome/custo continuam editáveis depois
 * — puxar do estoque é um atalho de preenchimento, não um vínculo travado).
 */
export function EditorInsumos({
  componentes,
  produtos,
  atualizarComponente,
  adicionarComponente,
  adicionarComponenteDoProduto,
  removerComponente,
}: {
  componentes: ComponenteKit[];
  produtos: ProdutoParaInsumo[];
  atualizarComponente: (id: string, campo: keyof ComponenteKit, valor: string) => void;
  adicionarComponente: () => void;
  adicionarComponenteDoProduto: (produtoId: string) => void;
  removerComponente: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-medium text-text-primary">Composição de Insumos e Embalagem</h3>
        <div className="flex items-center gap-3">
          {produtos.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) adicionarComponenteDoProduto(e.target.value);
              }}
              className={`${campoBase} h-7 text-xs w-44`}
            >
              <option value="">+ Do estoque…</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          )}
          <button onClick={adicionarComponente} className="text-sm text-accent hover:underline shrink-0">
            + Insumo em branco
          </button>
        </div>
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
      {componentes.length === 0 && <p className="text-sm text-text-tertiary text-center py-3">Nenhum insumo adicionado.</p>}
    </div>
  );
}

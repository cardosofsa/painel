"use client";

import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { useState } from "react";
import { Combobox } from "@/components/ui/Combobox";
import { formatBRL } from "@/lib/format";
import type { ComponenteKit } from "@/lib/pricing";

interface ProdutoParaInsumo {
  id: string;
  nome: string;
  custo: number;
  sku?: string;
  /** Tipo da categoria (0042): insumo e embalagem aparecem primeiro na busca. */
  tipo?: "produto" | "insumo" | "embalagem" | null;
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
  // Remonta a busca depois de cada escolha: o campo volta vazio para o próximo item.
  const [rodada, setRodada] = useState(0);
  const insumo = (p: ProdutoParaInsumo) => p.tipo === "insumo" || p.tipo === "embalagem";
  const temTipo = produtos.some(insumo);
  const itens = [...produtos]
    .sort((a, b) => Number(insumo(b)) - Number(insumo(a)) || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((p) => ({
      id: p.id,
      rotulo: p.nome,
      busca: p.sku,
      detalhe: formatBRL(p.custo),
      grupo: temTipo ? (insumo(p) ? "Insumos e embalagens" : "Outros produtos") : undefined,
    }));

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <h3 className="text-sm font-medium text-text-primary">Composição de Insumos e Embalagem</h3>
        <button onClick={adicionarComponente} className="text-sm text-accent hover:underline shrink-0">
          + Em branco
        </button>
      </div>
      {produtos.length > 0 && (
        <div className="mb-3">
          <Combobox
            key={rodada}
            itens={itens}
            valor={null}
            onChange={(id) => {
              if (!id) return;
              adicionarComponenteDoProduto(id);
              setRodada((r) => r + 1);
            }}
            placeholder={temTipo ? "Buscar insumo ou embalagem cadastrado…" : "Buscar produto cadastrado para usar como insumo…"}
          />
          {/* Regra do dono: precificar NÃO baixa estoque. Só copia nome e custo. */}
          <p className="text-[11px] text-text-tertiary mt-1">Só copia nome e custo para a conta: não mexe no estoque.</p>
        </div>
      )}
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

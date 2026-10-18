"use client";

import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { campoBase } from "@/components/ui/Modal";
import { formatBRL } from "@/lib/format";
import { CampoNumero } from "@/components/ui/CampoNumero";
import type { LinhaEmMassa, LojaMassa, ProdutoMassa } from "@/lib/precificacao-massa";

const NUM = `${campoBase} text-right tabular`;

/** Grade de entrada da precificação em massa: uma linha por produto. */
export function TabelaEntradaMassa({
  linhas,
  lojas,
  sugestaoAbertaId,
  onSugestaoAberta,
  sugestoesPorNome,
  onVincularProduto,
  onAtualizar,
  onRemover,
}: {
  linhas: LinhaEmMassa[];
  lojas: LojaMassa[];
  sugestaoAbertaId: string | null;
  onSugestaoAberta: (atualizar: (atual: string | null) => string | null) => void;
  sugestoesPorNome: (nome: string) => ProdutoMassa[];
  onVincularProduto: (linhaId: string, produto: ProdutoMassa) => void;
  onAtualizar: (linhaId: string, campo: keyof LinhaEmMassa, valor: string | number) => void;
  onRemover: (linhaId: string) => void;
}) {
  return (
    <Table>
      <Thead>
        <tr>
          <Th>SKU</Th>
          <Th>Nome</Th>
          <Th>Loja</Th>
          <Th align="right">Custo (R$)</Th>
          <Th align="right">Comissão (%)</Th>
          <Th align="right">Taxa Fixa (R$)</Th>
          <Th align="right">Impostos (%)</Th>
          <Th align="right">Margem (%)</Th>
          <Th align="right">Preço Atual (R$)</Th>
          <Th></Th>
        </tr>
      </Thead>
      <tbody>
        {linhas.map((l) => {
          const loja = lojas.find((lj) => lj.id === l.lojaId);
          // Sem faixa cadastrada o cálculo usa a comissão da loja (lib/precificacao-massa.ts).
          const isFaixa = loja?.tipoTaxa === "faixas" && loja.faixas.length > 0;
          const sugestoes = sugestaoAbertaId === l.id ? sugestoesPorNome(l.nome) : [];
          return (
            <Tr key={l.id}>
              <Td>
                <input
                  value={l.sku}
                  onChange={(e) => onAtualizar(l.id, "sku", e.target.value)}
                  className={`${campoBase} w-28`}
                  placeholder="SKU"
                  aria-label="SKU"
                />
              </Td>
              <Td className="relative">
                <input
                  value={l.nome}
                  onChange={(e) => onAtualizar(l.id, "nome", e.target.value)}
                  onFocus={() => onSugestaoAberta(() => l.id)}
                  onBlur={() => setTimeout(() => onSugestaoAberta((v) => (v === l.id ? null : v)), 150)}
                  className={`${campoBase} w-40`}
                  placeholder="Nome do produto"
                  aria-label="Nome do produto"
                />
                {sugestoes.length > 0 && (
                  <div className="absolute z-10 top-full left-0 mt-1 w-56 bg-surface-1 border border-border rounded-md shadow-elev-2 py-1 text-sm max-h-48 overflow-y-auto">
                    {sugestoes.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onVincularProduto(l.id, p)}
                        className="w-full text-left px-3 py-1.5 hover:bg-surface-2 text-text-primary"
                      >
                        {p.sku} — {p.nome}
                      </button>
                    ))}
                  </div>
                )}
              </Td>
              <Td>
                <select
                  value={l.lojaId ?? ""}
                  onChange={(e) => onAtualizar(l.id, "lojaId", e.target.value)}
                  className={`${campoBase} w-36`}
                  aria-label="Loja"
                >
                  <option value="">Manual</option>
                  {lojas.map((lj) => (
                    <option key={lj.id} value={lj.id}>
                      {lj.nome}
                    </option>
                  ))}
                </select>
              </Td>
              <Td align="right">
                <CampoNumero
                  min={0}
                  casas={2}
                  value={l.custo}
                  onChange={(n) => onAtualizar(l.id, "custo", n)}
                  className={`${NUM} w-24`}
                  aria-label="Custo"
                />
              </Td>
              <Td align="right">
                {isFaixa ? (
                  <span className="text-xs text-text-tertiary">Automático</span>
                ) : loja ? (
                  // Com loja, o cálculo usa a comissão dela: campo editável aqui era ignorado.
                  <span className="text-xs text-text-secondary font-mono">{loja.comissaoPct}%</span>
                ) : (
                  <CampoNumero
                    min={0}
                    casas={2}
                    value={l.comissaoPct}
                    onChange={(n) => onAtualizar(l.id, "comissaoPct", n)}
                    className={`${NUM} w-20`}
                    aria-label="Comissão"
                  />
                )}
              </Td>
              <Td align="right">
                {isFaixa ? (
                  <span className="text-xs text-text-tertiary">Automático</span>
                ) : loja ? (
                  <span className="text-xs text-text-secondary font-mono">{formatBRL(loja.taxaFixa)}</span>
                ) : (
                  <CampoNumero
                    min={0}
                    casas={2}
                    value={l.taxaFixa}
                    onChange={(n) => onAtualizar(l.id, "taxaFixa", n)}
                    className={`${NUM} w-20`}
                    aria-label="Taxa fixa"
                  />
                )}
              </Td>
              <Td align="right">
                <CampoNumero
                  min={0}
                  casas={2}
                  value={l.impostoPct}
                  onChange={(n) => onAtualizar(l.id, "impostoPct", n)}
                  className={`${NUM} w-20`}
                  aria-label="Impostos"
                />
              </Td>
              <Td align="right">
                <CampoNumero
                  min={0}
                  casas={2}
                  value={l.margemPct}
                  onChange={(n) => onAtualizar(l.id, "margemPct", n)}
                  className={`${NUM} w-20`}
                  aria-label="Margem"
                />
              </Td>
              <Td align="right">
                <CampoNumero
                  min={0}
                  casas={2}
                  value={l.precoAtual}
                  onChange={(n) => onAtualizar(l.id, "precoAtual", n)}
                  className={`${NUM} w-24`}
                  placeholder="—"
                  aria-label="Preço atual"
                />
              </Td>
              <Td align="right">
                <button
                  onClick={() => onRemover(l.id)}
                  className="text-text-tertiary hover:text-negative px-1"
                  aria-label="Remover linha"
                >
                  ×
                </button>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}

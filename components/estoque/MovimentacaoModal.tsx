"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { executarComToast } from "@/lib/acao-cliente";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import { movimentarEstoqueArmazem, registrarEntradaComCusto, registrarMovimentacaoEstoque } from "@/app/(painel)/estoque/actions";
import type { Armazem, ProdutoEstoque, SaldoArmazem } from "@/app/(painel)/estoque/EstoqueClient";

type Tipo = "entrada" | "saida" | "transferencia";

/**
 * Movimentação de estoque começando pelo ARMAZÉM: escolhe onde, depois busca o produto
 * (com o saldo daquele armazém ao lado) e diz o que aconteceu. Transferência leva de um
 * armazém para outro sem mexer no total.
 *
 * Sem a migração 0041 (`porArmazem` falso) cai no caminho antigo: entrada/saída no total.
 */
export function MovimentacaoModal({
  aberto,
  onClose,
  produtos,
  armazens,
  saldos,
  porArmazem,
  armazemInicial,
}: {
  aberto: boolean;
  onClose: () => void;
  produtos: ProdutoEstoque[];
  armazens: Armazem[];
  saldos: SaldoArmazem[];
  porArmazem: boolean;
  armazemInicial?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const inicial = { armazemId: armazemInicial ?? armazens[0]?.id ?? "", produtoId: null as string | null, tipo: "entrada" as Tipo, quantidade: 1, custo: 0, destinoId: "", motivo: "" };
  const [armazemId, setArmazemId] = useState(inicial.armazemId);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Tipo>("entrada");
  const [quantidade, setQuantidade] = useState(1);
  const [custo, setCusto] = useState(0);
  const [destinoId, setDestinoId] = useState("");
  const [motivo, setMotivo] = useState("");
  const sujo = useFormularioSujo({ armazemId, produtoId, tipo, quantidade, custo, destinoId, motivo }, inicial);

  const saldoNoArmazem = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of saldos) if (s.armazem_id === armazemId) m.set(s.produto_id, s.quantidade);
    return m;
  }, [saldos, armazemId]);

  // Saída e transferência só listam o que existe no armazém; entrada lista tudo.
  const itens = useMemo(
    () =>
      produtos
        .filter((p) => p.ativo !== false)
        .filter((p) => tipo === "entrada" || !porArmazem || (saldoNoArmazem.get(p.id) ?? 0) > 0)
        .map((p) => ({
          id: p.id,
          rotulo: p.nome,
          busca: p.sku,
          detalhe: porArmazem ? `${saldoNoArmazem.get(p.id) ?? 0} un. aqui` : `${p.estoque} un.`,
        })),
    [produtos, tipo, porArmazem, saldoNoArmazem],
  );
  const produto = produtos.find((p) => p.id === produtoId) ?? null;
  const saldo = produto ? (porArmazem ? (saldoNoArmazem.get(produto.id) ?? 0) : produto.estoque) : 0;

  function registrar() {
    if (!produto) return toast.error("Escolha o produto.");
    if (quantidade <= 0) return toast.error("A quantidade precisa ser maior que zero.");
    if (tipo !== "entrada" && quantidade > saldo) return toast.error(`Só há ${saldo} unidade(s) deste produto aqui.`);
    if (tipo === "transferencia" && !destinoId) return toast.error("Escolha o armazém de destino.");
    startTransition(async () => {
      const r = porArmazem
        ? await executarComToast(
            movimentarEstoqueArmazem({
              produtoId: produto.id,
              armazemId,
              tipo,
              quantidade,
              custoUnitario: tipo === "entrada" ? custo : null,
              destinoId: tipo === "transferencia" ? destinoId : null,
              motivo: motivo.trim() || null,
            }),
            { sucesso: tipo === "transferencia" ? "Transferência registrada" : "Movimentação registrada", erro: "Erro ao registrar" },
          )
        : tipo === "entrada"
          ? await executarComToast(registrarEntradaComCusto({ produtoId: produto.id, quantidade, custoUnitario: custo, motivo: motivo.trim() || null }), {
              sucesso: "Entrada registrada",
              erro: "Erro ao registrar entrada",
            })
          : await executarComToast(registrarMovimentacaoEstoque({ produtoId: produto.id, tipo: "saida", quantidade, motivo: motivo.trim() || "Saída manual" }), {
              sucesso: "Saída registrada",
              erro: "Erro ao registrar saída",
            });
      if (r.ok) onClose();
    });
  }

  const outros = armazens.filter((a) => a.id !== armazemId);

  return (
    <Modal open={aberto} onClose={onClose} title="Registrar Movimentação" sujo={sujo}>
      <FormField label="1. Armazém">
        <select
          className={inputClass}
          value={armazemId}
          onChange={(e) => {
            setArmazemId(e.target.value);
            setProdutoId(null);
          }}
        >
          {armazens.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="2. O que aconteceu">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de movimentação">
          {(
            [
              ["entrada", "Entrada"],
              ["saida", "Saída"],
              ["transferencia", "Transferir"],
            ] as const
          ).map(([v, r]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={tipo === v}
              disabled={v === "transferencia" && (!porArmazem || outros.length === 0)}
              title={v === "transferencia" && !porArmazem ? "Disponível depois da migração 0041" : undefined}
              onClick={() => {
                setTipo(v);
                setProdutoId(null);
              }}
              className={`h-9 rounded-md border text-sm disabled:opacity-40 ${tipo === v ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </FormField>

      <FormField label="3. Produto">
        {/* `key`: trocar de armazém ou tipo recomeça a busca (o texto digitado fica no Combobox). */}
        <Combobox key={`${armazemId}-${tipo}`} itens={itens} valor={produtoId} onChange={setProdutoId} placeholder="Digite o nome ou o SKU…" vazio={tipo === "entrada" ? "Nenhum produto com esse nome" : "Nada com saldo neste armazém"} />
        {produto && <p className="text-xs text-text-tertiary mt-1">Saldo {porArmazem ? "neste armazém" : "total"}: {saldo} un.</p>}
      </FormField>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Quantidade">
          <input type="number" min={1} className={inputClass} value={quantidade} onChange={(e) => setQuantidade(Math.floor(Number(e.target.value) || 0))} />
        </FormField>
        {tipo === "transferencia" ? (
          <FormField label="Para o armazém">
            <select className={inputClass} value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
              <option value="">Escolha…</option>
              {outros.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </FormField>
        ) : tipo === "entrada" ? (
          <FormField label="Custo unitário (R$)" dica="O custo do produto vira a média ponderada.">
            <input type="number" min={0} step="0.01" className={inputClass} value={custo || ""} placeholder="0,00" onChange={(e) => setCusto(Number(e.target.value) || 0)} />
          </FormField>
        ) : (
          <div />
        )}
      </div>

      <FormField label="Motivo (opcional)">
        <input className={inputClass} value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex: ajuste de inventário, avaria, reposição da loja" />
      </FormField>

      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={registrar} loading={pending}>
          Registrar
        </Button>
      </div>
    </Modal>
  );
}

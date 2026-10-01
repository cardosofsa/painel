"use client";

import { useMemo, useState, useTransition } from "react";
import { FileUp, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { EmptyState } from "@/components/ui/EmptyState";
import { RowMenu } from "@/components/ui/RowMenu";
import { BarraFiltros, FiltroSelect } from "@/components/ui/BarraFiltros";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL, formatarDataCurta } from "@/lib/format";
import { ROTULO_STATUS_MARKETPLACE, type StatusMarketplace } from "@/lib/marketplace/shopee-planilha";
import type { DadosMarketplace, PedidoMarketplaceSalvo } from "@/lib/marketplace/pedidos-servidor";
import { removerPedidoMarketplace } from "@/app/(painel)/vendas/marketplace-actions";
import { ImportarShopeeModal, type LojaMarketplace, type ProdutoMarketplace } from "./ImportarShopeeModal";
import { ConexaoShopee } from "./ConexaoShopee";

const TOM: Record<StatusMarketplace, string> = {
  nao_pago: "bg-surface-2 text-text-tertiary",
  a_enviar: "bg-accent-soft text-accent",
  enviado: "bg-surface-2 text-text-primary",
  concluido: "bg-positive-soft text-positive",
  cancelado: "bg-negative-soft text-negative",
  devolvido: "bg-negative-soft text-negative",
};

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Pedidos de marketplace (Shopee) importados da planilha: status, repasse e lucro REAL
 * (taxas cobradas + custo do cadastro + imposto), com o detalhe ao passar o mouse.
 */
export function PedidosMarketplace({
  dados,
  lojas,
  produtos,
  impostoPct,
  apiLigada,
  aviso,
}: {
  /** O sistema tem SHOPEE_PARTNER_ID/KEY e o cofre: mostra conectar/sincronizar. */
  apiLigada: boolean;
  /** `?shopee=` da volta da autorização. */
  aviso: string | null;
  dados: DadosMarketplace;
  lojas: LojaMarketplace[];
  produtos: ProdutoMarketplace[];
  impostoPct: number;
}) {
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [importando, setImportando] = useState(false);
  const [busca, setBusca] = useState("");
  const [loja, setLoja] = useState("");
  const [status, setStatus] = useState("");
  const nomeLoja = useMemo(() => new Map(lojas.map((l) => [l.id, l.nome])), [lojas]);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.pedidos.filter((p) => {
      if (loja && p.loja_id !== loja) return false;
      if (status && p.status !== status) return false;
      if (t && !p.numero.toLowerCase().includes(t) && !(p.comprador ?? "").toLowerCase().includes(t) && !p.pedidos_marketplace_itens.some((i) => i.nome.toLowerCase().includes(t)))
        return false;
      return true;
    });
  }, [dados.pedidos, busca, loja, status]);

  const ativos = filtrados.filter((p) => p.status !== "cancelado" && p.status !== "devolvido");
  const repasse = ativos.reduce((s, p) => s + p.repasse, 0);
  const lucro = ativos.reduce((s, p) => s + p.lucro, 0);
  const aEnviar = dados.pedidos.filter((p) => p.status === "a_enviar").length;

  async function remover(p: PedidoMarketplaceSalvo) {
    const ok = await confirm({
      title: `Remover o pedido ${p.numero}?`,
      message: p.estoque_baixado
        ? "O estoque baixado por ele volta e o repasse pendente sai do Financeiro. Importar a planilha de novo traz o pedido de volta."
        : "O repasse pendente sai do Financeiro. Importar a planilha de novo traz o pedido de volta.",
      confirmLabel: "Remover",
    });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerPedidoMarketplace(p.id), { sucesso: `Pedido ${p.numero} removido`, erro: "Erro ao remover" });
    });
  }

  if (!dados.disponivel) {
    return (
      <Card>
        <EmptyState
          icon={ShoppingBag}
          title="Pedidos da Shopee ainda não ativados"
          description="Aplique a migração 0046 no Supabase (SQL Editor) para importar os pedidos da Central do Vendedor."
        />
      </Card>
    );
  }

  return (
    <>
      {apiLigada && <ConexaoShopee lojas={lojas} conexoes={dados.conexoes} aviso={aviso} />}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-text-secondary">
            A enviar: <strong className="text-text-primary">{aEnviar}</strong>
          </span>
          <span className="text-text-secondary">
            Repasse: <strong className="font-mono text-text-primary">{formatBRL(repasse)}</strong>
          </span>
          <span className="text-text-secondary">
            Lucro: <strong className={`font-mono ${lucro >= 0 ? "text-positive" : "text-negative"}`}>{formatBRL(lucro)}</strong>
          </span>
        </div>
        <Button variant="primary" onClick={() => setImportando(true)}>
          <FileUp size={14} /> Importar planilha da Shopee
        </Button>
      </div>

      <BarraFiltros
        busca={busca}
        onBusca={setBusca}
        placeholder="Nº, comprador ou produto…"
        ativos={(loja ? 1 : 0) + (status ? 1 : 0)}
        onLimpar={() => {
          setBusca("");
          setLoja("");
          setStatus("");
        }}
      >
        {lojas.length > 1 && <FiltroSelect rotulo="Loja" valor={loja} onChange={setLoja} todos="Todas" opcoes={lojas.map((l) => ({ valor: l.id, rotulo: l.nome }))} />}
        <FiltroSelect
          rotulo="Status"
          valor={status}
          onChange={setStatus}
          todos="Todos"
          opcoes={(Object.keys(ROTULO_STATUS_MARKETPLACE) as StatusMarketplace[]).map((s) => ({ valor: s, rotulo: ROTULO_STATUS_MARKETPLACE[s] }))}
        />
      </BarraFiltros>

      <Card padding="nenhum" className="overflow-visible">
        {filtrados.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title={dados.pedidos.length ? "Nenhum pedido com esses filtros" : "Nenhum pedido importado"}
            description="Exporte os pedidos na Central do Vendedor da Shopee e importe aqui. Dá para importar de novo para atualizar status."
          />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Pedido</Th>
                <Th>Data</Th>
                <Th>Comprador</Th>
                <Th>Status</Th>
                <Th align="right">Repasse</Th>
                <Th align="right"></Th>
              </tr>
            </Thead>
            <tbody>
              {filtrados.map((p) => (
                <Tr key={p.id}>
                  <Td>
                    <div className="font-mono text-xs text-text-primary">{p.numero}</div>
                    <div className="text-[11px] text-text-tertiary">{nomeLoja.get(p.loja_id) ?? "Loja"}</div>
                  </Td>
                  <Td>{p.criado_em_plataforma ? formatarDataCurta(p.criado_em_plataforma) : "—"}</Td>
                  <Td>
                    <div className="max-w-[14rem] truncate">
                      {p.comprador ?? "—"}
                      {p.uf ? <span className="text-text-tertiary"> · {p.cidade ? `${p.cidade}/` : ""}{p.uf}</span> : null}
                    </div>
                    <div className="text-[11px] text-text-tertiary truncate max-w-[14rem]">{p.pedidos_marketplace_itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ")}</div>
                  </Td>
                  <Td>
                    <span className={`text-[11px] font-medium rounded px-1.5 py-0.5 ${TOM[p.status]}`}>{ROTULO_STATUS_MARKETPLACE[p.status]}</span>
                    {p.custo_incompleto && p.status !== "cancelado" && <div className="text-[11px] text-negative mt-0.5">sem custo em algum item</div>}
                  </Td>
                  <Td align="right">
                    <ValorMarketplace p={p} />
                  </Td>
                  <Td align="right">
                    <RowMenu actions={[{ label: "Remover pedido", onClick: () => remover(p), destructive: true }]} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {importando && (
        <ImportarShopeeModal onClose={() => setImportando(false)} lojas={lojas} produtos={produtos} vinculos={dados.vinculos} impostoPct={impostoPct} />
      )}
      {ConfirmDialog}
    </>
  );
}

/** Repasse com lucro embaixo; passando o mouse, da venda ao lucro com as taxas reais. */
function ValorMarketplace({ p }: { p: PedidoMarketplaceSalvo }) {
  const cancelado = p.status === "cancelado" || p.status === "devolvido";
  const margem = p.subtotal > 0 ? p.lucro / p.subtotal : 0;
  const linhas: [string, number][] = [
    ["Venda dos produtos", p.subtotal],
    ...(p.cupom_vendedor > 0 ? ([["Cupom do vendedor", -p.cupom_vendedor]] as [string, number][]) : []),
    ["Comissão", -p.comissao],
    ["Taxa de serviço", -p.taxa_servico],
    ...(p.taxa_transacao > 0 ? ([["Taxa de transação", -p.taxa_transacao]] as [string, number][]) : []),
  ];
  return (
    <div className="relative group inline-block text-right" tabIndex={0} aria-label={`Repasse ${formatBRL(p.repasse)}, lucro ${formatBRL(p.lucro)}`}>
      <div className={`font-mono ${cancelado ? "text-text-tertiary line-through" : "text-text-primary"}`}>{formatBRL(cancelado ? p.subtotal : p.repasse)}</div>
      {!cancelado && (
        <>
          <div className={`text-[11px] font-medium ${p.lucro >= 0 ? "text-positive" : "text-negative"}`}>
            {formatBRL(p.lucro)} · {pct(margem)}
          </div>
          <div className="invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 transition-opacity absolute right-0 top-full mt-1 z-30 w-64 rounded-md border border-border bg-surface-1 shadow-elev-2 p-3 text-left text-xs">
            {linhas.map(([r, v]) => (
              <Linha key={r} rotulo={r} valor={v} />
            ))}
            <div className="border-t border-border my-1.5" />
            <Linha rotulo="Repasse da Shopee" valor={p.repasse} forte />
            <Linha rotulo="Custo dos produtos" valor={-p.custo} />
            {p.imposto > 0 && <Linha rotulo="Imposto" valor={-p.imposto} />}
            <div className="border-t border-border my-1.5" />
            <div className={`flex justify-between font-semibold ${p.lucro >= 0 ? "text-positive" : "text-negative"}`}>
              <span>Lucro ({pct(margem)})</span>
              <span className="font-mono">{formatBRL(p.lucro)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: number; forte?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${forte ? "font-medium text-text-primary" : "text-text-secondary"}`}>
      <span>{rotulo}</span>
      <span className="font-mono">{formatBRL(valor)}</span>
    </div>
  );
}

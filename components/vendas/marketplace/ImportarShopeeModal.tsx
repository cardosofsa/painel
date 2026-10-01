"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileUp, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import { lerPlanilha, type ErroImportacao } from "@/lib/importar";
import { interpretarPlanilhaShopee, ROTULO_STATUS_MARKETPLACE, type PedidoMarketplace, type StatusMarketplace } from "@/lib/marketplace/shopee-planilha";
import { montarPedidosParaGravar, produtoDoItem, skuExterno, type VinculoSku } from "@/lib/marketplace/margem";
import { importarPedidosMarketplace, salvarVinculosMarketplace } from "@/app/(painel)/vendas/marketplace-actions";

export interface LojaMarketplace {
  id: string;
  nome: string;
  canalNome: string;
}

export interface ProdutoMarketplace {
  id: string;
  sku: string | null;
  nome: string;
  custo: number;
}

/**
 * Importar a planilha de pedidos da Shopee de UMA loja. Antes de gravar: resumo por status,
 * repasse e lucro previstos, e os itens cujo SKU não bateu com nenhum produto — dá para
 * vincular ali mesmo (o vínculo fica salvo para as próximas importações).
 */
export function ImportarShopeeModal({
  onClose,
  lojas,
  produtos,
  vinculos,
  impostoPct,
}: {
  onClose: () => void;
  lojas: LojaMarketplace[];
  produtos: ProdutoMarketplace[];
  vinculos: (VinculoSku & { loja_id: string })[];
  /** Fração. */
  impostoPct: number;
}) {
  const [pending, startTransition] = useTransition();
  const padrao = lojas.find((l) => /shopee/i.test(`${l.canalNome} ${l.nome}`)) ?? lojas[0];
  const [lojaId, setLojaId] = useState(padrao?.id ?? "");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [pedidos, setPedidos] = useState<PedidoMarketplace[]>([]);
  const [erros, setErros] = useState<ErroImportacao[]>([]);
  /** Vínculos escolhidos nesta importação: sku externo → produto. */
  const [novos, setNovos] = useState<Record<string, string>>({});

  const vinculosDaLoja = useMemo(() => {
    const base = vinculos.filter((v) => v.loja_id === lojaId);
    const extra = Object.entries(novos).map(([sku_externo, produto_id]) => ({ sku_externo, produto_id }));
    return [...extra, ...base];
  }, [vinculos, lojaId, novos]);

  const semVinculo = useMemo(() => {
    const m = new Map<string, { chave: string; nome: string; variacao: string | null; quantidade: number }>();
    for (const p of pedidos)
      for (const i of p.itens) {
        const chave = skuExterno(i);
        if (novos[chave] || produtoDoItem(i, produtos, vinculosDaLoja)) continue;
        const atual = m.get(chave) ?? { chave, nome: i.nome, variacao: i.variacao, quantidade: 0 };
        atual.quantidade += i.quantidade;
        m.set(chave, atual);
      }
    return [...m.values()].sort((a, b) => b.quantidade - a.quantidade);
  }, [pedidos, produtos, vinculosDaLoja, novos]);

  // Pendentes de vínculo continuam na lista para trocar o produto escolhido.
  const pendentes = useMemo(() => {
    const chaves = new Set([...semVinculo.map((s) => s.chave), ...Object.keys(novos)]);
    const info = new Map<string, { nome: string; variacao: string | null }>();
    for (const p of pedidos) for (const i of p.itens) info.set(skuExterno(i), { nome: i.nome, variacao: i.variacao });
    return [...chaves].map((c) => ({ chave: c, ...(info.get(c) ?? { nome: c, variacao: null }) }));
  }, [semVinculo, novos, pedidos]);

  const gravar = useMemo(() => montarPedidosParaGravar(pedidos, produtos, vinculosDaLoja, impostoPct), [pedidos, produtos, vinculosDaLoja, impostoPct]);
  const porStatus = useMemo(() => {
    const c = new Map<StatusMarketplace, number>();
    for (const p of pedidos) c.set(p.status, (c.get(p.status) ?? 0) + 1);
    return [...c.entries()];
  }, [pedidos]);
  const validos = gravar.filter((p) => p.status !== "cancelado" && p.status !== "devolvido");
  const repasse = validos.reduce((s, p) => s + p.repasse, 0);
  const lucro = validos.reduce((s, p) => s + p.lucro, 0);
  const itensProduto = useMemo(() => produtos.map((p) => ({ id: p.id, rotulo: p.nome, detalhe: p.sku ?? undefined, busca: p.sku ?? "" })), [produtos]);

  async function ler(file: File) {
    setLendo(true);
    try {
      const r = interpretarPlanilhaShopee(await lerPlanilha(file));
      if (r.faltando.length) {
        toast.error("Esta não parece a planilha de pedidos da Shopee (faltam: ID do pedido, Nome do Produto ou Quantidade).");
        return;
      }
      setArquivo(file.name);
      setPedidos(r.pedidos);
      setErros(r.erros);
      setNovos({});
      if (r.pedidos.length === 0) toast.error("Nenhum pedido encontrado na planilha.");
    } catch (e) {
      console.error("[shopee]", e);
      toast.error("Não consegui ler o arquivo. Use o .xlsx exportado da Central do Vendedor.");
    } finally {
      setLendo(false);
    }
  }

  function importar() {
    if (!lojaId) return toast.error("Escolha a loja.");
    startTransition(async () => {
      const lista = Object.entries(novos).map(([sku_externo, produto_id]) => ({ sku_externo, produto_id }));
      if (lista.length) {
        const v = await executarComToast(salvarVinculosMarketplace(lojaId, lista), { erro: "Erro ao salvar os vínculos" });
        if (!v.ok) return;
      }
      const r = await executarComToast(importarPedidosMarketplace(lojaId, gravar), { erro: "Erro ao importar" });
      if (r.ok) {
        const d = r.dado;
        toast.success(
          `${d.novos} pedido(s) novo(s), ${d.atualizados} atualizado(s). ${d.baixas ? `${d.baixas} baixa(s) no estoque. ` : ""}${d.estornos ? `${d.estornos} estorno(s).` : ""}`,
        );
        onClose();
      }
    });
  }

  return (
    <Modal open onClose={onClose} title="Importar pedidos da Shopee" width="max-w-2xl">
      {lojas.length === 0 ? (
        <p className="text-sm text-text-secondary">Cadastre a loja da Shopee em Configurações → Canais de venda para importar os pedidos dela.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end mb-2">
            <FormField label="Loja">
              <select className={inputClass} value={lojaId} onChange={(e) => setLojaId(e.target.value)}>
                {lojas.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.canalNome} — {l.nome}
                  </option>
                ))}
              </select>
            </FormField>
            <label className="mb-3 inline-flex items-center gap-2 h-9 px-3 rounded-md border border-dashed border-border-forte text-sm text-text-secondary hover:bg-surface-2 cursor-pointer">
              <FileUp size={15} /> {lendo ? "Lendo…" : arquivo ? "Trocar planilha" : "Escolher planilha"}
              <input
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) ler(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="text-xs text-text-tertiary mb-4">
            Na Central do Vendedor: Meus Pedidos → Exportar (escolha o período) → baixe o .xlsx. Importar de novo atualiza status e taxas, sem duplicar.
            Pedido a enviar, enviado ou concluído baixa o estoque uma vez, no armazém que abastece esta loja.
          </p>

          {erros.length > 0 && (
            <div className="rounded-md border border-negative/30 bg-negative-soft px-3 py-2 mb-4 max-h-28 overflow-y-auto text-xs text-negative">
              {erros.slice(0, 30).map((e, i) => (
                <div key={i}>
                  Linha {e.linha}: {e.mensagem}
                </div>
              ))}
            </div>
          )}

          {pedidos.length > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Resumo rotulo="Pedidos" valor={String(pedidos.length)} />
                <Resumo rotulo="Repasse previsto" valor={formatBRL(repasse)} />
                <Resumo rotulo="Lucro estimado" valor={formatBRL(lucro)} tom={lucro >= 0 ? "positive" : "negative"} />
              </div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {porStatus.map(([s, n]) => (
                  <span key={s} className="text-[11px] rounded px-1.5 py-0.5 bg-surface-2 text-text-secondary">
                    {ROTULO_STATUS_MARKETPLACE[s]}: {n}
                  </span>
                ))}
              </div>

              {pendentes.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-text-primary mb-1">
                    <Link2 size={14} /> Vincular anúncios a produtos ({semVinculo.length} sem vínculo)
                  </div>
                  <p className="text-xs text-text-tertiary mb-2">
                    Sem vínculo o pedido entra, mas sem custo (lucro superestimado) e sem baixa no estoque. O vínculo fica salvo para a próxima vez.
                  </p>
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {pendentes.map((s) => (
                      <div key={s.chave} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                        <div className="min-w-0">
                          <div className="text-sm text-text-primary truncate" title={s.nome}>
                            {s.nome}
                            {s.variacao ? ` · ${s.variacao}` : ""}
                          </div>
                          <div className="text-[11px] font-mono text-text-tertiary truncate">{s.chave}</div>
                        </div>
                        <Combobox
                          itens={itensProduto}
                          valor={novos[s.chave] ?? null}
                          onChange={(id) =>
                            setNovos((n) => {
                              const c = { ...n };
                              if (id) c[s.chave] = id;
                              else delete c[s.chave];
                              return c;
                            })
                          }
                          placeholder="Escolher produto…"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button variant="primary" className="w-full" loading={pending} onClick={importar}>
                Importar {pedidos.length} pedido(s)
              </Button>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

function Resumo({ rotulo, valor, tom }: { rotulo: string; valor: string; tom?: "positive" | "negative" }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="text-[11px] text-text-tertiary">{rotulo}</div>
      <div className={`font-mono text-sm font-semibold ${tom === "positive" ? "text-positive" : tom === "negative" ? "text-negative" : "text-text-primary"}`}>{valor}</div>
    </div>
  );
}

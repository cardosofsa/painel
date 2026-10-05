"use client";

import { useState, useTransition } from "react";
import { Megaphone, Plus, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { formatBRL, formatarDataIso } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { removerGastoAnuncio } from "@/app/(painel)/financeiro/resultado-actions";
import { ImportarAnunciosModal, LancarAnuncioModal } from "@/components/financeiro/ModaisAnuncios";

/** Uma linha de `dre_mensal` (0066). Valores em reais, já somados no banco. */
export interface LinhaDre {
  mes: string;
  receita_bruta: number;
  descontos: number;
  devolucoes: number;
  impostos: number;
  taxas_marketplace: number;
  taxa_maquininha: number;
  frete: number;
  cmv: number;
  anuncios: number;
  despesas: number;
  outras_receitas: number;
  lucro_liquido: number;
  pedidos: number;
}

export interface GastoAnuncio {
  id: string;
  periodo_inicio: string;
  periodo_fim: string;
  canal: string;
  campanha: string;
  valor: number;
  pedidos: number | null;
  vendas: number | null;
  origem: "shopee_ads" | "manual";
}

const nomeMes = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

type Linha = { rotulo: string; valor: (d: LinhaDre) => number; tipo: "receita" | "deducao" | "total" | "extra"; ajuda?: string };

const LINHAS: Linha[] = [
  { rotulo: "Receita bruta", valor: (d) => d.receita_bruta, tipo: "receita", ajuda: "Vendas do PDV e catálogo (com o frete cobrado) e pedidos dos marketplaces." },
  { rotulo: "Descontos e cupons", valor: (d) => d.descontos, tipo: "deducao" },
  { rotulo: "Devoluções", valor: (d) => d.devolucoes, tipo: "deducao" },
  { rotulo: "Receita líquida", valor: (d) => d.receita_bruta - d.descontos - d.devolucoes, tipo: "total" },
  { rotulo: "Impostos", valor: (d) => d.impostos, tipo: "deducao" },
  { rotulo: "Taxas dos marketplaces", valor: (d) => d.taxas_marketplace, tipo: "deducao", ajuda: "Comissão, taxa de serviço e de transação." },
  { rotulo: "Maquininha", valor: (d) => d.taxa_maquininha, tipo: "deducao" },
  { rotulo: "Frete pago por você", valor: (d) => d.frete, tipo: "deducao" },
  { rotulo: "Custo das mercadorias", valor: (d) => d.cmv, tipo: "deducao" },
  {
    rotulo: "Lucro bruto",
    valor: (d) => d.receita_bruta - d.descontos - d.devolucoes - d.impostos - d.taxas_marketplace - d.taxa_maquininha - d.frete - d.cmv,
    tipo: "total",
  },
  { rotulo: "Anúncios", valor: (d) => d.anuncios, tipo: "deducao", ajuda: "Gasto importado do Shopee Ads ou lançado à mão, rateado pelos dias do mês." },
  { rotulo: "Despesas", valor: (d) => d.despesas, tipo: "deducao", ajuda: "Despesas fixas, saídas avulsas e contas a pagar que não são compra de mercadoria." },
  { rotulo: "Juros e multa recebidos", valor: (d) => d.outras_receitas, tipo: "extra" },
  { rotulo: "Lucro líquido", valor: (d) => d.lucro_liquido, tipo: "total" },
];

/** Financeiro → Resultado: o resultado do mês (DRE gerencial) e o gasto com anúncios. */
export function AbaResultado({
  dre,
  gastos,
  lojas,
  anunciosOk,
}: {
  dre: LinhaDre[];
  gastos: GastoAnuncio[];
  lojas: { id: string; nome: string; canal: string }[];
  anunciosOk: boolean;
}) {
  const [mesSel, setMesSel] = useState(dre.at(-1)?.mes ?? "");
  const [importando, setImportando] = useState(false);
  const [lancando, setLancando] = useState(false);
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  if (!anunciosOk) {
    return (
      <Card className="text-sm text-text-secondary">
        O resultado do mês, o gasto com anúncios e os repasses precisam da migração <span className="font-mono">0066_dre_anuncios_repasses.sql</span>. Aplique no Supabase e recarregue.
      </Card>
    );
  }

  const i = Math.max(0, dre.findIndex((d) => d.mes === mesSel));
  const atual = dre[i];
  const anterior = i > 0 ? dre[i - 1] : null;
  const receitaLiquida = atual ? atual.receita_bruta - atual.descontos - atual.devolucoes : 0;
  const maiorAbs = Math.max(1, ...dre.map((d) => Math.abs(d.lucro_liquido)));

  async function remover(g: GastoAnuncio) {
    const ok = await confirm({ title: "Apagar este gasto?", message: `${g.campanha || g.canal}: ${formatBRL(g.valor)} (${formatarDataIso(g.periodo_inicio)} a ${formatarDataIso(g.periodo_fim)}).`, confirmLabel: "Apagar" });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerGastoAnuncio(g.id), { sucesso: "Gasto apagado", erro: "Erro ao apagar" });
    });
  }

  return (
    <div className="space-y-5">
      {atual ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Card padding="nenhum" className="overflow-hidden lg:col-span-2">
            <div className="px-5 pt-5 pb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-text-primary">Resultado de {nomeMes(atual.mes)}</h2>
                <p className="text-xs text-text-tertiary">
                  {atual.pedidos} pedido(s){atual.pedidos > 0 ? ` · ticket médio ${formatBRL(receitaLiquida / atual.pedidos)}` : ""}
                  {anterior ? ` · comparado com ${nomeMes(anterior.mes)}` : ""}
                </p>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {dre.map((d) => (
                  <Chip key={d.mes} ativo={d.mes === atual.mes} onClick={() => setMesSel(d.mes)}>
                    {new Date(`${d.mes.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { month: "short" })}
                  </Chip>
                ))}
              </div>
            </div>
            <Table>
              <Thead>
                <tr>
                  <Th>Linha</Th>
                  <Th align="right">Valor</Th>
                  <Th align="right">% da receita líquida</Th>
                  {anterior && <Th align="right">Mês anterior</Th>}
                </tr>
              </Thead>
              <tbody>
                {LINHAS.map((l) => {
                  const v = l.valor(atual);
                  const total = l.tipo === "total";
                  const sinal = l.tipo === "deducao" ? "−" : l.tipo === "extra" ? "+" : "";
                  if ((l.tipo === "deducao" || l.tipo === "extra") && v === 0 && (!anterior || l.valor(anterior) === 0)) return null;
                  const cor = total ? (v < 0 ? "text-negative" : "text-text-primary") : l.tipo === "deducao" ? "text-text-secondary" : "text-text-primary";
                  return (
                    <Tr key={l.rotulo}>
                      <Td className={total ? "font-semibold text-text-primary" : "pl-8 text-text-secondary"}>
                        <span title={l.ajuda}>{l.rotulo}</span>
                      </Td>
                      <Td align="right" mono className={`${cor} ${total ? "font-semibold" : ""}`}>
                        {sinal}
                        {formatBRL(Math.abs(v))}
                        {total && v < 0 && " (prejuízo)"}
                      </Td>
                      <Td align="right" mono className="text-text-tertiary">
                        {receitaLiquida > 0 ? `${((v / receitaLiquida) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—"}
                      </Td>
                      {anterior && (
                        <Td align="right" mono className="text-text-tertiary">
                          {formatBRL(l.valor(anterior))}
                        </Td>
                      )}
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <p className="px-5 py-3 text-xs text-text-tertiary border-t border-border">
              Compra de mercadoria não entra como despesa: o custo entra quando o produto é vendido (custo das mercadorias). Venda cancelada e pedido devolvido ficam de fora.
            </p>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-text-primary mb-1">Lucro líquido por mês</h3>
            <p className="text-xs text-text-tertiary mb-4">Últimos {dre.length} meses</p>
            <ul className="space-y-2.5">
              {dre.map((d) => (
                <li key={d.mes}>
                  <button type="button" onClick={() => setMesSel(d.mes)} className="w-full text-left">
                    <div className="flex justify-between text-xs mb-1">
                      <span className={d.mes === atual.mes ? "text-text-primary font-medium" : "text-text-secondary"}>{nomeMes(d.mes)}</span>
                      <span className={`font-mono ${d.lucro_liquido < 0 ? "text-negative" : "text-text-primary"}`}>{formatBRL(d.lucro_liquido)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className={`h-full ${d.lucro_liquido < 0 ? "bg-negative" : "bg-positive"}`} style={{ width: `${(Math.abs(d.lucro_liquido) / maiorAbs) * 100}%` }} />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState icon={Megaphone} title="Sem movimento ainda" description="Assim que houver vendas, o resultado de cada mês aparece aqui." />
        </Card>
      )}

      <Card padding="nenhum" className="overflow-hidden">
        <div className="px-5 pt-5 pb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Gasto com anúncios</h2>
            <p className="text-xs text-text-tertiary">Entra no resultado e no Radar da Vixe (por produto, quando o SKU bate com o cadastro).</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" onClick={() => setLancando(true)}>
              <Plus size={14} /> Lançar gasto
            </Button>
            <Button variant="primary" onClick={() => setImportando(true)}>
              <Upload size={14} /> Importar Shopee Ads
            </Button>
          </div>
        </div>
        {gastos.length === 0 ? (
          <EmptyState icon={Megaphone} title="Nenhum gasto lançado" description="Exporte o relatório de anúncios no Shopee Ads (Relatórios → Exportar) e importe aqui, ou lance o gasto de outra plataforma à mão." />
        ) : (
          <Table>
            <Thead>
              <tr>
                <Th>Período</Th>
                <Th>Canal</Th>
                <Th>Anúncio</Th>
                <Th align="right">Gasto</Th>
                <Th align="right">Vendas atribuídas</Th>
                <Th align="right">ROAS</Th>
                <Th align="right"></Th>
              </tr>
            </Thead>
            <tbody>
              {gastos.map((g) => (
                <Tr key={g.id}>
                  <Td mono className="whitespace-nowrap">
                    {formatarDataIso(g.periodo_inicio)} – {formatarDataIso(g.periodo_fim)}
                  </Td>
                  <Td>{g.canal}</Td>
                  <Td>{g.campanha || "—"}</Td>
                  <Td align="right" mono className="text-negative">
                    {formatBRL(g.valor)}
                  </Td>
                  <Td align="right" mono>
                    {g.vendas != null ? formatBRL(g.vendas) : "—"}
                  </Td>
                  <Td align="right" mono>
                    {g.vendas != null && g.valor > 0 ? (g.vendas / g.valor).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}
                  </Td>
                  <Td align="right">
                    <button type="button" onClick={() => remover(g)} className="text-text-tertiary hover:text-negative" aria-label="Apagar gasto">
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {importando && <ImportarAnunciosModal lojas={lojas} onClose={() => setImportando(false)} />}
      {lancando && <LancarAnuncioModal lojas={lojas} onClose={() => setLancando(false)} />}
      {ConfirmDialog}
    </div>
  );
}

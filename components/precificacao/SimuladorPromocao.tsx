"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, BadgePercent, TicketPercent } from "lucide-react";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/Modal";
import { formatBRL, numeroOuNulo } from "@/lib/format";
import { descontoMaximo, ROTULO_SITUACAO_PROMO, simularPromocao, type SituacaoPromocao } from "@/lib/promocao";
import type { LojaOpcao, PrecificacaoHist, ProdutoOpcao } from "@/lib/precificacao-tipos";

const TOM: Record<SituacaoPromocao, string> = {
  prejuizo: "bg-negative-soft text-negative",
  perde: "bg-accent-soft text-accent",
  empata: "bg-surface-2 text-text-secondary",
  ganha: "bg-positive-soft text-positive",
};

const num = (t: string) => numeroOuNulo(t.replace(",", ".")) ?? 0;
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Simulador de promoção (Fase 5): escolhe uma precificação salva, aplica desconto, cupom e a
 * comissão extra da campanha, e mostra se compensa e quanto precisa vender a mais. A conta
 * mora em `lib/promocao.ts`; o custo é o de hoje do produto (o mesmo do Raio-X).
 */
export function SimuladorPromocao({ historico, lojas, produtos }: { historico: PrecificacaoHist[]; lojas: LojaOpcao[]; produtos: ProdutoOpcao[] }) {
  // Uma opção por anúncio (produto + loja): a precificação mais recente de cada um.
  const opcoes = useMemo(() => {
    const vistos = new Set<string>();
    return historico.filter((h) => {
      const chave = `${h.produto_id ?? h.produto_nome}:${h.loja_id ?? h.canal ?? ""}`;
      if (vistos.has(chave) || !(Number(h.preco_calculado) > 0)) return false;
      vistos.add(chave);
      return true;
    });
  }, [historico]);
  const custoAtual = useMemo(() => new Map(produtos.map((p) => [p.id, Number(p.custo)])), [produtos]);

  const [id, setId] = useState(opcoes[0]?.id ?? "");
  const [desconto, setDesconto] = useState("10");
  const [cupom, setCupom] = useState("");
  const [extra, setExtra] = useState("");
  const [vendas, setVendas] = useState("30");
  const [aumento, setAumento] = useState("30");

  const h = opcoes.find((o) => o.id === id) ?? null;
  if (!h)
    return (
      <Card>
        <EmptyState
          icon={BadgePercent}
          title="Nenhuma precificação salva ainda"
          description="Salve a precificação de um anúncio na aba Individual para simular promoções em cima dela."
        />
      </Card>
    );

  const loja = lojas.find((l) => l.id === h.loja_id) ?? null;
  const faixas = loja?.tipoTaxa === "faixas" ? loja.faixas : [];
  const custo = (h.produto_id && custoAtual.get(h.produto_id)) || Number(h.custo);
  const entrada = {
    preco: Number(h.preco_calculado),
    custo,
    taxas: {
      impostoPct: Number(h.imposto_pct),
      taxaFixa: Number(h.taxa_fixa),
      taxaVariavelPct: Number(h.taxa_variavel_pct),
      taxaAdicionalPct: Number(h.taxa_adicional_pct),
      taxaExtraValor: h.taxa_extra_valor ?? undefined,
      taxaExtraTipo: h.taxa_extra_tipo,
    },
    faixas,
    descontoPct: num(desconto),
    cupom: num(cupom),
    comissaoExtraPct: num(extra),
    vendasMes: num(vendas),
    aumentoPct: num(aumento),
  };
  const r = simularPromocao(entrada);
  const maxSemPrejuizo = descontoMaximo(entrada);
  const maxCom10 = descontoMaximo(entrada, 0.1);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
      <Card>
        <FormField label="Anúncio">
          <select className={inputClass} value={id} onChange={(e) => setId(e.target.value)}>
            {opcoes.map((o) => {
              const l = lojas.find((x) => x.id === o.loja_id);
              return (
                <option key={o.id} value={o.id}>
                  {(o.titulo_anuncio?.trim() || o.produto_nome).slice(0, 60)} · {l ? `${l.canalNome} ${l.nome}` : o.canal || "sem loja"} ·{" "}
                  {formatBRL(Number(o.preco_calculado))}
                </option>
              );
            })}
          </select>
        </FormField>
        <p className="text-xs text-text-tertiary -mt-2 mb-4">
          Preço {formatBRL(entrada.preco)} · custo de hoje {formatBRL(custo)}
          {faixas.length ? " · comissão por faixa de preço" : ""}
        </p>
        <div className="grid grid-cols-2 gap-x-3">
          <FormField label="Desconto (%)">
            <input className={inputClass} inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} />
          </FormField>
          <FormField label="Cupom seu (R$)" dica="Bancado por você, por venda.">
            <input className={inputClass} inputMode="decimal" value={cupom} onChange={(e) => setCupom(e.target.value)} placeholder="0,00" />
          </FormField>
          <FormField label="Comissão extra (%)" dica="Ex.: campanha da Shopee.">
            <input className={inputClass} inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" />
          </FormField>
          <FormField label="Vendas por mês hoje">
            <input className={inputClass} inputMode="numeric" value={vendas} onChange={(e) => setVendas(e.target.value)} />
          </FormField>
          <FormField label="Aumento esperado (%)" dica="Quanto a mais você acha que vende.">
            <input className={inputClass} inputMode="decimal" value={aumento} onChange={(e) => setAumento(e.target.value)} />
          </FormField>
        </div>
        <div className="mt-2 rounded-md bg-surface-2 px-3 py-2 text-xs text-text-secondary">
          <TicketPercent size={13} className="inline mr-1 text-accent" aria-hidden />
          Desconto máximo sem prejuízo: <strong className="text-text-primary">{maxSemPrejuizo}%</strong>
          {maxCom10 > 0 && (
            <>
              {" "}
              · mantendo 10% de margem: <strong className="text-text-primary">{maxCom10}%</strong>
            </>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <CardEyebrow>Preço na promoção</CardEyebrow>
            <div className="font-mono text-3xl font-semibold tracking-tight text-text-primary">{formatBRL(r.precoPromo)}</div>
            {r.precoCliente !== r.precoPromo && <div className="text-sm text-text-secondary mt-1">Cliente paga {formatBRL(r.precoCliente)} com o cupom</div>}
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${TOM[r.situacao]}`}>{ROTULO_SITUACAO_PROMO[r.situacao]}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-text-tertiary">
                <th className="text-left font-medium py-1.5" />
                <th className="text-right font-medium py-1.5">Hoje</th>
                <th className="text-right font-medium py-1.5">Na promoção</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <Linha rotulo="Lucro por venda" hoje={r.atual.lucroLiquido} promo={r.lucroPromo} />
              <tr>
                <td className="py-2 text-text-secondary">Margem</td>
                <td className="py-2 text-right font-mono">{pct(r.atual.margemEfetivaPct)}</td>
                <td className="py-2 text-right font-mono">{r.precoPromo > 0 ? pct(r.lucroPromo / r.precoPromo) : "—"}</td>
              </tr>
              <tr>
                <td className="py-2 text-text-secondary">Vendas no mês</td>
                <td className="py-2 text-right font-mono">{entrada.vendasMes.toLocaleString("pt-BR")}</td>
                <td className="py-2 text-right font-mono">{r.vendasMesPromo.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
              </tr>
              <Linha rotulo="Lucro no mês" hoje={r.lucroMesAtual} promo={r.lucroMesPromo} forte />
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-lg border border-border bg-surface-2 p-3 text-sm">
          {r.vendasParaEmpatar === null ? (
            <p className="text-negative">Com esse desconto cada venda dá prejuízo: vender mais só aumenta a perda.</p>
          ) : r.aumentoParaEmpatarPct === null ? (
            <p className="text-text-secondary">Informe as vendas por mês de hoje para saber quanto precisa vender a mais.</p>
          ) : (
            <p className="text-text-secondary">
              Para lucrar o mesmo que hoje, precisa vender <strong className="text-text-primary">{r.vendasParaEmpatar.toLocaleString("pt-BR")} por mês</strong>
              {r.aumentoParaEmpatarPct > 0 ? (
                <>
                  , <strong className="text-text-primary">{r.aumentoParaEmpatarPct.toLocaleString("pt-BR")}% a mais</strong> que hoje.
                </>
              ) : (
                "."
              )}
            </p>
          )}
          {r.mudouFaixa && (
            <p className="mt-2 flex items-start gap-1.5 text-text-secondary">
              <AlertTriangle size={14} className="text-accent shrink-0 mt-0.5" aria-hidden />O desconto muda a faixa de comissão do canal: a conta já usa a
              comissão da faixa nova.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

function Linha({ rotulo, hoje, promo, forte = false }: { rotulo: string; hoje: number; promo: number; forte?: boolean }) {
  const cor = (v: number) => (v < 0 ? "text-negative" : "text-text-primary");
  return (
    <tr className={forte ? "font-semibold" : ""}>
      <td className="py-2 text-text-secondary">{rotulo}</td>
      <td className={`py-2 text-right font-mono ${cor(hoje)}`}>{formatBRL(hoje)}</td>
      <td className={`py-2 text-right font-mono ${cor(promo)}`}>{formatBRL(promo)}</td>
    </tr>
  );
}

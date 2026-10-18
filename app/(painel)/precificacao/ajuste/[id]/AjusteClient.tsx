"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lightbulb, TicketPercent } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardEyebrow, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { ReguaPreco } from "@/components/precificacao/ReguaPreco";
import { calcularAjuste, contextoDoAjuste, estrategiasDeAjuste, noPreco, type EntradaAjuste } from "@/lib/ajuste-preco";
import { descontoMaximo, simularPromocao } from "@/lib/promocao";
import { classeValor, formatBRL } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import type { LojaParaPreco } from "@/lib/precos-loja";
import { salvarPrecoLoja } from "../../actions";

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Ajuste de Preço (esqueleto da fase 5): arrastar ou digitar o preço e ver na hora lucro,
 * margem e faixa; mínimo, ideal e máximo de referência; estratégias por regra; simulador de
 * promoção. "Usar este preço" grava o preço NA LOJA (0101) — não mexe na Shopee.
 */
export function AjusteClient({
  produto,
  lojas,
  loja,
  precoAtual,
  origemPrecoAtual,
  impostoPct,
  margemAlvoInicial,
  concorrentes,
  migracao0101,
}: {
  produto: { id: string; nome: string; sku: string | null; custo: number; imagemUrl: string | null };
  lojas: { id: string; rotulo: string }[];
  loja: LojaParaPreco | null;
  precoAtual: number | null;
  origemPrecoAtual: "loja" | "cadastro";
  impostoPct: number;
  margemAlvoInicial: number;
  concorrentes: number[];
  migracao0101: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [margemAlvo, setMargemAlvo] = useState(Math.round(margemAlvoInicial * 1000) / 10);
  const [desconto, setDesconto] = useState(10);

  const entrada: EntradaAjuste | null = loja ? { custo: produto.custo, loja, impostoPct, margemAlvo: margemAlvo / 100, precoAtual, concorrentes, vendas30d: 0 } : null;
  const ajuste = useMemo(() => (entrada ? calcularAjuste(entrada) : null), [entrada?.custo, entrada?.margemAlvo, loja, precoAtual]); // eslint-disable-line react-hooks/exhaustive-deps
  const [preco, setPreco] = useState<number>(() => precoAtual ?? ajuste?.precoIdeal ?? 0);

  if (!loja || !entrada || !ajuste) {
    return (
      <Card>
        <EmptyState icon={TicketPercent} title="Nenhuma loja cadastrada" description="Cadastre uma loja em Configurações › Canais para ajustar o preço por loja." />
      </Card>
    );
  }
  if (!(produto.custo > 0)) {
    return (
      <Card>
        <EmptyState icon={TicketPercent} title="Produto sem custo" description="Preencha o custo do produto em Produtos: sem ele não dá para calcular lucro." />
      </Card>
    );
  }

  const agora = noPreco(entrada, preco);
  const estrategias = estrategiasDeAjuste(entrada, ajuste, preco);
  const ctx = contextoDoAjuste(entrada);
  const promoBase = { preco, custo: produto.custo, taxas: ctx.taxas, faixas: ctx.faixas, cupom: 0, comissaoExtraPct: 0 };
  const promo = simularPromocao({ ...promoBase, descontoPct: desconto, vendasMes: 0, aumentoPct: 0 });
  const maxDesconto = descontoMaximo(promoBase);

  async function aplicar() {
    const ok = await confirm({
      title: "Usar este preço na loja?",
      message: `${produto.nome} passa a valer ${formatBRL(preco)} em ${loja!.canalNome} · ${loja!.nome} (lucro de ${formatBRL(agora.resultado.lucroLiquido)} por venda). O preço na Shopee NÃO muda: copie e altere lá.`,
      confirmLabel: "Usar este preço",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(salvarPrecoLoja({ produto_id: produto.id, loja_id: loja!.id, preco }), { sucesso: "Preço da loja atualizado", erro: "Não foi possível gravar o preço." });
      if (r.ok) router.refresh();
    });
  }

  const cartoes = [
    { rotulo: "Mínimo (lucro zero)", valor: ajuste.precoMinimo, dica: "Abaixo disso, prejuízo" },
    { rotulo: "Ideal", valor: ajuste.precoIdeal, dica: `Margem de ${margemAlvo.toLocaleString("pt-BR")}%` },
    { rotulo: "Máximo (referência)", valor: ajuste.precoMaximo, dica: ajuste.motivoMaximo ?? "" },
  ];

  return (
    <>
      <Link href={`/precificacao?produto=${produto.id}&loja=${loja.id}`} className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} aria-hidden /> Precificação
      </Link>
      <PageHeader
        eyebrow="Ajuste de Preço"
        title={produto.nome}
        descricao={`Custo de hoje ${formatBRL(produto.custo)} · ${precoAtual ? `preço atual ${formatBRL(precoAtual)} (${origemPrecoAtual === "loja" ? "da loja" : "do cadastro"})` : "sem preço atual"}`}
        actions={
          <select aria-label="Loja" className={`${inputClass} w-auto min-w-[14rem]`} value={loja.id} onChange={(e) => router.replace(`/precificacao/ajuste/novo?produto=${produto.id}&loja=${e.target.value}`)}>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.rotulo}
              </option>
            ))}
          </select>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <div>
                <CardEyebrow>Preço na régua</CardEyebrow>
                <div key={preco} className="destaque-valor rounded-md -mx-1 px-1 font-mono text-4xl font-semibold tracking-tight text-text-primary">
                  {formatBRL(preco)}
                </div>
              </div>
              <div className="w-36">
                <FormField label="Digitar o preço">
                  <CampoNumero value={preco} onChange={setPreco} min={0} casas={2} />
                </FormField>
              </div>
            </div>
            <ReguaPreco
              escala={ajuste.escala}
              faixas={ajuste.faixas}
              zonasMortas={ajuste.zonasMortas}
              valor={preco}
              onMudar={setPreco}
              marcadores={[
                ...(ajuste.precoMinimo ? [{ preco: ajuste.precoMinimo, rotulo: "mín.", tom: "minimo" as const }] : []),
                ...(ajuste.precoIdeal ? [{ preco: ajuste.precoIdeal, rotulo: "ideal", tom: "ideal" as const }] : []),
                ...(precoAtual ? [{ preco: precoAtual, rotulo: "atual", tom: "atual" as const }] : []),
                ...(ajuste.precoMaximo ? [{ preco: ajuste.precoMaximo, rotulo: "máx.", tom: "maximo" as const }] : []),
              ]}
            />
            <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Numero rotulo="Lucro por venda" valor={formatBRL(agora.resultado.lucroLiquido)} classe={classeValor(agora.resultado.lucroLiquido)} />
              <Numero rotulo="Margem" valor={pct(agora.resultado.margemEfetivaPct)} />
              <Numero rotulo="Comissão" valor={agora.faixa ? `${agora.faixa.comissaoPct}% + ${formatBRL(agora.faixa.tarifaFixa)}` : `${loja.comissaoPct}% + ${formatBRL(loja.taxaFixa)}`} />
              <Numero rotulo="Por mês" valor={agora.porMes !== null ? formatBRL(agora.porMes) : "—"} dica="Com as vendas de 30 dias (fase 6)" />
            </dl>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {cartoes.map((c) => (
              <Card key={c.rotulo}>
                <CardEyebrow>{c.rotulo}</CardEyebrow>
                <div className="mt-1 font-mono text-xl font-semibold text-text-primary">{c.valor !== null ? formatBRL(c.valor) : "—"}</div>
                <p className="text-xs text-text-tertiary mt-0.5 min-h-8">{c.dica}</p>
                {c.valor !== null && (
                  <Button size="sm" variant="ghost" className="mt-1 -ml-2" onClick={() => setPreco(c.valor!)}>
                    Pôr na régua
                  </Button>
                )}
              </Card>
            ))}
          </div>

          <Card>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb size={16} className="text-accent" aria-hidden /> Estratégias
            </CardTitle>
            {estrategias.length ? (
              <ul className="mt-3 space-y-2">
                {estrategias.map((s) => (
                  <li key={s.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">{s.titulo}</p>
                        <p className="text-xs text-text-secondary">{s.detalhe}</p>
                      </div>
                      {s.preco !== null && (
                        <Button size="sm" variant="secondary" onClick={() => setPreco(s.preco!)}>
                          Testar {formatBRL(s.preco)}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">Neste preço não há nada a corrigir pelas regras. A explicação da IA entra na fase 6.</p>
            )}
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20">
          <Card>
            <CardTitle>Usar este preço</CardTitle>
            <p className="mt-1 text-xs text-text-secondary">Grava em {loja.canalNome} · {loja.nome}. Não altera o preço na Shopee.</p>
            <FormField label="Margem alvo do ideal (%)">
              <CampoNumero value={margemAlvo} onChange={setMargemAlvo} min={0} max={90} />
            </FormField>
            <Button variant="primary" className="w-full" onClick={aplicar} loading={pending} disabled={!migracao0101 || preco <= 0}>
              Usar {formatBRL(preco)} nesta loja
            </Button>
            {!migracao0101 && <p className="mt-1.5 text-xs text-text-tertiary">Precisa da migração 0101.</p>}
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-text-secondary">Copiar o preço</span>
              <BotaoCopiar texto={preco.toFixed(2).replace(".", ",")} rotulo="preço" />
            </div>
          </Card>

          <Card>
            <CardTitle className="flex items-center gap-2">
              <TicketPercent size={16} className="text-accent" aria-hidden /> Promoção
            </CardTitle>
            <FormField label="Desconto (%)">
              <CampoNumero value={desconto} onChange={setDesconto} min={0} max={90} />
            </FormField>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Numero rotulo="Preço na promoção" valor={formatBRL(promo.precoPromo)} />
              <Numero rotulo="Lucro na promoção" valor={formatBRL(promo.lucroPromo)} classe={classeValor(promo.lucroPromo)} />
            </dl>
            <p className="mt-3 text-xs text-text-secondary">
              Desconto máximo antes do prejuízo: <strong className="text-text-primary">{maxDesconto}%</strong>
              {promo.mudouFaixa ? " · o desconto muda a faixa de comissão" : ""}
            </p>
          </Card>
        </div>
      </div>
      {ConfirmDialog}
    </>
  );
}

function Numero({ rotulo, valor, classe = "text-text-primary", dica }: { rotulo: string; valor: string; classe?: string; dica?: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-1 px-3 py-2">
      <dt className="text-xs text-text-tertiary">{rotulo}</dt>
      <dd className={`font-mono ${classe}`}>{valor}</dd>
      {dica && <dd className="text-xs text-text-tertiary">{dica}</dd>}
    </div>
  );
}

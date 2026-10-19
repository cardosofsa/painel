"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Lightbulb, Sparkles, TicketPercent } from "lucide-react";
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
import { ROTULO_TENDENCIA } from "@/lib/demanda";
import { classeValor, formatBRL } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import type { DadosAjuste } from "@/lib/ajuste-servidor";
import type { DiagnosticoPreco } from "@/lib/ia/prompts-preco";
import { explicarAjusteIA, salvarPrecoLoja } from "../../actions";
import { rotuloTaxaFaixa } from "@/lib/faixas";

const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const ORIGEM: Record<DadosAjuste["origemPrecoAtual"], string> = { anuncio: "no ar na Shopee", loja: "da loja", cadastro: "do cadastro" };

/**
 * Ajuste de Preço: arrastar ou digitar o preço e ver na hora lucro, margem, faixa e o lucro
 * no mês (com as vendas de 30 dias, somadas no banco); mínimo, ideal e máximo de referência;
 * estratégias por regra (a IA só explica e prioriza); simulador de promoção. "Usar este
 * preço" grava NA LOJA (0101) — o preço na Shopee não muda.
 */
export function AjusteClient({ dados, alvo, iaDisponivel }: { dados: DadosAjuste; alvo: { anuncioId: string } | { produtoId: string; lojaId: string | null }; iaDisponivel: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pedindoIA, startIA] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const { produto, loja } = dados;
  const [margemAlvo, setMargemAlvo] = useState(Math.round(dados.margemAlvo * 1000) / 10);
  const [desconto, setDesconto] = useState(10);
  const [explicacao, setExplicacao] = useState<{ preco: number; diagnostico: DiagnosticoPreco; rodape: string } | null>(null);

  const entrada: EntradaAjuste | null = loja
    ? {
        custo: produto.custo,
        loja,
        impostoPct: dados.impostoPct,
        margemAlvo: margemAlvo / 100,
        precoAtual: dados.precoAtual,
        concorrentes: dados.concorrentes,
        vendas30d: dados.vendas?.d30.unidades ?? 0,
        estoque: produto.estoque,
        tendencia: dados.tendencia,
        vendaPorDia: dados.vendaPorDia,
        kits: dados.kits,
      }
    : null;
  const ajuste = useMemo(() => (entrada ? calcularAjuste(entrada) : null), [margemAlvo, loja]); // eslint-disable-line react-hooks/exhaustive-deps
  const [preco, setPreco] = useState<number>(() => dados.precoAtual ?? ajuste?.precoIdeal ?? 0);

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
  const hoje = dados.precoAtual ? noPreco(entrada, dados.precoAtual) : null;
  const estrategias = estrategiasDeAjuste(entrada, ajuste, preco);
  const ctx = contextoDoAjuste(entrada);
  const promoBase = { preco, custo: produto.custo, taxas: ctx.taxas, faixas: ctx.faixas, cupom: 0, comissaoExtraPct: 0 };
  const promo = simularPromocao({ ...promoBase, descontoPct: desconto, vendasMes: 0, aumentoPct: 0 });
  const maxDesconto = descontoMaximo(promoBase);
  const v30 = dados.vendas?.d30;
  const idealLucro = ajuste.precoIdeal ? noPreco(entrada, ajuste.precoIdeal).resultado.lucroLiquido : null;
  const perdaMes = hoje && idealLucro !== null && v30 && v30.unidades > 0 ? Math.round((idealLucro - hoje.resultado.lucroLiquido) * v30.unidades * 100) / 100 : null;

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

  function explicar() {
    const ids = "anuncioId" in alvo ? { anuncio_id: alvo.anuncioId } : { produto_id: produto.id, loja_id: loja!.id };
    const p = preco;
    startIA(async () => {
      const r = await executarComToast(explicarAjusteIA({ ...ids, preco: p, objetivo: dados.tendencia === "caindo" ? "volume" : "margem" }), { erro: "Não foi possível falar com a IA agora." });
      if (r.ok) setExplicacao({ preco: p, diagnostico: r.dado.diagnostico, rodape: r.dado.doCache ? "Resposta guardada (não gastou cota)." : r.dado.origem === "propria" ? "Sua IA." : `${r.dado.usadas} de ${r.dado.limite} hoje.` });
    });
  }

  const cartoes = [
    { rotulo: "Mínimo", valor: ajuste.precoMinimo, dica: "Lucro zero: abaixo disso, prejuízo" },
    { rotulo: "Ideal", valor: ajuste.precoIdeal, dica: `Margem de ${margemAlvo.toLocaleString("pt-BR")}%` },
    { rotulo: "Máximo", valor: ajuste.precoMaximo, dica: ajuste.motivoMaximo ? `Referência: ${ajuste.motivoMaximo}` : "" },
  ];

  return (
    <>
      <Link href={`/precificacao?produto=${produto.id}&loja=${loja.id}`} className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} aria-hidden /> Precificação
      </Link>
      <PageHeader
        eyebrow="Ajuste de Preço"
        title={dados.anuncio?.nome || produto.nome}
        descricao={
          <>
            Custo de hoje {formatBRL(produto.custo)} · {dados.precoAtual ? `preço atual ${formatBRL(dados.precoAtual)} (${ORIGEM[dados.origemPrecoAtual]})` : "sem preço atual"}
            {dados.anuncio?.link && (
              <>
                {" · "}
                <a href={dados.anuncio.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-1">
                  ver anúncio <ExternalLink size={12} aria-hidden />
                </a>
              </>
            )}
          </>
        }
        actions={
          "anuncioId" in alvo ? (
            <span className="text-sm text-text-secondary">
              {loja.canalNome} · {loja.nome}
            </span>
          ) : (
            <select aria-label="Loja" className={`${inputClass} w-auto min-w-[14rem]`} value={loja.id} onChange={(e) => router.replace(`/precificacao/ajuste/novo?produto=${produto.id}&loja=${e.target.value}`)}>
              {dados.lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.rotulo}
                </option>
              ))}
            </select>
          )
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
                ...(dados.precoAtual ? [{ preco: dados.precoAtual, rotulo: "atual", tom: "atual" as const }] : []),
                ...(ajuste.precoMaximo ? [{ preco: ajuste.precoMaximo, rotulo: "máx.", tom: "maximo" as const }] : []),
              ]}
            />
            <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Numero rotulo="Lucro por venda" valor={formatBRL(agora.resultado.lucroLiquido)} classe={classeValor(agora.resultado.lucroLiquido)} />
              <Numero rotulo="Margem" valor={pct(agora.resultado.margemEfetivaPct)} />
              <Numero rotulo="Comissão" valor={agora.faixa ? rotuloTaxaFaixa(agora.faixa) : `${loja.comissaoPct}% + ${formatBRL(loja.taxaFixa)}`} />
              <Numero rotulo="Lucro no mês" valor={agora.porMes !== null ? formatBRL(agora.porMes) : "—"} classe={agora.porMes !== null ? classeValor(agora.porMes) : undefined} dica={v30 ? `${v30.unidades} vendas em 30 dias` : "Sem vendas registradas"} />
            </dl>
          </Card>

          <Card padding="nenhum">
            <dl className="grid grid-cols-3 divide-x divide-border">
              {cartoes.map((c) => (
                <div key={c.rotulo} className="p-3 sm:p-4 min-w-0">
                  <dt className="text-xs text-text-tertiary">{c.rotulo}</dt>
                  <dd className="mt-0.5 font-mono text-base sm:text-xl font-semibold text-text-primary">{c.valor !== null ? formatBRL(c.valor) : "—"}</dd>
                  <dd className="hidden sm:block text-xs text-text-tertiary mt-0.5 min-h-8">{c.dica}</dd>
                  {c.valor !== null && (
                    <dd>
                      <button type="button" className="mt-1 text-xs text-accent hover:underline" onClick={() => setPreco(c.valor!)}>
                        Pôr na régua
                      </button>
                    </dd>
                  )}
                </div>
              ))}
            </dl>
            <div className="border-t border-border px-4 py-3">
              <label className="flex items-center gap-2 text-xs text-text-secondary">
                O ideal usa a margem alvo de
                <span className="w-20">
                  <CampoNumero value={margemAlvo} onChange={setMargemAlvo} min={0} max={90} aria-label="Margem alvo do ideal (%)" />
                </span>
                %
              </label>
              <p className="mt-1.5 text-xs text-text-tertiary">O máximo é referência, não garantia: não há dado de quanto a venda cai quando o preço sobe.</p>
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Lightbulb size={16} className="text-accent" aria-hidden /> Estratégias
              </CardTitle>
              <Button size="sm" variant="secondary" onClick={explicar} loading={pedindoIA} disabled={!iaDisponivel || pedindoIA}>
                <Sparkles size={14} aria-hidden /> Pedir a explicação da IA
              </Button>
            </div>
            {!iaDisponivel && <p className="mt-1 text-xs text-text-tertiary">Configure uma IA em Configurações para pedir a explicação.</p>}
            {estrategias.length ? (
              <ul className="mt-3 space-y-2">
                {estrategias.map((s) => (
                  <li key={s.id} className="rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-text-primary">{s.titulo}</p>
                        <p className="text-xs text-text-secondary">{s.detalhe}</p>
                      </div>
                      {s.preco !== null ? (
                        <Button size="sm" variant="secondary" onClick={() => setPreco(s.preco!)}>
                          Testar {formatBRL(s.preco)}
                        </Button>
                      ) : (
                        s.id === "kit" && (
                          <Link href="/precificacao?visao=kits" className="text-xs text-accent hover:underline">
                            Abrir Kits
                          </Link>
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">Neste preço não há nada a corrigir pelas regras.</p>
            )}
            {explicacao && (
              <div className="mt-4 rounded-md bg-surface-2 p-3 text-sm">
                <p className="text-xs font-medium text-text-secondary mb-1">
                  Explicação da IA para {formatBRL(explicacao.preco)}
                  {explicacao.preco !== preco ? " (o preço da régua mudou desde então)" : ""}
                </p>
                <p className="text-text-primary">{explicacao.diagnostico.diagnostico}</p>
                {explicacao.diagnostico.estrategias.length > 0 && (
                  <ol className="mt-2 list-decimal pl-5 space-y-1 text-text-secondary">
                    {explicacao.diagnostico.estrategias.map((s) => (
                      <li key={s.titulo}>
                        <strong className="text-text-primary">{s.titulo}:</strong> {s.detalhe}
                      </li>
                    ))}
                  </ol>
                )}
                {explicacao.diagnostico.precoSugerido != null && (
                  <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={() => setPreco(explicacao.diagnostico.precoSugerido!)}>
                    Testar o sugerido: {formatBRL(explicacao.diagnostico.precoSugerido)}
                  </Button>
                )}
                <p className="mt-2 text-xs text-text-tertiary">{explicacao.rodape} A IA comenta os números calculados aqui; ela não inventa preço.</p>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-20">
          <Card>
            <CardTitle>Usar este preço</CardTitle>
            <p className="mt-1 mb-4 text-xs text-text-secondary">Grava em {loja.canalNome} · {loja.nome}. Não altera o preço na Shopee.</p>
            <Button variant="primary" className="w-full" onClick={aplicar} loading={pending} disabled={!dados.migracao0101 || preco <= 0}>
              Usar {formatBRL(preco)} nesta loja
            </Button>
            {!dados.migracao0101 && <p className="mt-1.5 text-xs text-text-tertiary">Precisa da migração 0101.</p>}
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-text-secondary">Copiar o preço</span>
              <BotaoCopiar texto={preco.toFixed(2).replace(".", ",")} rotulo="preço" />
            </div>
          </Card>

          <Card>
            <CardTitle>Situação de hoje</CardTitle>
            {dados.vendas ? (
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Numero rotulo="Vendas em 30 dias" valor={`${dados.vendas.d30.unidades} un.`} dica={`${formatBRL(dados.vendas.d30.receita)} em ${dados.vendas.d30.pedidos} pedidos`} />
                <Numero rotulo="Vendas em 90 dias" valor={`${dados.vendas.d90.unidades} un.`} dica={`preço médio ${formatBRL(dados.vendas.d90.precoMedio)}`} />
                <Numero rotulo="Tendência" valor={ROTULO_TENDENCIA[dados.tendencia]} />
                <Numero rotulo="Estoque" valor={`${produto.estoque} un.`} dica={dados.vendaPorDia > 0 ? `≈ ${Math.round(produto.estoque / dados.vendaPorDia)} dias` : undefined} />
              </dl>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">As vendas por anúncio aparecem depois da migração 0102.</p>
            )}
            {hoje && (
              <p className="mt-3 text-xs text-text-secondary">
                No preço atual: lucro <span className={classeValor(hoje.resultado.lucroLiquido)}>{formatBRL(hoje.resultado.lucroLiquido)}</span> por venda
                {perdaMes !== null && perdaMes > 0.01 ? `, ${formatBRL(perdaMes)} por mês abaixo do ideal` : ""}.
              </p>
            )}
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
    <div className="rounded-md border border-border bg-surface-1 px-3 py-2 min-w-0">
      <dt className="text-xs text-text-tertiary">{rotulo}</dt>
      <dd className={`font-mono ${classe}`}>{valor}</dd>
      {dica && <dd className="text-xs text-text-tertiary">{dica}</dd>}
    </div>
  );
}

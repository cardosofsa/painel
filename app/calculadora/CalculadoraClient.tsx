"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { FormField, inputClass } from "@/components/ui/Modal";
import { formatBRL, numeroOuNulo } from "@/lib/format";
import { formatarFaixaLabel } from "@/lib/pricing";
import {
  calcularMercadoLivre,
  calcularShopee,
  FAIXAS_SHOPEE,
  FONTE_TAXAS_ML,
  FONTE_TAXAS_SHOPEE,
  LINK_CADASTRO_CALCULADORA,
  type ModoCalculadora,
  type ResultadoCanal,
} from "@/lib/calculadora-publica";

const pct = (fracao: number) => `${(fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Calculadora sem login. Tudo roda no navegador, sem Server Action nem Supabase: não há o
 * que gravar, e o cálculo é o mesmo `lib/pricing.ts` do painel.
 */
export function CalculadoraClient() {
  const [custo, setCusto] = useState("");
  const [modo, setModo] = useState<ModoCalculadora>("margem");
  const [margem, setMargem] = useState("20");
  const [preco, setPreco] = useState("");
  const [imposto, setImposto] = useState("");
  const [mlComissao, setMlComissao] = useState("");
  const [mlTaxa, setMlTaxa] = useState("");

  const entrada = useMemo(
    () => ({
      custo: numeroOuNulo(custo),
      modo,
      margemPct: numeroOuNulo(margem),
      preco: numeroOuNulo(preco),
      impostoPct: numeroOuNulo(imposto),
      mlComissaoPct: numeroOuNulo(mlComissao),
      mlTaxaFixa: numeroOuNulo(mlTaxa),
    }),
    [custo, modo, margem, preco, imposto, mlComissao, mlTaxa],
  );
  const shopee = calcularShopee(entrada);
  const ml = calcularMercadoLivre(entrada);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-6 lg:gap-8 items-start">
      <section aria-labelledby="titulo-dados" className="rounded-xl border border-border bg-surface-1 p-5 sm:p-6">
        <h2 id="titulo-dados" className="text-base font-semibold">
          Seu produto
        </h2>
        <div className="mt-4">
          <FormField label="Custo do produto (R$)" dica="Valor pago ao fornecedor, mais embalagem e etiqueta.">
            <input inputMode="decimal" placeholder="Ex.: 30,00" value={custo} onChange={(e) => setCusto(e.target.value)} className={inputClass} />
          </FormField>

          <fieldset className="mb-4">
            <legend className="block text-xs font-medium text-text-secondary mb-1.5">Calcular a partir de</legend>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-1" role="radiogroup">
              {(
                [
                  ["margem", "Margem desejada"],
                  ["preco", "Preço de venda"],
                ] as [ModoCalculadora, string][]
              ).map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={modo === id}
                  onClick={() => setModo(id)}
                  className={`rounded px-3 py-1.5 text-sm font-medium ${modo === id ? "bg-accent text-accent-on" : "text-text-secondary hover:bg-surface-2"}`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </fieldset>

          {modo === "margem" ? (
            <FormField label="Margem de lucro desejada (%)" dica="Quanto sobra do preço, já sem taxas e imposto.">
              <input inputMode="decimal" value={margem} onChange={(e) => setMargem(e.target.value)} className={inputClass} />
            </FormField>
          ) : (
            <FormField label="Preço de venda (R$)" dica="O preço que você pratica ou quer testar.">
              <input inputMode="decimal" placeholder="Ex.: 59,90" value={preco} onChange={(e) => setPreco(e.target.value)} className={inputClass} />
            </FormField>
          )}

          <FormField label="Imposto sobre a venda (%) — opcional" dica="MEI costuma deixar em branco; no Simples, use a alíquota do seu anexo.">
            <input inputMode="decimal" placeholder="Ex.: 6" value={imposto} onChange={(e) => setImposto(e.target.value)} className={inputClass} />
          </FormField>

          <div className="mt-5 pt-4 border-t border-border">
            <h3 className="text-sm font-semibold">Taxas do seu anúncio no Mercado Livre</h3>
            <p className="mt-1 mb-3 text-xs text-text-tertiary leading-relaxed">{FONTE_TAXAS_ML}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
              <FormField label="Comissão (%)">
                <input inputMode="decimal" placeholder="Do seu anúncio" value={mlComissao} onChange={(e) => setMlComissao(e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="Tarifa fixa por venda (R$)">
                <input inputMode="decimal" placeholder="0,00" value={mlTaxa} onChange={(e) => setMlTaxa(e.target.value)} className={inputClass} />
              </FormField>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="titulo-resultado" aria-live="polite">
        <h2 id="titulo-resultado" className="sr-only">
          Resultado
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CartaoResultado r={shopee} modo={modo} />
          <CartaoResultado r={ml} modo={modo} />
        </div>

        <div className="mt-5 rounded-xl bg-marca-fundo text-marca-texto p-5 sm:p-6">
          <p className="font-semibold">Salve e acompanhe o lucro de cada venda: comece grátis</p>
          <p className="mt-1 text-sm text-marca-texto-suave">
            No Sertão, o preço fica salvo por produto e cada pedido da Shopee e do Mercado Livre mostra o lucro real, já sem taxa, frete e imposto.
          </p>
          <Link
            href={LINK_CADASTRO_CALCULADORA}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-marca-texto text-marca-fundo font-medium px-4 py-2 hover:opacity-90"
          >
            Criar conta grátis <ArrowRight size={16} aria-hidden />
          </Link>
        </div>

        <details className="mt-5 rounded-xl border border-border bg-surface-1 p-5 group">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-semibold">
            Faixas de comissão da Shopee usadas no cálculo
            <span className="text-text-tertiary text-xl leading-none transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="mt-2 text-xs text-text-tertiary leading-relaxed">{FONTE_TAXAS_SHOPEE}</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-secondary border-b border-border">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Preço do produto
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium text-right">
                    Comissão
                  </th>
                  <th scope="col" className="py-2 font-medium text-right">
                    Tarifa fixa
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {FAIXAS_SHOPEE.map((f) => (
                  <tr key={f.min}>
                    <td className="py-2 pr-3">{formatarFaixaLabel(f)}</td>
                    <td className="py-2 pr-3 text-right font-mono">{f.comissaoPct}%</td>
                    <td className="py-2 text-right font-mono">{formatBRL(f.tarifaFixa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}

function CartaoResultado({ r, modo }: { r: ResultadoCanal; modo: ModoCalculadora }) {
  const titulo = modo === "margem" ? "Preço sugerido" : "Preço de venda";
  return (
    <div className="rounded-xl border border-border bg-background p-5 shadow-elev-1">
      <p className="text-sm font-semibold">{r.nome}</p>
      {r.falta ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-text-secondary">
          <Info size={16} className="shrink-0 mt-0.5 text-text-tertiary" aria-hidden /> {r.falta}
        </p>
      ) : !r.viavel ? (
        <p className="mt-3 flex items-start gap-2 text-sm text-negative">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden /> Essa margem não fecha com as taxas do canal. Tente uma margem menor.
        </p>
      ) : (
        <>
          <p className="mt-2 text-xs text-text-tertiary">{titulo}</p>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">{formatBRL(r.precoVenda)}</p>
          <dl className="mt-4 space-y-1.5 text-sm">
            <Linha rotulo={`Comissão (${r.comissaoPct.toLocaleString("pt-BR")}%)`} valor={-r.comissaoValor} />
            <Linha rotulo="Taxa fixa" valor={-r.taxaFixa} />
            {r.impostoValor > 0 && <Linha rotulo="Imposto" valor={-r.impostoValor} />}
            <div className="flex justify-between gap-3 border-t border-border pt-2 font-semibold">
              <dt>Lucro</dt>
              <dd className={`font-mono ${r.lucro < 0 ? "text-negative" : "text-positive"}`}>{formatBRL(r.lucro)}</dd>
            </div>
            <div className="flex justify-between gap-3 text-text-secondary">
              <dt>Margem</dt>
              <dd className="font-mono">{pct(r.margem)}</dd>
            </div>
          </dl>
          {r.faixa && <p className="mt-3 text-xs text-text-tertiary">Faixa da Shopee: {r.faixa}</p>}
          {r.zonaMorta && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-negative">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden />
              Zona morta: vendendo a {formatBRL(r.zonaMorta.precoMelhor)} você recebe {formatBRL(r.zonaMorta.ganhoLiquido)} a mais por venda.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex justify-between gap-3 text-text-secondary">
      <dt>{rotulo}</dt>
      <dd className="font-mono">{formatBRL(valor)}</dd>
    </div>
  );
}

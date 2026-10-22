"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Link2, RotateCcw, Store } from "lucide-react";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Button, classesBotao } from "@/components/ui/Button";
import { BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { Chip } from "@/components/ui/Chip";
import { StatusChip } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/Table";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { classeValor, formatBRL } from "@/lib/format";
import type { ItemAnuncio } from "@/lib/anuncio-item-servidor";
import type { SituacaoPrecoLoja } from "@/lib/precos-loja";
import { faixaDePrecos, precoBase, precoPelaRegra, resultadoDaVariacao, textoDosPrecos, type RegraPreco } from "@/lib/reprecificar-anuncio";
import { salvarPrecosPlanejados } from "@/app/(painel)/precificacao/actions";

type TipoRegra = RegraPreco["tipo"];
const REGRAS: { tipo: TipoRegra; rotulo: string }[] = [
  { tipo: "margem", rotulo: "Margem" },
  { tipo: "percentual", rotulo: "% sobre o preço no ar" },
  { tipo: "valor", rotulo: "Mesmo preço" },
];
const SITUACAO: Record<SituacaoPrecoLoja, { rotulo: string; tom: "positive" | "negative" | "neutral" } | null> = {
  ok: null,
  sem_preco: { rotulo: "Sem preço", tom: "neutral" },
  sem_custo: { rotulo: "Sem custo", tom: "neutral" },
  sem_faixas: { rotulo: "Canal sem faixas", tom: "neutral" },
  prejuizo: { rotulo: "Prejuízo", tom: "negative" },
  zona_morta: { rotulo: "Zona morta", tom: "negative" },
};
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const faixaTexto = (f: { min: number; max: number } | null) => (f ? (f.min === f.max ? formatBRL(f.min) : `${formatBRL(f.min)} – ${formatBRL(f.max)}`) : "sem preço lido");

/**
 * O anúncio como aparece na Shopee (capa, título, preço, variações) e, embaixo, todas as
 * variações numa tabela para reprecificar de uma vez: uma regra aplica o preço novo nas
 * marcadas, cada preço ainda pode ser editado à mão, e "Gravar" salva NA LOJA (0101), como o
 * Ajuste de Preço. O preço na Shopee não muda: copie e altere lá.
 */
export function ItemAnuncioClient({ item, anuncioId }: { item: ItemAnuncio; anuncioId: string }) {
  const router = useRouter();
  const [salvando, startSalvar] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const { loja, variacoes } = item;
  const comVariacoes = variacoes.length > 1;

  const inicial = () => Object.fromEntries(variacoes.map((v) => [v.anuncioId, v.produtoId ? (v.precoPlanejado ?? v.precoLoja ?? v.precoNoAr) : null])) as Record<string, number | null>;
  const [novos, setNovos] = useState<Record<string, number | null>>(inicial);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(variacoes.filter((v) => v.produtoId).map((v) => v.anuncioId)));
  const [selecionada, setSelecionada] = useState<string>(() => (variacoes.some((v) => v.anuncioId === anuncioId) ? anuncioId : variacoes[0].anuncioId));
  const [tipo, setTipo] = useState<TipoRegra>("margem");
  const [margem, setMargem] = useState(Math.round(item.margemAlvo * 1000) / 10);
  const [percentual, setPercentual] = useState(10);
  const [valor, setValor] = useState(() => faixaDePrecos(variacoes.map(precoBase))?.max ?? 0);
  const [noventa, setNoventa] = useState(true);

  const atual = variacoes.find((v) => v.anuncioId === selecionada) ?? variacoes[0];
  const faixaNoAr = faixaDePrecos(variacoes.map((v) => v.precoNoAr));
  const ligadas = variacoes.filter((v) => v.produtoId);

  if (!loja) {
    return (
      <Card>
        <EmptyState icon={Store} title="Loja não encontrada" description="A loja deste anúncio não está mais cadastrada em Configurações › Canais." />
      </Card>
    );
  }

  const regra: RegraPreco = tipo === "margem" ? { tipo, margem: margem / 100 } : tipo === "percentual" ? { tipo, pct: percentual / 100 } : { tipo, preco: valor };
  const linhas = variacoes.map((v) => {
    const novo = novos[v.anuncioId] ?? null;
    return { v, novo, calc: resultadoDaVariacao(v, novo, loja, item.impostoPct), hoje: v.precoNoAr ? resultadoDaVariacao(v, v.precoNoAr, loja, item.impostoPct) : null };
  });
  const alteradas = linhas.filter((l) => l.v.produtoId && l.novo !== null && l.novo !== (l.v.precoPlanejado ?? null));
  const todasMarcadas = ligadas.length > 0 && ligadas.every((v) => marcadas.has(v.anuncioId));

  function aplicarRegra() {
    let semCalculo = 0;
    const n = { ...novos };
    for (const v of variacoes) {
      if (!marcadas.has(v.anuncioId)) continue;
      const p = precoPelaRegra(v, regra, loja!, item.impostoPct, noventa);
      if (p === null) semCalculo += 1;
      else n[v.anuncioId] = p;
    }
    setNovos(n);
    if (semCalculo) toast(`${semCalculo} variação(ões) ficaram como estavam: ${tipo === "margem" ? "sem custo no produto" : "sem preço no ar"}.`);
  }

  function marcar(id: string, sim: boolean) {
    setMarcadas((s) => {
      const n = new Set(s);
      if (sim) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  async function gravar() {
    // Cada variação guarda o seu preço (0115), mesmo duas ligadas ao mesmo produto.
    const itens = alteradas.map((l) => ({ anuncio_id: l.v.anuncioId, preco: l.novo!, margem: null }));
    const prejuizo = alteradas.filter((l) => l.calc.situacao === "prejuizo").length;
    const ok = await confirm({
      title: `Gravar ${itens.length} preço(s)?`,
      message: `${loja!.canalNome} · ${loja!.nome}.${prejuizo ? ` Atenção: ${prejuizo} variação(ões) ficam com prejuízo.` : ""} O preço na Shopee NÃO muda: copie e altere lá.`,
      confirmLabel: "Gravar preços",
    });
    if (!ok) return;
    startSalvar(async () => {
      const r = await executarComToast(salvarPrecosPlanejados({ itens }), { sucesso: "Preços do anúncio gravados", erro: "Não foi possível gravar os preços." });
      if (r.ok) router.refresh();
    });
  }

  const textoCopiar = textoDosPrecos(item.titulo, linhas.map((l) => ({ variacao: l.v.variacao, sku: l.v.sku, preco: l.novo })));
  const imagem = atual.imagemUrl ?? item.imagemUrl;

  return (
    <>
      <Link href="/anuncio" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-3">
        <ArrowLeft size={14} aria-hidden /> Anúncio
      </Link>

      {/* Como na Shopee: capa à esquerda; título, preço e variações à direita. */}
      <Card className="mb-5">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] gap-5">
          <div>
            {imagem ? (
              // eslint-disable-next-line @next/next/no-img-element -- imagem da Shopee, fora do Storage
              <img src={imagem} alt={`Capa de ${item.titulo}`} className="aspect-square w-full rounded-lg border border-border object-cover bg-surface-2" referrerPolicy="no-referrer" />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface-2 text-sm text-text-tertiary">Sem imagem sincronizada</div>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text-primary break-words">{item.titulo}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
              <span>
                {loja.canalNome} · {loja.nome}
              </span>
              {comVariacoes && <span>· {variacoes.length} variações</span>}
              {item.link && (
                <a href={item.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                  · ver na loja <ExternalLink size={12} aria-hidden />
                </a>
              )}
            </p>

            <div className="mt-4 rounded-lg bg-surface-2 px-4 py-3">
              <p className="font-mono text-2xl font-semibold text-accent">{comVariacoes ? faixaTexto(faixaNoAr) : atual.precoNoAr ? formatBRL(atual.precoNoAr) : "sem preço lido"}</p>
              <p className="text-xs text-text-tertiary">Preço no ar na última sincronização</p>
            </div>

            {comVariacoes && (
              <div className="mt-4">
                <span className="block text-xs font-medium text-text-secondary mb-2">Variação</span>
                <div className="flex flex-wrap gap-2">
                  {variacoes.map((v) => (
                    <Chip key={v.anuncioId} ativo={v.anuncioId === selecionada} onClick={() => setSelecionada(v.anuncioId)}>
                      {v.variacao}
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
              <Numero rotulo={comVariacoes ? "Preço da variação" : "Preço"} valor={atual.precoNoAr ? formatBRL(atual.precoNoAr) : "—"} />
              <Numero rotulo="Custo" valor={atual.custo > 0 ? formatBRL(atual.custo) : "—"} />
              <Numero rotulo="Estoque" valor={atual.estoque !== null ? `${atual.estoque} un.` : "—"} />
              <Numero rotulo="SKU" valor={atual.sku ?? "—"} />
            </dl>
            <p className="mt-2 text-xs text-text-secondary">
              {atual.produtoNome ? (
                <>Ligado a {atual.produtoNome}.</>
              ) : (
                <Link href="/produtos/mapeamento" className="inline-flex items-center gap-1 text-accent hover:underline">
                  <Link2 size={12} aria-hidden /> Esta variação não está ligada a um produto: ligar no mapeamento
                </Link>
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {atual.produtoId && (
                <Link href={`/precificacao/ajuste/${atual.anuncioId}`} className={classesBotao({ variant: "secondary", size: "sm" })}>
                  Ajuste de Preço desta variação
                </Link>
              )}
              {atual.produtoId && (
                <Link href={`/anuncio/grupo?loja=${loja.id}&produto=${atual.produtoId}`} className={classesBotao({ variant: "ghost", size: "sm" })}>
                  Outros anúncios deste SKU
                </Link>
              )}
              {atual.produtoId && (
                <Link href={`/anuncio/analise/${atual.anuncioId}`} className={classesBotao({ variant: "ghost", size: "sm" })}>
                  Analisar
                </Link>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardTitle>{comVariacoes ? "Reprecificar todas as variações" : "Reprecificar"}</CardTitle>
        <CardSubtitle>Escolha a regra, aplique nas variações marcadas e ajuste à mão o que precisar. Lucro e margem com as taxas desta loja.</CardSubtitle>

        <div className="mt-4 rounded-lg border border-border p-3">
          <div className="flex flex-wrap gap-2">
            {REGRAS.map((r) => (
              <Chip key={r.tipo} ativo={tipo === r.tipo} onClick={() => setTipo(r.tipo)}>
                {r.rotulo}
              </Chip>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block w-40">
              <span className="block text-xs font-medium text-text-secondary mb-1.5">{tipo === "margem" ? "Margem desejada (%)" : tipo === "percentual" ? "Subir ou baixar (%)" : "Preço (R$)"}</span>
              {tipo === "margem" ? (
                <CampoNumero value={margem} onChange={setMargem} min={0} max={90} casas={1} />
              ) : tipo === "percentual" ? (
                <CampoNumero value={percentual} onChange={setPercentual} min={-90} max={500} casas={1} />
              ) : (
                <CampoNumero value={valor} onChange={setValor} min={0} casas={2} />
              )}
            </label>
            <label className="flex h-10 items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" checked={noventa} onChange={(e) => setNoventa(e.target.checked)} /> Terminar em ,90
            </label>
            <Button variant="secondary" onClick={aplicarRegra} disabled={marcadas.size === 0}>
              Aplicar {marcadas.size === ligadas.length ? "em todas" : `nas ${marcadas.size} marcadas`}
            </Button>
          </div>
          {tipo === "percentual" && <p className="mt-2 text-xs text-text-tertiary">Use número negativo para baixar (ex.: -5).</p>}
        </div>

        <Table className="mt-4">
          <Thead>
            <tr>
              <Th>
                <input type="checkbox" aria-label="Marcar todas" checked={todasMarcadas} disabled={ligadas.length === 0} onChange={(e) => setMarcadas(e.target.checked ? new Set(ligadas.map((v) => v.anuncioId)) : new Set())} />
              </Th>
              <Th>Variação</Th>
              <Th align="right" secundaria>
                Custo
              </Th>
              <Th align="right">No ar</Th>
              <Th align="right">Novo preço</Th>
              <Th align="right">Lucro</Th>
              <Th align="right" secundaria>
                Margem
              </Th>
              <Th />
            </tr>
          </Thead>
          <tbody>
            {linhas.map(({ v, novo, calc, hoje }) => {
              const sit = v.produtoId ? SITUACAO[calc.situacao] : null;
              return (
                <Tr key={v.anuncioId} selecionada={marcadas.has(v.anuncioId)}>
                  <Td>
                    <input type="checkbox" aria-label={`Marcar ${v.variacao ?? "variação"}`} checked={marcadas.has(v.anuncioId)} disabled={!v.produtoId} onChange={(e) => marcar(v.anuncioId, e.target.checked)} />
                  </Td>
                  <Td>
                    <button type="button" onClick={() => setSelecionada(v.anuncioId)} className="block text-left min-w-0">
                      <span className="block font-medium text-text-primary">{v.variacao ?? "Sem variação"}</span>
                      <span className="block text-xs text-text-tertiary">{v.produtoId ? (v.sku ?? v.produtoNome) : "sem produto ligado"}</span>
                    </button>
                  </Td>
                  <Td align="right" mono secundaria>
                    {v.custo > 0 ? formatBRL(v.custo) : "—"}
                  </Td>
                  <Td align="right" mono>
                    <span className="block">{v.precoNoAr ? formatBRL(v.precoNoAr) : "—"}</span>
                    {hoje?.resultado && <span className={`block text-xs ${classeValor(hoje.resultado.lucroLiquido)}`}>{formatBRL(hoje.resultado.lucroLiquido)}</span>}
                  </Td>
                  <Td align="right">
                    {v.produtoId ? (
                      <CampoNumero
                        aria-label={`Novo preço de ${v.variacao ?? "o anúncio"}`}
                        className="w-28 ml-auto rounded-md border border-border bg-surface-1 px-2 py-1.5 text-right font-mono text-sm text-text-primary"
                        value={novo ?? 0}
                        onChange={(n) => setNovos((p) => ({ ...p, [v.anuncioId]: n > 0 ? n : null }))}
                        min={0}
                        casas={2}
                      />
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </Td>
                  <Td align="right" mono className={calc.resultado ? classeValor(calc.resultado.lucroLiquido) : "text-text-tertiary"}>
                    {calc.resultado ? formatBRL(calc.resultado.lucroLiquido) : "—"}
                  </Td>
                  <Td align="right" mono secundaria>
                    {calc.resultado ? pct(calc.resultado.margemEfetivaPct) : "—"}
                  </Td>
                  <Td>{sit && <StatusChip label={sit.rotulo} tone={sit.tom} />}</Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-text-secondary">
            {alteradas.length ? `${alteradas.length} preço(s) diferente(s) do gravado.` : "Nenhum preço alterado."}
            {!item.migracao0115 && " Gravar o preço por anúncio precisa da migração 0115."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => setNovos(inicial())} disabled={salvando}>
              <RotateCcw size={14} aria-hidden /> Desfazer
            </Button>
            <BotaoCopiar texto={textoCopiar} rotulo="preços" />
            <Button variant="primary" onClick={gravar} loading={salvando} disabled={salvando || alteradas.length === 0 || !item.migracao0115}>
              Gravar preços na loja
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">O preço na Shopee não muda por aqui: copie os preços e altere lá.</p>
      </Card>
      {ConfirmDialog}
    </>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-md bg-surface-2 px-3 py-2 min-w-0">
      <dt className="text-xs text-text-tertiary">{rotulo}</dt>
      <dd className="font-mono truncate text-text-primary">{valor}</dd>
    </div>
  );
}

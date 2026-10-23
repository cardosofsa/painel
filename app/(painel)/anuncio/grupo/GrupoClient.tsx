"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Layers, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/Badge";
import { BarraFiltros, FiltroChips } from "@/components/ui/BarraFiltros";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/Table";
import { inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { classeValor, formatBRL } from "@/lib/format";
import { normalizar } from "@/lib/conformidade/termos";
import { psicologicoAcima } from "@/lib/ajuste-preco";
import { faixaValida, precoNaMargem, precosDaFaixa } from "@/lib/faixa-margem";
import { resultadoNaLoja } from "@/lib/precos-loja";
import { distribuirNaFaixa, semRepetir } from "@/lib/reprecificar-anuncio";
import type { DadosGrupos, GrupoSku } from "@/lib/anuncio-grupo-servidor";
import { salvarPrecosPlanejados } from "@/app/(painel)/precificacao/actions";

const PAGINA = 20;
type Faixa = { min: number; max: number };
type Filtro = "repetidos" | "todos";
const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/**
 * Reprecificar em grupo: os anúncios da loja que vendem o mesmo produto (SKU) recebem preços
 * diferentes entre si, espalhados por igual dentro da faixa de margem do produto (0114), na
 * ordem de hoje (o mais caro continua o mais caro), sem repetir preço e nunca abaixo da mínima.
 * "Gravar" salva o preço de cada anúncio (0115); o preço na Shopee não muda.
 */
export function GrupoClient({ dados, produtoInicial }: { dados: DadosGrupos; produtoInicial: string | null }) {
  const router = useRouter();
  const [salvando, startSalvar] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const { loja, grupos, impostoPct } = dados;
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>(() => (produtoInicial ? "todos" : "repetidos"));
  const [visiveis, setVisiveis] = useState(PAGINA);
  const [padrao, setPadrao] = useState<Faixa>({ min: 20, max: 30 });
  const [faixasTela, setFaixasTela] = useState<Record<string, Faixa>>({});
  const [noventa, setNoventa] = useState(true);
  const inicial = () => Object.fromEntries(grupos.flatMap((g) => g.anuncios.map((a) => [a.id, a.precoPlanejado]))) as Record<string, number | null>;
  const [novos, setNovos] = useState<Record<string, number | null>>(inicial);
  const [margens, setMargens] = useState<Record<string, number | null>>({});
  // Começa com os SKUs repetidos marcados (ou só o produto que veio no link).
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(grupos.filter((g) => (produtoInicial ? g.produtoId === produtoInicial : g.anuncios.length > 1)).flatMap((g) => g.anuncios.map((a) => a.id))),
  );

  const faixaDe = (g: GrupoSku): { faixa: Faixa; origem: "tela" | "produto" | "padrao" } =>
    faixasTela[g.produtoId]
      ? { faixa: faixasTela[g.produtoId], origem: "tela" }
      : g.margemMinima !== null && g.margemMaxima !== null
        ? { faixa: { min: Math.round(g.margemMinima * 1000) / 10, max: Math.round(g.margemMaxima * 1000) / 10 }, origem: "produto" }
        : { faixa: padrao, origem: "padrao" };

  const filtrados = grupos.filter((g) => {
    if (produtoInicial && filtro === "todos" && !busca.trim()) return true;
    if (filtro === "repetidos" && g.anuncios.length < 2) return false;
    if (!busca.trim()) return true;
    const alvo = `${g.nome} ${g.sku ?? ""} ${g.anuncios.map((a) => `${a.titulo} ${a.variacao ?? ""}`).join(" ")}`;
    return normalizar(alvo).includes(normalizar(busca.trim()));
  });
  // O produto do link vem primeiro.
  if (produtoInicial) filtrados.sort((a, b) => Number(b.produtoId === produtoInicial) - Number(a.produtoId === produtoInicial));
  const todos = grupos.flatMap((g) => g.anuncios.map((a) => ({ g, a })));
  const alterados = todos.filter(({ a }) => novos[a.id] != null && novos[a.id] !== a.precoPlanejado);
  const repetidos = grupos.filter((g) => g.anuncios.length > 1).length;

  if (!loja) {
    return (
      <>
        <Voltar />
        <Card>
          <EmptyState icon={Layers} title="Nenhuma loja cadastrada" description="Cadastre e conecte uma loja em Configurações › Canais de venda para reprecificar os anúncios." />
        </Card>
      </>
    );
  }

  function distribuir(lista: GrupoSku[]) {
    const n = { ...novos };
    const m = { ...margens };
    let semCusto = 0;
    let invalidas = 0;
    let feitos = 0;
    for (const g of lista) {
      const alvo = g.anuncios.filter((a) => marcados.has(a.id));
      if (!alvo.length) continue;
      const { faixa } = faixaDe(g);
      if (!faixaValida(faixa.min, faixa.max)) {
        invalidas += 1;
        continue;
      }
      if (!(g.custo > 0)) {
        semCusto += 1;
        continue;
      }
      const ordem = distribuirNaFaixa(
        alvo.map((a) => ({ id: a.id, precoAtual: a.precoNoAr })),
        faixa.min / 100,
        faixa.max / 100,
      );
      const precos = ordem.map((o) => {
        const p = precoNaMargem(g.custo, loja!, impostoPct, o.margem);
        return p === null ? null : noventa ? psicologicoAcima(p) : p;
      });
      if (precos.some((p) => p === null)) {
        semCusto += 1;
        continue;
      }
      const finais = semRepetir(precos as number[], noventa);
      ordem.forEach((o, i) => {
        n[o.id] = finais[i];
        m[o.id] = o.margem;
      });
      feitos += 1;
    }
    setNovos(n);
    setMargens(m);
    if (feitos) toast.success(`Preços distribuídos em ${feitos} produto(s).`);
    if (semCusto) toast(`${semCusto} produto(s) ficaram como estavam: sem custo, ou a margem pedida não cabe nas taxas da loja.`);
    if (invalidas) toast.error(`${invalidas} produto(s) com faixa inválida (a mínima precisa ser menor ou igual à máxima, abaixo de 90%).`);
    if (!feitos && !semCusto && !invalidas) toast("Marque os anúncios que quer reprecificar.");
  }

  function marcarGrupo(g: GrupoSku, sim: boolean) {
    setMarcados((s) => {
      const n = new Set(s);
      for (const a of g.anuncios) {
        if (sim) n.add(a.id);
        else n.delete(a.id);
      }
      return n;
    });
  }

  async function gravar() {
    const itens = alterados.map(({ a }) => ({ anuncio_id: a.id, preco: novos[a.id]!, margem: margens[a.id] ?? null }));
    const abaixo = alterados.filter(({ g, a }) => {
      const r = resultadoNaLoja(loja!, g.custo, impostoPct, novos[a.id]!);
      return g.custo > 0 && r.margemEfetivaPct < faixaDe(g).faixa.min / 100 - 1e-9;
    }).length;
    const ok = await confirm({
      title: `Gravar ${itens.length} preço(s)?`,
      message: `Cada anúncio de ${loja!.canalNome} · ${loja!.nome} guarda o seu preço.${abaixo ? ` Atenção: ${abaixo} ficam abaixo da margem mínima da faixa.` : ""} O preço na Shopee NÃO muda: copie e altere lá.`,
      confirmLabel: "Gravar preços",
    });
    if (!ok) return;
    startSalvar(async () => {
      const r = await executarComToast(salvarPrecosPlanejados({ itens }), { sucesso: (n) => `${n} preço(s) gravado(s)`, erro: "Não foi possível gravar os preços." });
      if (r.ok) router.refresh();
    });
  }

  const textoCopiar = grupos
    .filter((g) => g.anuncios.some((a) => novos[a.id] != null))
    .map((g) => [`${g.nome}${g.sku ? ` (${g.sku})` : ""}`, ...g.anuncios.filter((a) => novos[a.id] != null).map((a) => `  ${a.titulo}${a.variacao ? ` · ${a.variacao}` : ""}: ${formatBRL(novos[a.id]!)}`)].join("\n"))
    .join("\n\n");

  return (
    <>
      <Voltar />
      <PageHeader
        eyebrow="Anúncio"
        title="Reprecificar em grupo"
        descricao="Os anúncios que vendem o mesmo produto recebem preços diferentes, espalhados por igual dentro da faixa de margem. O mais caro hoje continua o mais caro, e nenhum fica abaixo da margem mínima."
      />

      <Card className="mb-5">
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)] gap-4 items-end">
          <label className="block">
            <span className="block text-xs font-medium text-text-secondary mb-1.5">Loja</span>
            <select className={inputClass} value={loja.id} onChange={(e) => router.push(`/anuncio/grupo?loja=${e.target.value}`)}>
              {dados.lojas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.rotulo}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block w-28">
              <span className="block text-xs font-medium text-text-secondary mb-1.5">Mín. padrão (%)</span>
              <CampoNumero value={padrao.min} onChange={(n) => setPadrao((p) => ({ ...p, min: n }))} min={0} max={89.9} casas={1} />
            </label>
            <label className="block w-28">
              <span className="block text-xs font-medium text-text-secondary mb-1.5">Máx. padrão (%)</span>
              <CampoNumero value={padrao.max} onChange={(n) => setPadrao((p) => ({ ...p, max: n }))} min={0} max={89.9} casas={1} />
            </label>
            <label className="flex h-10 items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" checked={noventa} onChange={(e) => setNoventa(e.target.checked)} /> Terminar em ,90
            </label>
            <Button variant="secondary" onClick={() => distribuir(grupos)} disabled={marcados.size === 0}>
              Distribuir nos {marcados.size} marcados
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-text-tertiary">
          A faixa padrão vale para produto sem faixa. A faixa de cada produto se define em{" "}
          <Link href="/precificacao?visao=faixas" className="text-accent hover:underline">
            Precificação › Faixas de margem
          </Link>
          ; aqui dá para mudar só nesta tela.
        </p>
      </Card>

      <BarraFiltros
        busca={busca}
        onBusca={(v) => {
          setBusca(v);
          setVisiveis(PAGINA);
        }}
        placeholder="Buscar produto, SKU ou anúncio"
        ativos={filtro === "repetidos" ? 0 : 1}
        onLimpar={() => {
          setBusca("");
          setFiltro("repetidos");
        }}
        situacao={
          <FiltroChips
            rotulo="Mostrar"
            valor={filtro}
            onChange={(v) => {
              setFiltro(v);
              setVisiveis(PAGINA);
            }}
            opcoes={[
              { valor: "repetidos", rotulo: "SKU em 2+ anúncios", quantidade: repetidos },
              { valor: "todos", rotulo: "Todos", quantidade: grupos.length },
            ]}
          />
        }
      />

      {filtrados.length === 0 ? (
        <Card className="mt-4">
          <EmptyState
            icon={Layers}
            title={grupos.length ? "Nenhum produto com esse filtro" : "Nenhum anúncio ligado a produto nesta loja"}
            description={grupos.length ? "Mude a busca ou mostre todos." : "Sincronize a loja e ligue os anúncios aos produtos no mapeamento."}
          />
        </Card>
      ) : (
        <div className="mt-4 space-y-4">
          {filtrados.slice(0, visiveis).map((g) => {
            const { faixa, origem } = faixaDe(g);
            const valida = faixaValida(faixa.min, faixa.max);
            const ref = valida && g.custo > 0 ? precosDaFaixa(g.custo, loja, impostoPct, { minima: faixa.min / 100, maxima: faixa.max / 100 }) : null;
            const todosDoGrupo = g.anuncios.every((a) => marcados.has(a.id));
            const campo = "w-20 rounded-md border border-border bg-surface-1 px-2 py-1.5 text-right font-mono text-sm text-text-primary";
            return (
              <Card key={g.produtoId}>
                <div className="flex flex-wrap items-start gap-3">
                  <input type="checkbox" className="mt-1.5" aria-label={`Marcar os anúncios de ${g.nome}`} checked={todosDoGrupo} onChange={(e) => marcarGrupo(g, e.target.checked)} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-text-primary break-words">{g.nome}</p>
                    <p className="text-xs text-text-secondary">
                      <span className="font-mono">{g.sku ?? "sem SKU"}</span> · custo {g.custo > 0 ? formatBRL(g.custo) : "—"} · {g.anuncios.length} anúncio(s)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block">
                      <span className="block text-xs text-text-tertiary mb-1">Mín. %</span>
                      <CampoNumero aria-label={`Margem mínima de ${g.nome}`} className={campo} value={faixa.min} onChange={(n) => setFaixasTela((f) => ({ ...f, [g.produtoId]: { ...faixa, min: n } }))} min={0} max={89.9} casas={1} />
                    </label>
                    <label className="block">
                      <span className="block text-xs text-text-tertiary mb-1">Máx. %</span>
                      <CampoNumero aria-label={`Margem máxima de ${g.nome}`} className={campo} value={faixa.max} onChange={(n) => setFaixasTela((f) => ({ ...f, [g.produtoId]: { ...faixa, max: n } }))} min={0} max={89.9} casas={1} />
                    </label>
                    <Button size="sm" variant="secondary" onClick={() => distribuir([g])} disabled={!g.anuncios.some((a) => marcados.has(a.id))}>
                      Distribuir
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-text-secondary">
                  {origem === "produto" ? "Faixa do produto" : origem === "tela" ? "Faixa mudada só nesta tela" : "Faixa padrão (o produto não tem faixa)"}
                  {ref?.minimo && ref.maximo ? ` · de ${formatBRL(ref.minimo)} a ${formatBRL(ref.maximo)}` : !valida ? " · faixa inválida" : g.custo > 0 ? "" : " · sem custo, não dá para calcular"}
                </p>

                <Table className="mt-3">
                  <Thead>
                    <tr>
                      <Th />
                      <Th>Anúncio</Th>
                      <Th align="right">No ar</Th>
                      <Th align="right">Novo preço</Th>
                      <Th align="right">Lucro</Th>
                      <Th align="right" secundaria>
                        Margem
                      </Th>
                    </tr>
                  </Thead>
                  <tbody>
                    {g.anuncios.map((a) => {
                      const novo = novos[a.id] ?? null;
                      const r = novo && g.custo > 0 ? resultadoNaLoja(loja, g.custo, impostoPct, novo) : null;
                      const abaixo = r && valida && r.margemEfetivaPct < faixa.min / 100 - 1e-9;
                      return (
                        <Tr key={a.id} selecionada={marcados.has(a.id)}>
                          <Td>
                            <input
                              type="checkbox"
                              aria-label={`Marcar ${a.titulo}`}
                              checked={marcados.has(a.id)}
                              onChange={(e) =>
                                setMarcados((s) => {
                                  const n = new Set(s);
                                  if (e.target.checked) n.add(a.id);
                                  else n.delete(a.id);
                                  return n;
                                })
                              }
                            />
                          </Td>
                          <Td>
                            <span className="flex items-center gap-2 min-w-0">
                              {a.imagemUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element -- imagem da Shopee, fora do Storage
                                <img src={a.imagemUrl} alt="" className="h-9 w-9 shrink-0 rounded border border-border object-cover bg-surface-2" loading="lazy" referrerPolicy="no-referrer" />
                              ) : (
                                <span className="h-9 w-9 shrink-0 rounded bg-surface-2" aria-hidden="true" />
                              )}
                              <span className="min-w-0">
                                <Link href={`/anuncio/item/${a.id}`} className="block text-text-primary hover:text-accent break-words">
                                  {a.titulo}
                                </Link>
                                <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-tertiary">
                                  {a.variacao && <span>{a.variacao}</span>}
                                  <span className="font-mono">#{a.itemId}</span>
                                  {a.link && (
                                    <a href={a.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
                                      ver <ExternalLink size={10} aria-hidden />
                                    </a>
                                  )}
                                  {a.precoPlanejado && <span>gravado {formatBRL(a.precoPlanejado)}</span>}
                                </span>
                              </span>
                            </span>
                          </Td>
                          <Td align="right" mono>
                            {a.precoNoAr ? formatBRL(a.precoNoAr) : "—"}
                          </Td>
                          <Td align="right">
                            <CampoNumero
                              aria-label={`Novo preço de ${a.titulo}`}
                              className="w-28 ml-auto rounded-md border border-border bg-surface-1 px-2 py-1.5 text-right font-mono text-sm text-text-primary"
                              value={novo ?? 0}
                              onChange={(n) => {
                                setNovos((p) => ({ ...p, [a.id]: n > 0 ? n : null }));
                                setMargens((m) => ({ ...m, [a.id]: null }));
                              }}
                              min={0}
                              casas={2}
                            />
                          </Td>
                          <Td align="right" mono className={r ? classeValor(r.lucroLiquido) : "text-text-tertiary"}>
                            {r ? formatBRL(r.lucroLiquido) : "—"}
                          </Td>
                          <Td align="right" mono secundaria>
                            {r ? (
                              <span className="inline-flex items-center gap-1.5">
                                {pct(r.margemEfetivaPct)}
                                {abaixo && <StatusChip tone="negative" label="abaixo" />}
                              </span>
                            ) : (
                              "—"
                            )}
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Card>
            );
          })}
          {filtrados.length > visiveis && (
            <div className="flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setVisiveis((n) => n + PAGINA)}>
                Mostrar mais {Math.min(PAGINA, filtrados.length - visiveis)} de {filtrados.length - visiveis}
              </Button>
            </div>
          )}
        </div>
      )}

      <Card className="mt-5 sticky bottom-3 shadow-elev-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">
            {alterados.length ? `${alterados.length} preço(s) novo(s) para gravar.` : "Nenhum preço alterado."}
            {!dados.migracao0115 && " Gravar o preço por anúncio precisa da migração 0115."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setNovos(inicial());
                setMargens({});
              }}
              disabled={salvando}
            >
              <RotateCcw size={14} aria-hidden /> Desfazer
            </Button>
            <BotaoCopiar texto={textoCopiar} rotulo="preços" />
            <Button variant="primary" onClick={gravar} loading={salvando} disabled={salvando || alterados.length === 0 || !dados.migracao0115}>
              Gravar preços
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-text-tertiary">O preço na Shopee não muda por aqui: copie os preços e altere lá.</p>
      </Card>
      {ConfirmDialog}
    </>
  );
}

function Voltar() {
  return (
    <Link href="/anuncio" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
      <ArrowLeft size={14} aria-hidden /> Anúncio
    </Link>
  );
}

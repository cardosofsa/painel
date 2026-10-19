"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Sparkles, Trophy } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { BarraFiltros, FiltroChips, FiltroSelect } from "@/components/ui/BarraFiltros";
import { Card, CardEyebrow } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportarModal } from "@/components/ui/ExportarModal";
import { campoBase } from "@/components/ui/Modal";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { classeValor, formatBRL } from "@/lib/format";
import type { TabelaExport } from "@/lib/exportar";
import {
  compararComAnterior,
  contarSituacoes,
  filtrarRanking,
  ordenarRanking,
  rankearAnuncios,
  resumirRanking,
  CANCELAMENTO_ALTO,
  MARGEM_BAIXA,
  VARIACAO_FORTE,
  type AnuncioCadastrado,
  type ColunaOrdem,
  type FiltrosRanking,
  type LinhaRanking,
  type PedidoRanking,
  type Situacao,
} from "@/lib/marketplace/ranking-anuncios";

const PERIODOS = [7, 30, 90, 180] as const;
type Periodo = (typeof PERIODOS)[number] | "personalizado";
/** Linhas por "página" da tabela. */
const PAGINA = 50;
const DIA_MS = 24 * 60 * 60 * 1000;

const pct = (f: number) => `${(f * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const diaEmSaoPaulo = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const pctSinal = (f: number) => `${f > 0 ? "+" : ""}${pct(f)}`;

const SITUACOES: { valor: Situacao; rotulo: string; dica?: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "vendendo", rotulo: "Vendendo" },
  { valor: "parados", rotulo: "Parados", dica: "Cadastrados e sem nenhuma venda no período" },
  { valor: "em_alta", rotulo: "Em alta", dica: `Faturamento ${pct(VARIACAO_FORTE)} ou mais acima do período anterior, ou começou a vender` },
  { valor: "em_queda", rotulo: "Em queda", dica: `Faturamento ${pct(VARIACAO_FORTE)} ou mais abaixo do período anterior, ou parou de vender` },
  { valor: "prejuizo", rotulo: "Prejuízo" },
  { valor: "margem_baixa", rotulo: "Margem baixa", dica: `Margem abaixo de ${pct(MARGEM_BAIXA)}` },
  { valor: "cancelamentos", rotulo: "Muitos cancelamentos", dica: `${pct(CANCELAMENTO_ALTO)} ou mais dos pedidos cancelados ou devolvidos` },
  { valor: "sem_custo", rotulo: "Custo incompleto", dica: "Algum item sem produto vinculado: lucro e margem acima do real" },
];
const COLUNAS_ORDEM: { valor: ColunaOrdem; rotulo: string }[] = [
  { valor: "receita", rotulo: "Faturamento" },
  { valor: "lucro", rotulo: "Lucro" },
  { valor: "margem", rotulo: "Margem" },
  { valor: "unidades", rotulo: "Unidades" },
  { valor: "pedidos", rotulo: "Pedidos" },
  { valor: "variacao", rotulo: "Variação" },
  { valor: "taxaProblema", rotulo: "Cancelamentos" },
  { valor: "nome", rotulo: "Nome" },
];

function Kpi({ rotulo, valor, apoio, classeApoio = "text-text-tertiary" }: { rotulo: string; valor: string; apoio?: string; classeApoio?: string }) {
  return (
    <Card>
      <CardEyebrow>{rotulo}</CardEyebrow>
      <div className="text-xl font-semibold font-mono tabular text-text-primary mt-1">{valor}</div>
      {apoio && <div className={`text-xs mt-0.5 ${classeApoio}`}>{apoio}</div>}
    </Card>
  );
}

const COR_CLASSE = { A: "text-positive", B: "text-text-secondary", C: "text-text-tertiary" } as const;

/** Filtros na URL: o link (ou recarregar) abre a tela do mesmo jeito. */
interface EstadoUrl extends FiltrosRanking {
  periodo: Periodo;
  de: string;
  ate: string;
  loja: string;
  coluna: ColunaOrdem;
  direcao: "asc" | "desc";
}

/** Lido no servidor (searchParams da página), para o primeiro desenho já sair filtrado. */
function lerUrl(p: URLSearchParams): Partial<EstadoUrl> {
  const periodo = p.get("periodo");
  const situacao = p.get("situacao");
  const classe = p.get("classe");
  const coluna = p.get("ordem");
  return {
    periodo: periodo === "personalizado" ? "personalizado" : PERIODOS.find((x) => String(x) === periodo),
    de: p.get("de") ?? undefined,
    ate: p.get("ate") ?? undefined,
    loja: p.get("loja") ?? undefined,
    busca: p.get("q") ?? undefined,
    situacao: SITUACOES.find((s) => s.valor === situacao)?.valor,
    classe: classe === "A" || classe === "B" || classe === "C" ? classe : undefined,
    coluna: COLUNAS_ORDEM.find((c) => c.valor === coluna)?.valor,
    direcao: p.get("dir") === "asc" ? "asc" : undefined,
  };
}

/**
 * Ranking dos anúncios da Shopee: o que mais vende, o que mais dá lucro, o que está parado e o
 * que mudou em relação ao período anterior. Tudo sai dos pedidos já sincronizados (nenhuma
 * chamada nova à API): a visita e a conversão por anúncio não estão aqui.
 */
export function RankingAnunciosClient({
  pedidos,
  anuncios,
  lojas,
  agoraIso,
  diasJanela,
  semDados,
  parametros = {},
}: {
  /** `searchParams` da página. */
  parametros?: Record<string, string | undefined>;
  pedidos: PedidoRanking[];
  anuncios: AnuncioCadastrado[];
  lojas: { id: string; nome: string }[];
  agoraIso: string;
  diasJanela: number;
  semDados: boolean;
}) {
  const [inicial] = useState(() => lerUrl(new URLSearchParams(Object.entries(parametros).filter((e): e is [string, string] => typeof e[1] === "string"))));
  // Dia de hoje no fuso da loja, igual no servidor e no navegador (sem diferença na hidratação).
  const hoje = diaEmSaoPaulo(new Date(agoraIso));
  const [periodo, setPeriodo] = useState<Periodo>(inicial.periodo ?? 30);
  const [de, setDe] = useState(inicial.de ?? "");
  const [ate, setAte] = useState(inicial.ate ?? hoje);
  const [loja, setLoja] = useState(inicial.loja ?? "");
  const [busca, setBusca] = useState(inicial.busca ?? "");
  const [situacao, setSituacao] = useState<Situacao>(inicial.situacao ?? "todos");
  const [classe, setClasse] = useState<FiltrosRanking["classe"]>(inicial.classe ?? "");
  const [coluna, setColuna] = useState<ColunaOrdem>(inicial.coluna ?? "receita");
  const [direcao, setDirecao] = useState<"asc" | "desc">(inicial.direcao ?? "desc");
  const [visiveisN, setVisiveisN] = useState(PAGINA);
  const [exportando, setExportando] = useState(false);

  // Espelha os filtros na URL sem ida ao servidor.
  useEffect(() => {
    const p = new URLSearchParams();
    if (periodo !== 30) p.set("periodo", String(periodo));
    if (periodo === "personalizado") {
      if (de) p.set("de", de);
      if (ate) p.set("ate", ate);
    }
    if (loja) p.set("loja", loja);
    if (busca.trim()) p.set("q", busca.trim());
    if (situacao !== "todos") p.set("situacao", situacao);
    if (classe) p.set("classe", classe);
    if (coluna !== "receita") p.set("ordem", coluna);
    if (direcao !== "desc") p.set("dir", direcao);
    const qs = p.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [periodo, de, ate, loja, busca, situacao, classe, coluna, direcao]);

  // Intervalo do período e o anterior de mesmo tamanho (se a janela carregada cobre).
  const intervalo = useMemo(() => {
    const agora = new Date(agoraIso);
    const limite = new Date(agora.getTime() - diasJanela * DIA_MS);
    let inicio: Date;
    let fim: Date;
    if (periodo === "personalizado" && de) {
      inicio = new Date(`${de}T00:00:00-03:00`);
      fim = ate ? new Date(`${ate}T23:59:59.999-03:00`) : agora;
      if (fim > agora) fim = agora;
    } else {
      const dias = periodo === "personalizado" ? 30 : periodo;
      fim = agora;
      inicio = new Date(agora);
      inicio.setHours(0, 0, 0, 0);
      inicio.setDate(inicio.getDate() - (dias - 1));
    }
    if (inicio < limite) inicio = limite;
    const tamanho = Math.max(DIA_MS, fim.getTime() - inicio.getTime());
    const antInicio = new Date(inicio.getTime() - tamanho);
    const anterior = antInicio >= limite ? { inicio: antInicio, fim: new Date(inicio.getTime() - 1) } : null;
    return { inicio, fim, anterior, dias: Math.max(1, Math.round(tamanho / DIA_MS)) };
  }, [agoraIso, diasJanela, periodo, de, ate]);

  const { linhas, comparacao, resumoAnterior } = useMemo(() => {
    const daLoja = <T extends { loja_id: string }>(x: T[]) => (loja ? x.filter((i) => i.loja_id === loja) : x);
    const ps = daLoja(pedidos);
    const as = daLoja(anuncios);
    const atual = rankearAnuncios(ps, as, intervalo.inicio, intervalo.fim, "receita");
    const anterior = intervalo.anterior ? rankearAnuncios(ps, as, intervalo.anterior.inicio, intervalo.anterior.fim, "receita") : null;
    return { linhas: atual, comparacao: compararComAnterior(atual, anterior), resumoAnterior: anterior ? resumirRanking(anterior) : null };
  }, [pedidos, anuncios, loja, intervalo]);

  const resumo = useMemo(() => resumirRanking(linhas), [linhas]);
  // Contagens dos chips com a busca e a classe já aplicadas (o número bate com o que aparece).
  const contagem = useMemo(() => contarSituacoes(filtrarRanking(linhas, { busca, situacao: "todos", classe }), comparacao), [linhas, busca, classe, comparacao]);
  const filtradas = useMemo(() => ordenarRanking(filtrarRanking(linhas, { busca, situacao, classe }, comparacao), coluna, direcao, comparacao), [linhas, busca, situacao, classe, comparacao, coluna, direcao]);
  const visiveis = filtradas.slice(0, visiveisN);

  const nomeLoja = (id: string) => lojas.find((l) => l.id === id)?.nome ?? "";
  const semCusto = linhas.some((l) => l.custoIncompleto);
  const temAnuncios = anuncios.length > 0;
  const variacaoTotal = resumoAnterior && resumoAnterior.receita > 0 ? (resumo.receita - resumoAnterior.receita) / resumoAnterior.receita : null;
  const rotuloPeriodo = periodo === "personalizado" ? `${intervalo.dias} dias escolhidos` : `últimos ${periodo} dias`;
  const filtrosAtivos = (situacao !== "todos" ? 1 : 0) + (classe ? 1 : 0) + (loja ? 1 : 0);

  function ordenarPor(c: ColunaOrdem) {
    setVisiveisN(PAGINA);
    if (c === coluna) return setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    setColuna(c);
    // Nome e posição começam do menor; números, do maior.
    setDirecao(c === "nome" || c === "posicao" ? "asc" : "desc");
  }
  const ordemDe = (c: ColunaOrdem) => (coluna === c ? direcao : null);
  const mudou = <T,>(f: (v: T) => void) => (v: T) => {
    f(v);
    setVisiveisN(PAGINA);
  };

  const tabela: TabelaExport<LinhaRanking> = {
    titulo: `Ranking de anúncios — ${rotuloPeriodo}`,
    colunas: [
      { rotulo: "Posição", tipo: "inteiro", valor: (l) => l.posicao || null },
      { rotulo: "Anúncio", largura: 44, valor: (l) => l.nome },
      { rotulo: "Loja", valor: (l) => nomeLoja(l.lojaId) },
      { rotulo: "Pedidos", tipo: "inteiro", valor: (l) => l.pedidos },
      { rotulo: "Unidades", tipo: "inteiro", valor: (l) => l.unidades },
      { rotulo: "Faturamento", tipo: "moeda", valor: (l) => l.receita },
      { rotulo: "Faturamento anterior", tipo: "moeda", valor: (l) => comparacao.get(l.chave)?.receitaAnterior ?? null },
      { rotulo: "Variação", tipo: "percentual", valor: (l) => comparacao.get(l.chave)?.variacao ?? null },
      { rotulo: "Lucro", tipo: "moeda", valor: (l) => l.lucro },
      { rotulo: "Margem", tipo: "percentual", valor: (l) => l.margem },
      { rotulo: "Cancel./devol.", tipo: "percentual", valor: (l) => l.taxaProblema },
      { rotulo: "Classe", valor: (l) => l.classe ?? "Parado" },
    ],
    linhas: filtradas,
  };

  return (
    <>
      <Link href="/vendas" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} aria-hidden /> Vendas
      </Link>
      <PageHeader
        title="Ranking de anúncios"
        descricao="Quais anúncios da Shopee mais vendem, mais dão lucro, quais estão parados e o que mudou desde o período anterior, a partir dos pedidos sincronizados."
        actions={
          <>
            <Link href="/vendas/insights">
              <Button variant="secondary">
                <Sparkles size={14} aria-hidden /> Insights
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => setExportando(true)} disabled={filtradas.length === 0}>
              Exportar
            </Button>
          </>
        }
      />

      {semDados ? (
        <Card>
          <EmptyState icon={Trophy} title="Pedidos da Shopee ainda não estão disponíveis" description="Conecte a loja e sincronize os pedidos em Vendas para ver o ranking." />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <Chip key={p} ativo={periodo === p} onClick={() => mudou(setPeriodo)(p)}>
                {p} dias
              </Chip>
            ))}
            <Chip
              ativo={periodo === "personalizado"}
              onClick={() => {
                if (!de) setDe(diaEmSaoPaulo(intervalo.inicio));
                mudou(setPeriodo)("personalizado");
              }}
            >
              Personalizado
            </Chip>
            {periodo === "personalizado" && (
              <span className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
                  De
                  <input type="date" className={campoBase} value={de} max={ate || hoje} onChange={(e) => mudou(setDe)(e.target.value)} />
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs text-text-tertiary">
                  Até
                  <input type="date" className={campoBase} value={ate} min={de} max={hoje} onChange={(e) => mudou(setAte)(e.target.value)} />
                </label>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Kpi
              rotulo="Faturamento"
              valor={formatBRL(resumo.receita)}
              apoio={variacaoTotal !== null ? `${pctSinal(variacaoTotal)} vs. período anterior` : `${resumo.pedidos} pedidos · ${resumo.unidades} un.`}
              classeApoio={variacaoTotal !== null ? classeValor(variacaoTotal) : undefined}
            />
            <Kpi rotulo="Lucro" valor={formatBRL(resumo.lucro)} apoio={resumo.receita > 0 ? `margem ${pct(resumo.lucro / resumo.receita)}` : undefined} />
            <Kpi rotulo="Anúncios vendendo" valor={String(resumo.comVenda)} apoio={`de ${resumo.anuncios} · ${resumo.pedidos} pedidos`} />
            <Kpi rotulo="Anúncios parados" valor={temAnuncios ? String(resumo.parados) : "—"} apoio={temAnuncios ? "sem venda no período" : "detecte os anúncios em Produtos"} />
          </div>

          <BarraFiltros
            busca={busca}
            onBusca={mudou(setBusca)}
            placeholder="Buscar anúncio pelo título"
            ativos={filtrosAtivos}
            onLimpar={() => {
              setBusca("");
              setSituacao("todos");
              setClasse("");
              setLoja("");
              setVisiveisN(PAGINA);
            }}
            situacao={<FiltroChips rotulo="Situação" valor={situacao} onChange={mudou(setSituacao)} opcoes={SITUACOES.filter((s) => s.valor === "todos" || s.valor === situacao || contagem[s.valor] > 0).map((s) => ({ valor: s.valor, rotulo: s.rotulo, quantidade: contagem[s.valor] }))} />}
          >
            {lojas.length > 1 && <FiltroSelect rotulo="Loja" valor={loja} onChange={mudou(setLoja)} todos="Todas" opcoes={lojas.map((l) => ({ valor: l.id, rotulo: l.nome }))} />}
            <FiltroSelect<"A" | "B" | "C">
              rotulo="Classe"
              valor={classe}
              onChange={mudou(setClasse)}
              todos="Todas"
              opcoes={[
                { valor: "A", rotulo: "A (80% do faturamento)" },
                { valor: "B", rotulo: "B (até 95%)" },
                { valor: "C", rotulo: "C (o resto)" },
              ]}
            />
            <FiltroSelect<ColunaOrdem> rotulo="Ordenar por" valor={coluna === "posicao" ? "" : coluna} onChange={(v) => ordenarPor(v || "posicao")} todos="Posição" opcoes={COLUNAS_ORDEM} />
          </BarraFiltros>

          {semCusto && (
            <p className="text-xs text-text-secondary mb-3">
              ⚠ Alguns anúncios têm item sem produto vinculado (custo desconhecido): o lucro e a margem deles estão acima do real. Marcados com “*”. Vincule em Produtos › Mapeamento de anúncio.
            </p>
          )}
          {!intervalo.anterior && <p className="text-xs text-text-tertiary mb-3">Sem comparação com o período anterior: os pedidos carregados vão até {diasJanela} dias atrás.</p>}

          <Card padding="nenhum">
            {filtradas.length === 0 ? (
              <EmptyState
                icon={Trophy}
                title={linhas.length === 0 ? "Sem vendas no período" : "Nenhum anúncio com esses filtros"}
                description={linhas.length === 0 ? `Nada para mostrar em ${rotuloPeriodo}. Os pedidos carregados vão até ${diasJanela} dias atrás.` : "Mude a situação, a classe ou a busca."}
              />
            ) : (
              <Table>
                <Thead>
                  <tr>
                    <Th align="center" ordem={ordemDe("posicao")} onOrdenar={() => ordenarPor("posicao")}>
                      #
                    </Th>
                    <Th ordem={ordemDe("nome")} onOrdenar={() => ordenarPor("nome")}>
                      Anúncio
                    </Th>
                    <Th align="right" secundaria ordem={ordemDe("pedidos")} onOrdenar={() => ordenarPor("pedidos")}>
                      Pedidos
                    </Th>
                    <Th align="right" ordem={ordemDe("unidades")} onOrdenar={() => ordenarPor("unidades")}>
                      Unid.
                    </Th>
                    <Th align="right" ordem={ordemDe("receita")} onOrdenar={() => ordenarPor("receita")}>
                      Faturamento
                    </Th>
                    <Th align="right" ordem={ordemDe("variacao")} onOrdenar={() => ordenarPor("variacao")}>
                      Variação
                    </Th>
                    <Th align="right" ordem={ordemDe("lucro")} onOrdenar={() => ordenarPor("lucro")}>
                      Lucro
                    </Th>
                    <Th align="right" ordem={ordemDe("margem")} onOrdenar={() => ordenarPor("margem")}>
                      Margem
                    </Th>
                    <Th align="right" secundaria ordem={ordemDe("taxaProblema")} onOrdenar={() => ordenarPor("taxaProblema")}>
                      Cancel.
                    </Th>
                    <Th align="center" secundaria>
                      Classe
                    </Th>
                    <Th align="right" secundaria>
                      <span className="sr-only">Ações</span>
                    </Th>
                  </tr>
                </Thead>
                <tbody>
                  {visiveis.map((l) => {
                    const c = comparacao.get(l.chave);
                    return (
                      <Tr key={l.chave}>
                        <Td align="center" mono>
                          {l.posicao || "—"}
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2 min-w-[12rem]">
                            {/* eslint-disable-next-line @next/next/no-img-element -- imagem da Shopee */}
                            {l.imagemUrl && <img src={l.imagemUrl} alt="" width={32} height={32} className="rounded-sm object-cover shrink-0 h-8 w-8" loading="lazy" referrerPolicy="no-referrer" />}
                            <div className="min-w-0">
                              <div className="text-text-primary truncate max-w-[20rem]" title={l.nome}>
                                {l.nome}
                              </div>
                              <div className="text-xs text-text-tertiary">
                                {[lojas.length > 1 ? nomeLoja(l.lojaId) : "", l.variacoes > 1 ? `${l.variacoes} variações vendidas` : ""].filter(Boolean).join(" · ")}
                                {l.link && (
                                  <a href={l.link} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex align-middle text-text-secondary hover:text-text-primary" aria-label="Abrir anúncio na Shopee">
                                    <ExternalLink size={12} aria-hidden />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </Td>
                        <Td align="right" mono secundaria>
                          {l.pedidos}
                        </Td>
                        <Td align="right" mono className="whitespace-nowrap">
                          {l.unidades}
                        </Td>
                        <Td align="right" mono className="whitespace-nowrap">
                          {formatBRL(l.receita)}
                        </Td>
                        <Td align="right" mono className="whitespace-nowrap">
                          {c?.novo ? (
                            <span className="text-positive" title="Não tinha vendido no período anterior">
                              novo
                            </span>
                          ) : c?.variacao != null ? (
                            <span className={classeValor(c.variacao)} title={`Antes: ${formatBRL(c.receitaAnterior ?? 0)}`}>
                              {pctSinal(c.variacao)}
                            </span>
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}
                        </Td>
                        <Td align="right" mono className="whitespace-nowrap">
                          {l.receita > 0 ? <span className={l.lucro < 0 ? "text-negative" : ""}>{formatBRL(l.lucro)}</span> : "—"}
                          {l.custoIncompleto && <span title="Custo incompleto: algum item sem produto vinculado"> *</span>}
                        </Td>
                        <Td align="right" mono className="whitespace-nowrap">
                          {l.margem == null ? "—" : <span className={l.margem < MARGEM_BAIXA ? "text-negative" : ""}>{pct(l.margem)}</span>}
                        </Td>
                        <Td align="right" mono secundaria>
                          {l.taxaProblema == null ? "—" : <span className={l.taxaProblema >= CANCELAMENTO_ALTO ? "text-negative" : ""}>{pct(l.taxaProblema)}</span>}
                        </Td>
                        <Td align="center" secundaria>
                          {l.classe ? <span className={`font-medium ${COR_CLASSE[l.classe]}`}>{l.classe}</span> : <span className="text-text-tertiary">Parado</span>}
                        </Td>
                        <Td align="right" secundaria>
                          {l.anuncioId && (
                            <span className="flex justify-end gap-2 whitespace-nowrap text-xs">
                              <Link href={`/anuncio/analise/${l.anuncioId}`} className="text-accent hover:underline">
                                Analisar
                              </Link>
                              <Link href={`/precificacao/ajuste/${l.anuncioId}`} className="text-accent hover:underline">
                                Preço
                              </Link>
                            </span>
                          )}
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </Card>
          {filtradas.length > visiveisN && (
            <div className="mt-3 flex justify-center">
              <Button variant="ghost" size="sm" onClick={() => setVisiveisN((n) => n + PAGINA)}>
                Mostrar mais {Math.min(PAGINA, filtradas.length - visiveisN)} de {filtradas.length - visiveisN}
              </Button>
            </div>
          )}
          <p className="text-xs text-text-tertiary mt-3">
            Classe A = anúncios que juntos fazem os primeiros 80% do faturamento; B, até 95%; C, o restante. “Anúncio” agrupa todas as variações. Cancelados e devolvidos não entram no faturamento. O lucro do pedido é repartido entre os itens pelo valor de cada um. A variação compara com o período anterior de mesmo tamanho.
          </p>
        </>
      )}

      {exportando && <ExportarModal aberto onClose={() => setExportando(false)} titulo="Exportar ranking de anúncios" escopos={[{ id: "todos", rotulo: "Lista filtrada", quantidade: filtradas.length }]} montar={() => tabela} />}
    </>
  );
}

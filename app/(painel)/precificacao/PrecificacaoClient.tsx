"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Clock, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { formatBRL, formatarMargemPct, classeValor } from "@/lib/format";
import { paraCsv as paraCsvColunas, matrizParaCsv, baixarArquivo } from "@/lib/csv";
import {
  resolverPorMargem,
  resolverPorMarkup,
  resolverPorLucro,
  resultadoParaPreco,
  resultadoParaPrecoComFaixas,
  resolverComFaixas,
  formatarFaixaLabel,
  analisarConcorrencia,
  type ComponenteKit,
  type ModoCalculo,
  type Concorrente,
  type TaxasPlataforma,
  type ResultadoPrecificacao,
  MODOS,
  zonaMortaDeFaixa,
  type FaixaComissao,
  type ZonaMorta,
} from "@/lib/pricing";
import { CalculadoraEmMassa } from "@/components/precificacao/CalculadoraEmMassa";
import { VariacoesView } from "@/components/precificacao/VariacoesView";
import { PriceBreakdownChart } from "@/components/charts/PriceBreakdownChart";
import {
  type ResumoExport,
  precoPsicologico,
  DetalhamentoPrecificacao,
  useExportarPrecificacao,
  SimuladorPreco,
} from "@/components/precificacao/resultado-compartilhado";
import {
  salvarPrecificacao,
  atualizarPrecoProduto,
  removerPrecificacao,
  removerAnuncio,
  criarConcorrente,
  removerConcorrenteSalvo,
  gerarTituloAnuncioIA,
} from "./actions";
import { GeradorIA } from "@/components/ia/GeradorIA";
import { LIMITE_TITULO } from "@/lib/ia/prompts";
import { executarComToast } from "@/lib/acao-cliente";

export interface PrecificacaoHist {
  id: string;
  produto_nome: string;
  canal: string | null;
  titulo_anuncio: string | null;
  loja_id: string | null;
  componentes: ComponenteKit[] | null;
  taxa_extra_valor: number | null;
  taxa_extra_tipo: "percentual" | "fixo" | null;
  custo: number;
  taxa_variavel_pct: number;
  taxa_fixa: number;
  taxa_adicional_pct: number;
  imposto_pct: number;
  margem_pct: number | null;
  preco_calculado: number;
  lucro: number;
  criado_em: string;
  origem: "individual" | "em_massa";
}

export interface LojaOpcao {
  id: string;
  nome: string;
  canalNome: string;
  tipoTaxa: "faixas" | "fixo";
  comissaoPct: number;
  taxaFixa: number;
  taxaExtraValor: number | null;
  taxaExtraTipo: "percentual" | "fixo" | null;
  faixas: FaixaComissao[];
}

export interface VariacaoSalva {
  id: string;
  nome_variacao: string;
  multiplicador: number;
  custo: number;
  taxa_variavel_pct: number;
  taxa_fixa: number;
  taxa_adicional_pct: number;
  imposto_pct: number;
  taxa_extra_valor: number | null;
  taxa_extra_tipo: "percentual" | "fixo" | null;
  margem_pct: number | null;
  preco_calculado: number;
  lucro: number;
}

export interface AnuncioSalvo {
  id: string;
  nome_anuncio: string;
  titulo_anuncio: string | null;
  criado_em: string;
  variacoes: VariacaoSalva[];
}

export interface ProdutoOpcao {
  id: string;
  sku: string;
  nome: string;
  custo: number;
  preco_venda: number;
}

/**
 * Chave de lista para item ainda não salvo (insumo do kit, concorrente sem produto
 * vinculado). Antes eram dois contadores no escopo do módulo, mas reatribuir variável de
 * fora do componente é efeito colateral durante o render — o lint reclama, com razão, e o
 * contador ainda seria compartilhado entre montagens.
 */
let sequenciaLocal = 0;
function proximoIdLocal(prefixo: string): string {
  sequenciaLocal += 1;
  return `${prefixo}-${Date.now().toString(36)}-${sequenciaLocal}`;
}

// Identifica, dentro do JSONB de componentes salvo no histórico, a linha que representa
// o campo "Custo do Produto" (e não um insumo) — é o que permite recarregar no campo certo.
const ID_CUSTO_PRODUTO = "custo-produto";

export function PrecificacaoClient({
  historico,
  produtos,
  aliquotaDasPadrao,
  lojas,
  anuncios,
  concorrentesPorProduto,
  iaDisponivel,
}: {
  historico: PrecificacaoHist[];
  produtos: ProdutoOpcao[];
  aliquotaDasPadrao: number;
  lojas: LojaOpcao[];
  anuncios: AnuncioSalvo[];
  concorrentesPorProduto: Record<string, Concorrente[]>;
  /** Vem do servidor: `GEMINI_API_KEY` não pode ser lida no cliente. */
  iaDisponivel: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [visao, setVisao] = useState<"individual" | "variacoes" | "massa" | "historico">("individual");
  const [subAbaHistorico, setSubAbaHistorico] = useState<"precificacoes" | "produtos">("precificacoes");
  const [anuncioExpandidoHistorico, setAnuncioExpandidoHistorico] = useState<string | null>(null);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [nomeProduto, setNomeProduto] = useState("");
  const [nomeAnuncio, setNomeAnuncio] = useState("");
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [historicoDetalhe, setHistoricoDetalhe] = useState<PrecificacaoHist | null>(null);
  const [mostrarDetalheHistorico, setMostrarDetalheHistorico] = useState(false);
  const [mostrarDetalheResultado, setMostrarDetalheResultado] = useState(false);
  const [modo, setModo] = useState<ModoCalculo>("margem");
  const [margemPct, setMargemPct] = useState(28);
  const [markupPct, setMarkupPct] = useState(50);
  const [lucroDesejado, setLucroDesejado] = useState(30);
  const [precoFixo, setPrecoFixo] = useState(99.9);
  const [precoMinimo, setPrecoMinimo] = useState<number | "">("");
  const [precoMaximo, setPrecoMaximo] = useState<number | "">("");
  const [impostoPct, setImpostoPct] = useState(aliquotaDasPadrao);
  const [modoTaxas, setModoTaxas] = useState<"manual" | "loja">("manual");
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [taxaFixa, setTaxaFixa] = useState(4);
  const [taxaVariavelPct, setTaxaVariavelPct] = useState(20);
  const [taxaAdicionalPct, setTaxaAdicionalPct] = useState(0);
  const [filtroHistoricoTexto, setFiltroHistoricoTexto] = useState("");
  const [filtroHistoricoDataIni, setFiltroHistoricoDataIni] = useState("");
  const [filtroHistoricoDataFim, setFiltroHistoricoDataFim] = useState("");
  const { setPendenteExport, setPendenteImagem, modais: modaisExportacao } = useExportarPrecificacao();

  const [custoProduto, setCustoProduto] = useState(0);
  const [componentes, setComponentes] = useState<ComponenteKit[]>([]);

  const [concorrentes, setConcorrentes] = useState<Concorrente[]>([]);
  const [novoConcorrenteNome, setNovoConcorrenteNome] = useState("");
  const [novoConcorrentePreco, setNovoConcorrentePreco] = useState<number | "">("");
  const [novoConcorrenteLink, setNovoConcorrenteLink] = useState("");

  const custoInsumos = componentes.reduce((acc, c) => acc + c.quantidade * c.custoUnitario, 0);
  const custoTotal = custoProduto + custoInsumos;

  const lojaSelecionada = useMemo(() => lojas.find((l) => l.id === lojaId) ?? null, [lojas, lojaId]);

  const taxas: TaxasPlataforma = useMemo(() => {
    if (modoTaxas === "loja" && lojaSelecionada && lojaSelecionada.tipoTaxa === "fixo") {
      return {
        impostoPct: impostoPct / 100,
        taxaFixa: lojaSelecionada.taxaFixa,
        taxaVariavelPct: lojaSelecionada.comissaoPct / 100,
        taxaAdicionalPct: taxaAdicionalPct / 100,
        taxaExtraValor: lojaSelecionada.taxaExtraValor ?? undefined,
        taxaExtraTipo: lojaSelecionada.taxaExtraTipo,
      };
    }
    return {
      impostoPct: impostoPct / 100,
      taxaFixa,
      taxaVariavelPct: taxaVariavelPct / 100,
      taxaAdicionalPct: taxaAdicionalPct / 100,
    };
  }, [modoTaxas, lojaSelecionada, impostoPct, taxaFixa, taxaVariavelPct, taxaAdicionalPct]);

  const taxasBaseFaixas = useMemo(
    () => ({
      impostoPct: impostoPct / 100,
      taxaAdicionalPct: taxaAdicionalPct / 100,
      taxaExtraValor: lojaSelecionada?.taxaExtraValor ?? undefined,
      taxaExtraTipo: lojaSelecionada?.taxaExtraTipo ?? null,
    }),
    [impostoPct, taxaAdicionalPct, lojaSelecionada],
  );

  const usaFaixas = modoTaxas === "loja" && lojaSelecionada?.tipoTaxa === "faixas";

  const { resultado, faixaShopee } = useMemo(() => {
    const parametro =
      modo === "margem" ? margemPct / 100 : modo === "markup" ? markupPct / 100 : modo === "lucro" ? lucroDesejado : precoFixo;

    if (usaFaixas && lojaSelecionada) {
      const { resultado: r, faixa } = resolverComFaixas(custoTotal, modo, parametro, taxasBaseFaixas, lojaSelecionada.faixas);
      return { resultado: r, faixaShopee: faixa as FaixaComissao | null };
    }
    let r;
    if (modo === "margem") r = resolverPorMargem(custoTotal, margemPct / 100, taxas);
    else if (modo === "markup") r = resolverPorMarkup(custoTotal, markupPct / 100, taxas);
    else if (modo === "lucro") r = resolverPorLucro(custoTotal, lucroDesejado, taxas);
    else r = resultadoParaPreco(precoFixo, custoTotal, taxas);
    return { resultado: r, faixaShopee: null as FaixaComissao | null };
  }, [usaFaixas, lojaSelecionada, custoTotal, modo, margemPct, markupPct, lucroDesejado, precoFixo, taxas, taxasBaseFaixas]);

  /** Lucro no menor e no maior preço que o usuário aceitaria vender — cada ponta pode cair
   * numa faixa de comissão diferente da do preço recomendado, por isso resolve de novo. */
  const resultadoNoPreco = useMemo(() => {
    return (preco: number): ResultadoPrecificacao =>
      usaFaixas && lojaSelecionada
        ? resultadoParaPrecoComFaixas(preco, custoTotal, taxasBaseFaixas, lojaSelecionada.faixas)
        : resultadoParaPreco(preco, custoTotal, taxas);
  }, [usaFaixas, lojaSelecionada, custoTotal, taxasBaseFaixas, taxas]);

  /**
   * A armadilha das faixas da Shopee: passar do piso de uma faixa pode fazer o vendedor
   * RECEBER MENOS vendendo MAIS CARO. Ver `zonaMortaDeFaixa` em `lib/pricing.ts`.
   */
  const zonaMorta = useMemo(
    () =>
      usaFaixas && lojaSelecionada && resultado.viavel
        ? zonaMortaDeFaixa(lojaSelecionada.faixas, resultado.precoVenda)
        : null,
    [usaFaixas, lojaSelecionada, resultado],
  );

  /** Passa para o modo "preço" fixo no valor que rende mais — o cálculo refaz sozinho. */
  function aplicarPrecoMelhor(preco: number) {
    setModo("preco");
    setPrecoFixo(preco);
    toast.success(`Preço ajustado para ${formatBRL(preco)}`);
  }

  const resultadoMin = useMemo(
    () => (precoMinimo !== "" && precoMinimo > 0 && custoTotal > 0 ? resultadoNoPreco(precoMinimo) : null),
    [precoMinimo, custoTotal, resultadoNoPreco],
  );
  const resultadoMax = useMemo(
    () => (precoMaximo !== "" && precoMaximo > 0 && custoTotal > 0 ? resultadoNoPreco(precoMaximo) : null),
    [precoMaximo, custoTotal, resultadoNoPreco],
  );

  const taxaVariavelPctEfetiva =
    modoTaxas === "loja" && lojaSelecionada
      ? faixaShopee
        ? faixaShopee.comissaoPct / 100
        : lojaSelecionada.comissaoPct / 100
      : taxaVariavelPct / 100;
  const taxaFixaEfetiva =
    modoTaxas === "loja" && lojaSelecionada ? (faixaShopee ? faixaShopee.tarifaFixa : lojaSelecionada.taxaFixa) : taxaFixa;
  const taxaExtraValorEfetivo = modoTaxas === "loja" ? (lojaSelecionada?.taxaExtraValor ?? null) : null;
  const taxaExtraTipoEfetivo = modoTaxas === "loja" ? (lojaSelecionada?.taxaExtraTipo ?? null) : null;

  function atualizarComponente(id: string, campo: keyof ComponenteKit, valor: string) {
    setComponentes((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [campo]: campo === "nome" ? valor : Number(valor) || 0 } : c)),
    );
  }

  function adicionarComponente() {
    setComponentes((prev) => [...prev, { id: proximoIdLocal("novo"), nome: "Novo insumo", quantidade: 1, custoUnitario: 0 }]);
  }

  function removerComponente(id: string) {
    setComponentes((prev) => prev.filter((c) => c.id !== id));
  }

  const sugestoesProdutos = useMemo(() => {
    const q = nomeProduto.trim().toLowerCase();
    if (!q) return [];
    return produtos.filter((p) => p.nome.toLowerCase().includes(q)).slice(0, 6);
  }, [nomeProduto, produtos]);

  const produtoVinculado = useMemo(() => produtos.find((p) => p.id === produtoId) ?? null, [produtos, produtoId]);

  useEffect(() => {
    if (produtoId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza concorrentes salvos ao trocar de produto vinculado
      setConcorrentes(concorrentesPorProduto[produtoId] ?? []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só recarrega quando o produto vinculado muda, não a cada nova lista de concorrentes recebida
  }, [produtoId]);

  const canaisAgrupados = useMemo(() => Array.from(new Set(lojas.map((l) => l.canalNome))), [lojas]);

  const historicoFiltrado = useMemo(() => {
    return historico.filter((h) => {
      const passaTexto = !filtroHistoricoTexto.trim() || h.produto_nome.toLowerCase().includes(filtroHistoricoTexto.trim().toLowerCase());
      const dataItem = h.criado_em.slice(0, 10);
      const passaIni = !filtroHistoricoDataIni || dataItem >= filtroHistoricoDataIni;
      const passaFim = !filtroHistoricoDataFim || dataItem <= filtroHistoricoDataFim;
      return passaTexto && passaIni && passaFim;
    });
  }, [historico, filtroHistoricoTexto, filtroHistoricoDataIni, filtroHistoricoDataFim]);

  const analiseConcorrencia = useMemo(
    () => analisarConcorrencia(resultado, concorrentes, taxas),
    [resultado, concorrentes, taxas],
  );

  async function adicionarConcorrente() {
    if (!novoConcorrenteNome.trim()) return toast.error("Informe o nome do concorrente.");
    if (novoConcorrentePreco === "" || novoConcorrentePreco <= 0) {
      return toast.error("Informe um preço maior que zero para o concorrente.");
    }
    const dados = {
      nome: novoConcorrenteNome.trim(),
      preco: Number(novoConcorrentePreco),
      link: novoConcorrenteLink.trim() || null,
    };
    if (produtoId) {
      // Só limpa os campos depois que o servidor confirmou: antes eles eram esvaziados
      // primeiro e uma falha levava embora nome, preço e link digitados.
      const r = await executarComToast(criarConcorrente(produtoId, dados), { erro: "Erro ao salvar concorrente" });
      if (r.ok) {
        setConcorrentes((prev) => [...prev, r.dado]);
        limparCamposConcorrente();
      }
      return;
    }
    setConcorrentes((prev) => [...prev, { id: proximoIdLocal("conc"), ...dados }]);
    limparCamposConcorrente();
  }

  function limparCamposConcorrente() {
    setNovoConcorrenteNome("");
    setNovoConcorrentePreco("");
    setNovoConcorrenteLink("");
  }

  async function removerConcorrente(id: string) {
    const anteriores = concorrentes;
    setConcorrentes((prev) => prev.filter((c) => c.id !== id));
    if (produtoId) {
      const r = await executarComToast(removerConcorrenteSalvo(id), { erro: "Erro ao remover concorrente" });
      // Sem o rollback, o item sumia da tela mas continuava no banco e voltava no reload.
      if (!r.ok) setConcorrentes(anteriores);
    }
  }

  function resumoAtual(): ResumoExport {
    return {
      titulo: nomeAnuncio.trim() || nomeProduto || "Produto",
      precoVenda: resultado.precoVenda,
      custoTotal: resultado.custoTotal,
      taxaVariavelValor: resultado.taxaVariavelValor,
      taxaVariavelPct: taxaVariavelPctEfetiva,
      taxaFixa: taxaFixaEfetiva,
      taxaAdicionalValor: resultado.taxaAdicionalValor,
      taxaAdicionalPct: taxaAdicionalPct / 100,
      impostoValor: resultado.impostoValor,
      impostoPct: impostoPct / 100,
      taxaExtraCalculada: resultado.taxaExtraCalculada,
      lucroLiquido: resultado.lucroLiquido,
      margemEfetivaPct: resultado.margemEfetivaPct,
      componentes,
      faixaVenda:
        resultadoMin && resultadoMax
          ? {
              precoMinimo: resultadoMin.precoVenda,
              precoMaximo: resultadoMax.precoVenda,
              lucroMinimo: resultadoMin.lucroLiquido,
              margemMinimaPct: resultadoMin.margemEfetivaPct,
              lucroMaximo: resultadoMax.lucroLiquido,
              margemMaximaPct: resultadoMax.margemEfetivaPct,
            }
          : null,
    };
  }

  function resumoDoHistorico(h: PrecificacaoHist): ResumoExport {
    const taxaExtraCalculada =
      h.taxa_extra_tipo === "percentual"
        ? h.preco_calculado * ((h.taxa_extra_valor ?? 0) / 100)
        : h.taxa_extra_tipo === "fixo"
          ? (h.taxa_extra_valor ?? 0)
          : 0;
    return {
      titulo: h.titulo_anuncio || h.produto_nome,
      precoVenda: h.preco_calculado,
      custoTotal: h.custo,
      taxaVariavelValor: h.preco_calculado * h.taxa_variavel_pct,
      taxaVariavelPct: h.taxa_variavel_pct,
      taxaFixa: h.taxa_fixa,
      taxaAdicionalValor: h.preco_calculado * h.taxa_adicional_pct,
      taxaAdicionalPct: h.taxa_adicional_pct,
      impostoValor: h.preco_calculado * h.imposto_pct,
      impostoPct: h.imposto_pct,
      taxaExtraCalculada,
      lucroLiquido: h.lucro,
      margemEfetivaPct: h.preco_calculado > 0 ? h.lucro / h.preco_calculado : 0,
      componentes: h.componentes,
      faixaVenda: null,
    };
  }

  function selecionarSugestao(produto: ProdutoOpcao) {
    setNomeProduto(produto.nome);
    setProdutoId(produto.id);
    setSugestoesAbertas(false);
  }

  function exportarHistoricoCsv() {
    const cabecalho = ["Data", "Produto/Kit", "Canal", "Custo", "Preço Venda", "Lucro", "Margem %"];
    const linhas = historicoFiltrado.map((h) => [
      new Date(h.criado_em).toLocaleDateString("pt-BR"),
      h.produto_nome,
      h.canal ?? "",
      h.custo.toFixed(2),
      h.preco_calculado.toFixed(2),
      h.lucro.toFixed(2),
      h.preco_calculado > 0 ? ((h.lucro / h.preco_calculado) * 100).toFixed(1) : "0.0",
    ]);
    baixarArquivo("historico-precificacoes.csv", matrizParaCsv([cabecalho, ...linhas]));
  }

  function duplicarHistorico(h: PrecificacaoHist) {
    setNomeProduto(h.produto_nome);
    setNomeAnuncio(h.titulo_anuncio ?? "");
    setProdutoId(null);
    if (h.loja_id && lojas.some((l) => l.id === h.loja_id)) {
      setModoTaxas("loja");
      setLojaId(h.loja_id);
    } else {
      setModoTaxas("manual");
      setLojaId(null);
      setTaxaVariavelPct(h.taxa_variavel_pct * 100);
      setTaxaFixa(h.taxa_fixa);
    }
    setTaxaAdicionalPct(h.taxa_adicional_pct * 100);
    setImpostoPct(h.imposto_pct * 100);
    if (h.margem_pct !== null) {
      setModo("margem");
      setMargemPct(h.margem_pct * 100);
    } else {
      setModo("preco");
      setPrecoFixo(h.preco_calculado);
    }
    const salvos = h.componentes ?? [];
    const doProduto = salvos.find((c) => c.id === ID_CUSTO_PRODUTO);
    const insumos = salvos.filter((c) => c.id !== ID_CUSTO_PRODUTO);
    if (doProduto) {
      setCustoProduto(doProduto.custoUnitario);
      setComponentes(insumos);
    } else if (insumos.length > 0) {
      setCustoProduto(0);
      setComponentes(insumos);
    } else {
      setCustoProduto(h.custo);
      setComponentes([]);
    }
    setVisao("individual");
    toast.success("Precificação carregada no formulário");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removerHistorico(h: PrecificacaoHist) {
    const ok = await confirm({
      title: "Remover precificação?",
      message: `A precificação de "${h.produto_nome}" (${new Date(h.criado_em).toLocaleDateString("pt-BR")}) será removida definitivamente.`,
    });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerPrecificacao(h.id), { sucesso: "Precificação removida", erro: "Erro ao remover precificação" });
    });
  }

  async function excluirAnuncioHistorico(a: AnuncioSalvo) {
    const ok = await confirm({ title: "Remover produto?", message: `"${a.nome_anuncio}" e suas variações serão removidas definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerAnuncio(a.id), { sucesso: "Produto removido", erro: "Erro ao remover produto" });
    });
  }

  function exportarAnunciosCsv() {
    const linhas = anuncios.flatMap((a) =>
      a.variacoes.map((v) => ({
        data: new Date(a.criado_em).toLocaleDateString("pt-BR"),
        produto: a.nome_anuncio,
        variacao: v.nome_variacao,
        multiplicador: String(v.multiplicador),
        custo: v.custo.toFixed(2),
        preco: v.preco_calculado.toFixed(2),
        lucro: v.lucro.toFixed(2),
        margem: v.preco_calculado > 0 ? ((v.lucro / v.preco_calculado) * 100).toFixed(1) : "0.0",
      })),
    );
    baixarArquivo(
      "produtos-com-variacoes.csv",
      paraCsvColunas(linhas, ["data", "produto", "variacao", "multiplicador", "custo", "preco", "lucro", "margem"]),
    );
  }

  function salvar() {
    if (!nomeProduto.trim() || !resultado.viavel) {
      toast.error("Preencha o nome do produto e garanta um resultado viável antes de salvar");
      return;
    }
    const componentesSalvos: ComponenteKit[] =
      custoProduto > 0
        ? [{ id: ID_CUSTO_PRODUTO, nome: "Custo do produto", quantidade: 1, custoUnitario: custoProduto }, ...componentes]
        : componentes;
    startTransition(async () => {
      const r = await executarComToast(
        salvarPrecificacao({
          produto_id: produtoId,
          produto_nome: nomeProduto,
          canal: lojaSelecionada ? `${lojaSelecionada.canalNome} — ${lojaSelecionada.nome}` : null,
          titulo_anuncio: nomeAnuncio.trim() || null,
          loja_id: modoTaxas === "loja" ? lojaId : null,
          componentes: componentesSalvos,
          taxa_extra_valor: taxaExtraValorEfetivo,
          taxa_extra_tipo: taxaExtraTipoEfetivo,
          custo: resultado.custoTotal,
          taxa_variavel_pct: taxaVariavelPctEfetiva,
          taxa_fixa: taxaFixaEfetiva,
          taxa_adicional_pct: taxaAdicionalPct / 100,
          imposto_pct: impostoPct / 100,
          margem_pct: modo === "margem" ? margemPct / 100 : null,
          preco_calculado: resultado.precoVenda,
          lucro: resultado.lucroLiquido,
          origem: "individual",
        }),
        { sucesso: "Anúncio salvo no histórico", erro: "Erro ao salvar precificação" },
      );
      if (!r.ok) return;

      // Só oferece atualizar o preço do produto depois que o histórico gravou: antes, uma
      // falha ao salvar caía no mesmo `catch` e o usuário nem chegava a ser perguntado.
      if (produtoId) {
        const ok = await confirm({
          title: "Atualizar preço do produto?",
          message: `Atualizar o preço de venda de "${nomeProduto}" para ${formatBRL(resultado.precoVenda)}?`,
          confirmLabel: "Atualizar",
        });
        if (ok) {
          await executarComToast(atualizarPrecoProduto(produtoId, resultado.precoVenda), {
            sucesso: "Preço do produto atualizado",
            erro: "Erro ao atualizar o preço do produto",
          });
        }
      }
    });
  }

  return (
    <>
      <PageHeader title="Calculadora de Precificação" />

      <div className="flex items-center justify-between gap-2 mb-5 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setVisao("individual")}
            className={`h-9 px-4 rounded-md text-sm border transition-colors ${
              visao === "individual"
                ? "bg-accent-soft border-accent-soft text-accent font-medium"
                : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
            }`}
          >
            Individual
          </button>
          <button
            onClick={() => setVisao("variacoes")}
            className={`h-9 px-4 rounded-md text-sm border transition-colors ${
              visao === "variacoes"
                ? "bg-accent-soft border-accent-soft text-accent font-medium"
                : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
            }`}
          >
            Variações
          </button>
          <button
            onClick={() => setVisao("massa")}
            className={`h-9 px-4 rounded-md text-sm border transition-colors ${
              visao === "massa"
                ? "bg-accent-soft border-accent-soft text-accent font-medium"
                : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
            }`}
          >
            Em Massa
          </button>
        </div>
        <button
          onClick={() => setVisao("historico")}
          className={`h-9 px-4 rounded-md text-sm border transition-colors flex items-center gap-1.5 ${
            visao === "historico"
              ? "bg-accent-soft border-accent-soft text-accent font-medium"
              : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
          }`}
        >
          <Clock size={14} />
          Histórico
        </button>
      </div>

      {visao === "massa" && <CalculadoraEmMassa produtos={produtos} lojas={lojas} historico={historico} setVisao={setVisao} />}

      {visao === "variacoes" && (
        <VariacoesView
          produtos={produtos}
          lojas={lojas}
          anuncios={anuncios}
          aliquotaDasPadrao={aliquotaDasPadrao}
          confirm={confirm}
          setVisao={setVisao}
          exportarAnunciosCsv={exportarAnunciosCsv}
          iaDisponivel={iaDisponivel}
        />
      )}

      {visao === "individual" && (
      <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="relative mb-3">
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Nome do Produto <span className="text-negative">*</span>
              </label>
              <input
                value={nomeProduto}
                onChange={(e) => {
                  setNomeProduto(e.target.value);
                  setProdutoId(null);
                  setSugestoesAbertas(true);
                }}
                onFocus={() => setSugestoesAbertas(true)}
                onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
                className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
                placeholder="Insira aqui Nome do Produto"
              />
              {sugestoesAbertas && sugestoesProdutos.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface-1 border border-border rounded-md shadow-lg max-h-48 overflow-auto">
                  {sugestoesProdutos.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selecionarSugestao(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-2 text-text-primary"
                    >
                      <span className="font-mono text-xs text-text-tertiary">{p.sku}</span> — {p.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">Nome do Anúncio</label>
            <input
              value={nomeAnuncio}
              onChange={(e) => setNomeAnuncio(e.target.value)}
              className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
              placeholder="Insira aqui Nome do Anúncio"
            />
            {/* `key` pelo produto: trocar de produto zera a sugestão sem useEffect. */}
            <div className="mb-3">
              <GeradorIA
                key={`ia-titulo-${produtoId ?? nomeProduto}`}
                rotulo="Gerar título com IA"
                limite={LIMITE_TITULO}
                valorAtual={nomeAnuncio}
                disponivel={iaDisponivel}
                desabilitado={!nomeProduto.trim()}
                motivoDesabilitado={!nomeProduto.trim() ? "Informe o nome do produto primeiro." : undefined}
                gerar={(instrucaoExtra) =>
                  gerarTituloAnuncioIA({
                    produtoNome: nomeProduto,
                    sku: produtos.find((p) => p.id === produtoId)?.sku ?? null,
                    canal: lojaSelecionada?.canalNome ?? null,
                    loja: lojaSelecionada?.nome ?? null,
                    custo: custoTotal,
                    precoCalculado: resultado.viavel ? resultado.precoVenda : null,
                    componentes: componentes.map((c) => ({ nome: c.nome, quantidade: c.quantidade })),
                    // Só nome e preço: o link do concorrente não entra no prompt.
                    concorrentes: concorrentes.map((c) => ({ nome: c.nome, preco: c.preco })),
                    instrucaoExtra,
                  })
                }
                onUsar={setNomeAnuncio}
              />
            </div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Custo do Produto (R$) <span className="text-negative">*</span>
            </label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={custoProduto || ""}
              onChange={(e) => setCustoProduto(Number(e.target.value) || 0)}
              className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
              placeholder="0,00"
            />
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-text-primary">Composição de Insumos e Embalagem</h3>
              <button onClick={adicionarComponente} className="text-sm text-accent hover:underline">
                + Adicionar Insumo
              </button>
            </div>
            <Table>
              <Thead>
                <tr>
                  <Th>Componente</Th>
                  <Th align="right">Qtd</Th>
                  <Th align="right">Custo Unit.</Th>
                  <Th align="right">Subtotal</Th>
                  <Th></Th>
                </tr>
              </Thead>
              <tbody>
                {componentes.map((c) => (
                  <Tr key={c.id}>
                    <Td>
                      <input
                        value={c.nome}
                        onChange={(e) => atualizarComponente(c.id, "nome", e.target.value)}
                        className="w-full bg-transparent text-text-primary outline-none"
                      />
                    </Td>
                    <Td align="right">
                      <input
                        type="number"
                        min={0}
                        value={c.quantidade}
                        onChange={(e) => atualizarComponente(c.id, "quantidade", e.target.value)}
                        className="w-14 bg-transparent text-text-primary text-right outline-none tabular"
                      />
                    </Td>
                    <Td align="right">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={c.custoUnitario}
                        onChange={(e) => atualizarComponente(c.id, "custoUnitario", e.target.value)}
                        className="w-20 bg-transparent text-text-primary text-right outline-none tabular"
                      />
                    </Td>
                    <Td align="right" mono>
                      {formatBRL(c.quantidade * c.custoUnitario)}
                    </Td>
                    <Td align="right">
                      <button onClick={() => removerComponente(c.id)} className="text-text-tertiary hover:text-negative">
                        ×
                      </button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="mt-3 pt-3 border-t border-border space-y-1.5">
              <div className="flex items-center justify-between text-sm text-text-secondary">
                <span>Custo do produto</span>
                <span className="font-mono">{formatBRL(custoProduto)}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-text-secondary">
                <span>Insumos</span>
                <span className="font-mono">{formatBRL(custoInsumos)}</span>
              </div>
              <div className="flex items-center justify-between pt-1.5 border-t border-border">
                <span className="text-sm text-text-secondary">Custo Total Direto</span>
                <span className="font-mono text-text-primary font-semibold">{formatBRL(custoTotal)}</span>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-medium text-text-primary mb-3">Taxas da Plataforma</h3>
            <div className="flex gap-2 mb-4 flex-wrap">
              <button
                onClick={() => setModoTaxas("manual")}
                className={`h-9 px-3 rounded-md text-sm border transition-colors ${
                  modoTaxas === "manual"
                    ? "bg-accent-soft border-accent-soft text-accent font-medium"
                    : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
                }`}
              >
                Manual
              </button>
              <button
                onClick={() => setModoTaxas("loja")}
                className={`h-9 px-3 rounded-md text-sm border transition-colors ${
                  modoTaxas === "loja"
                    ? "bg-accent-soft border-accent-soft text-accent font-medium"
                    : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
                }`}
              >
                Selecionar Loja
              </button>
            </div>

            {modoTaxas === "loja" && (
              <div className="mb-4">
                {lojas.length > 0 ? (
                  <>
                    <label className="text-xs text-text-secondary mb-1.5 block">Loja</label>
                    <select
                      value={lojaId ?? ""}
                      onChange={(e) => setLojaId(e.target.value || null)}
                      className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
                    >
                      <option value="">Selecione…</option>
                      {canaisAgrupados.map((canalNome) => (
                        <optgroup label={canalNome} key={canalNome}>
                          {lojas
                            .filter((l) => l.canalNome === canalNome)
                            .map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.nome}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    {lojaSelecionada &&
                      (lojaSelecionada.tipoTaxa === "faixas" ? (
                        faixaShopee && (
                          <>
                            <p className="text-xs text-text-tertiary mt-2 bg-surface-2 rounded-md p-2">
                              Faixa aplicada: {formatarFaixaLabel(faixaShopee)} · comissão {faixaShopee.comissaoPct}% + {formatBRL(faixaShopee.tarifaFixa)}
                            </p>
                            <AvisoZonaMorta zona={zonaMorta} onAplicar={aplicarPrecoMelhor} />
                          </>
                        )
                      ) : (
                        <p className="text-xs text-text-tertiary mt-2">
                          Comissão {lojaSelecionada.comissaoPct}% · Taxa fixa {formatBRL(lojaSelecionada.taxaFixa)}
                          {lojaSelecionada.taxaExtraValor != null &&
                            lojaSelecionada.taxaExtraTipo &&
                            ` · Extra ${
                              lojaSelecionada.taxaExtraTipo === "percentual"
                                ? `${lojaSelecionada.taxaExtraValor}%`
                                : formatBRL(lojaSelecionada.taxaExtraValor)
                            }`}
                        </p>
                      ))}
                  </>
                ) : (
                  <p className="text-xs text-text-tertiary">
                    Nenhuma loja cadastrada ainda. Cadastre em Configurações → Canais de Venda.
                  </p>
                )}
              </div>
            )}

            {modoTaxas === "manual" && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs text-text-secondary mb-1.5 block">Taxa Fixa (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={taxaFixa}
                    onChange={(e) => setTaxaFixa(Number(e.target.value) || 0)}
                    className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-xs text-text-secondary mb-1.5 block">Taxa Variável (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={taxaVariavelPct}
                    onChange={(e) => setTaxaVariavelPct(Number(e.target.value) || 0)}
                    className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Taxa Adicional (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={taxaAdicionalPct}
                  onChange={(e) => setTaxaAdicionalPct(Number(e.target.value) || 0)}
                  className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Imposto / DAS (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={impostoPct}
                  onChange={(e) => setImpostoPct(Number(e.target.value) || 0)}
                  className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                />
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-medium text-text-primary mb-3">Como calcular o preço</h3>
            <div className="flex gap-2 mb-4 flex-wrap">
              {MODOS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModo(m.id)}
                  className={`h-9 px-3 rounded-md text-sm border transition-colors ${
                    modo === m.id
                      ? "bg-accent-soft border-accent-soft text-accent font-medium"
                      : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {modo === "margem" && (
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Margem Líquida Alvo (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={margemPct}
                  onChange={(e) => setMargemPct(Number(e.target.value) || 0)}
                  className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                />
              </div>
            )}
            {modo === "markup" && (
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Markup sobre o Custo (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={markupPct}
                  onChange={(e) => setMarkupPct(Number(e.target.value) || 0)}
                  className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                />
                <p className="text-xs text-text-tertiary mt-1.5">
                  Diferente da margem: markup é o lucro sobre o custo (ex.: 50% de markup num custo de R$ 10 dá R$ 5 de
                  lucro), enquanto margem é o lucro sobre o preço de venda.
                </p>
              </div>
            )}
            {modo === "lucro" && (
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Lucro Líquido Desejado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={lucroDesejado}
                  onChange={(e) => setLucroDesejado(Number(e.target.value) || 0)}
                  className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                />
              </div>
            )}
            {modo === "preco" && (
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Preço de Venda (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={precoFixo}
                  onChange={(e) => setPrecoFixo(Number(e.target.value) || 0)}
                  className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                />
              </div>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-medium text-text-primary mb-1">Preços dos Concorrentes</h3>
            <p className="text-xs text-text-tertiary mb-3">
              Adicione o preço de anúncios parecidos para receber uma sugestão de posicionamento.
              {produtoId ? " Salvo automaticamente neste produto." : " Vincule a um produto cadastrado para salvar e reaproveitar depois."}
            </p>
            <div className="flex gap-2 mb-3 flex-wrap">
              <input
                value={novoConcorrenteNome}
                onChange={(e) => setNovoConcorrenteNome(e.target.value)}
                placeholder="Loja / anúncio concorrente"
                className="flex-1 min-w-[140px] h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
              />
              <input
                value={novoConcorrenteLink}
                onChange={(e) => setNovoConcorrenteLink(e.target.value)}
                placeholder="Link (opcional)"
                className="flex-1 min-w-[140px] h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
              />
              <input
                type="number"
                step="0.01"
                value={novoConcorrentePreco}
                onChange={(e) => setNovoConcorrentePreco(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Preço"
                className="w-28 h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-sm text-text-primary outline-none focus:border-accent"
              />
              <Button variant="secondary" onClick={adicionarConcorrente}>
                Adicionar
              </Button>
            </div>
            {concorrentes.length > 0 && (
              <div className="border border-border rounded-md divide-y divide-border">
                {concorrentes.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <span className="text-text-primary">{c.nome}</span>
                      {c.link && (
                        <>
                          {" · "}
                          <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                            ver anúncio
                          </a>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-text-secondary">{formatBRL(c.preco)}</span>
                      <button onClick={() => removerConcorrente(c.id)} className="text-text-tertiary hover:text-negative">
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className={resultado.viavel ? "" : "border-negative/30 bg-negative-soft"}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-text-tertiary uppercase">Resultado</span>
              <StatusChip label={resultado.viavel ? "Viável" : "Inviável"} tone={resultado.viavel ? "positive" : "negative"} />
            </div>
            <div className="text-center py-4">
              <div className="text-xs text-text-tertiary mb-1">
                {modo === "preco" ? "Preço Informado" : "Preço de Venda Recomendado"}
              </div>
              <div className="font-mono text-4xl font-semibold text-accent">{formatBRL(resultado.precoVenda)}</div>
              {resultado.precoVenda > 0 && precoPsicologico(resultado.precoVenda) !== resultado.precoVenda && (
                <button
                  onClick={() => {
                    setModo("preco");
                    setPrecoFixo(precoPsicologico(resultado.precoVenda));
                  }}
                  className="text-xs text-accent hover:underline mt-1"
                >
                  Sugestão psicológica: {formatBRL(precoPsicologico(resultado.precoVenda))} · Usar
                </button>
              )}
              {produtoVinculado && (
                <div className="text-xs text-text-tertiary mt-2">
                  Preço atual do produto: {formatBRL(produtoVinculado.preco_venda)}
                  {produtoVinculado.preco_venda > 0 && (
                    <span className={resultado.precoVenda >= produtoVinculado.preco_venda ? "text-positive" : "text-negative"}>
                      {" "}
                      ({resultado.precoVenda >= produtoVinculado.preco_venda ? "+" : ""}
                      {(((resultado.precoVenda - produtoVinculado.preco_venda) / produtoVinculado.preco_venda) * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border text-sm space-y-1.5">
              <DetalhamentoPrecificacao
                aberto={mostrarDetalheResultado}
                onToggle={() => setMostrarDetalheResultado((v) => !v)}
                componentes={componentes}
                custoTotal={resultado.custoTotal}
                taxaVariavelValor={resultado.taxaVariavelValor}
                taxaVariavelPct={taxaVariavelPctEfetiva}
                taxaFixa={taxaFixaEfetiva}
                taxaAdicionalValor={resultado.taxaAdicionalValor}
                taxaAdicionalPct={taxaAdicionalPct / 100}
                taxaExtraCalculada={resultado.taxaExtraCalculada}
                impostoValor={resultado.impostoValor}
                impostoPct={impostoPct / 100}
              />
              <div className="flex justify-between font-medium pt-1.5 border-t border-border">
                <span className="text-text-primary">Lucro líquido</span>
                <span className={`font-mono ${resultado.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
                  {formatBRL(resultado.lucroLiquido)} ({(resultado.margemEfetivaPct * 100).toFixed(1)}%)
                </span>
              </div>
              <div className="flex justify-between text-text-tertiary text-xs">
                <span>Margem sobre custo</span>
                <span className="font-mono">{(resultado.markupSobreCustoPct * 100).toFixed(1)}%</span>
              </div>
            </div>

            <div className="mt-3">
              <SimuladorPreco
                custoTotal={resultado.custoTotal}
                taxas={{
                  impostoPct: impostoPct / 100,
                  taxaFixa: taxaFixaEfetiva,
                  taxaVariavelPct: taxaVariavelPctEfetiva,
                  taxaAdicionalPct: taxaAdicionalPct / 100,
                  taxaExtraValor: taxaExtraValorEfetivo ?? undefined,
                  taxaExtraTipo: taxaExtraTipoEfetivo,
                }}
              />
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setPendenteExport({ acao: "copiar", dados: resumoAtual() })}
              >
                Copiar
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setPendenteExport({ acao: "whatsapp", dados: resumoAtual() })}
              >
                Enviar WhatsApp
              </Button>
            </div>
            <Button variant="secondary" className="w-full mt-2" onClick={() => setPendenteImagem(resumoAtual())}>
              Imagem
            </Button>
            <Button
              variant="primary"
              className="w-full mt-2"
              onClick={salvar}
              loading={pending}
              disabled={!nomeProduto.trim() || !resultado.viavel || resultado.custoTotal <= 0}
            >
              Salvar Anúncio
            </Button>
          </Card>

          <Card>
            <h3 className="text-sm font-medium text-text-primary mb-1">Faixa de Venda (opcional)</h3>
            <p className="text-xs text-text-tertiary mb-3">
              Defina o menor e o maior preço que você aceitaria vender para ver o lucro mínimo e máximo possível — útil
              pra negociar com o cliente sem perder dinheiro.
            </p>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Preço Mínimo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={precoMinimo}
                  onChange={(e) => setPrecoMinimo(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Ex: 79,90"
                  className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1.5 block">Preço Máximo (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={precoMaximo}
                  onChange={(e) => setPrecoMaximo(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="Ex: 129,90"
                  className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
                />
              </div>
            </div>
            {(resultadoMin || resultadoMax) && (
              <div className="grid grid-cols-2 gap-4 text-sm border-t border-border pt-3">
                <div>
                  <div className="text-xs text-text-tertiary mb-0.5">Lucro no mínimo</div>
                  {resultadoMin ? (
                    <span className={`font-mono ${resultadoMin.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
                      {formatBRL(resultadoMin.lucroLiquido)} ({(resultadoMin.margemEfetivaPct * 100).toFixed(1)}%)
                    </span>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </div>
                <div>
                  <div className="text-xs text-text-tertiary mb-0.5">Lucro no máximo</div>
                  {resultadoMax ? (
                    <span className={`font-mono ${resultadoMax.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
                      {formatBRL(resultadoMax.lucroLiquido)} ({(resultadoMax.margemEfetivaPct * 100).toFixed(1)}%)
                    </span>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <span className="text-xs font-medium text-text-tertiary uppercase block mb-2">Composição do Preço</span>
            <PriceBreakdownChart
              data={[
                { nome: "Custo", valor: resultado.custoTotal },
                {
                  nome: "Taxas da plataforma",
                  valor: taxaFixaEfetiva + resultado.taxaVariavelValor + resultado.taxaAdicionalValor + resultado.taxaExtraCalculada,
                },
                { nome: "Imposto", valor: resultado.impostoValor },
                { nome: "Lucro líquido", valor: Math.max(0, resultado.lucroLiquido) },
              ]}
            />
          </Card>

          {analiseConcorrencia ? null : (
            <Card>
              <span className="text-xs font-medium text-text-tertiary uppercase block mb-2">Estratégia Sugerida</span>
              <p className="text-sm text-text-secondary">
                Adicione o preço de anúncios concorrentes ao lado para receber uma sugestão de posicionamento de preço.
              </p>
            </Card>
          )}

          {analiseConcorrencia && (
            <Card>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-text-tertiary uppercase">Estratégia Sugerida</span>
                <StatusChip
                  label={
                    analiseConcorrencia.classificacao === "caro"
                      ? "Acima do mercado"
                      : analiseConcorrencia.classificacao === "barato"
                        ? "Abaixo do mercado"
                        : "Competitivo"
                  }
                  tone={
                    analiseConcorrencia.classificacao === "caro"
                      ? "negative"
                      : analiseConcorrencia.classificacao === "barato"
                        ? "neutral"
                        : "positive"
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div>
                  <div className="text-xs text-text-tertiary">Média concorrentes</div>
                  <div className="font-mono text-text-primary">{formatBRL(analiseConcorrencia.precoMedioConcorrentes)}</div>
                </div>
                <div>
                  <div className="text-xs text-text-tertiary">Faixa de preços</div>
                  <div className="font-mono text-text-primary">
                    {formatBRL(analiseConcorrencia.precoMinConcorrentes)} a {formatBRL(analiseConcorrencia.precoMaxConcorrentes)}
                  </div>
                </div>
              </div>
              <p className="text-sm text-text-secondary mb-3">{analiseConcorrencia.sugestao}</p>
              <div className="text-xs text-text-tertiary pt-3 border-t border-border">
                Se vender ao preço médio do mercado, seu lucro líquido seria{" "}
                <span className="font-mono text-text-primary">{formatBRL(analiseConcorrencia.resultadoNoPrecoMedio.lucroLiquido)}</span>{" "}
                ({(analiseConcorrencia.resultadoNoPrecoMedio.margemEfetivaPct * 100).toFixed(1)}%).
              </div>
              <p className="text-[11px] text-text-tertiary italic mt-3">
                Sugestão gerada por regras simples de comparação de preço. Em breve: recomendações mais precisas com IA.
              </p>
            </Card>
          )}
        </div>
      </div>

      <Card className="mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-text-primary">Precificações Salvas</h2>
          <div className="flex items-center gap-3">
            <button onClick={exportarHistoricoCsv} className="text-xs text-accent hover:underline">
              Exportar CSV
            </button>
            <button onClick={() => setVisao("historico")} className="text-xs text-accent hover:underline">
              Ver histórico completo →
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {historico
            .filter((h) => h.origem === "individual")
            .slice(0, 5)
            .map((h) => (
              <div key={h.id} className="flex items-center justify-between border border-border rounded-md px-3 py-2 text-sm">
                <div>
                  <div className="text-text-primary">{h.produto_nome}</div>
                  <div className="text-xs text-text-tertiary">{new Date(h.criado_em).toLocaleDateString("pt-BR")}</div>
                </div>
                <span className="font-mono text-accent">{formatBRL(h.preco_calculado)}</span>
              </div>
            ))}
          {historico.filter((h) => h.origem === "individual").length === 0 && (
            <p className="text-sm text-text-tertiary text-center py-4">Nenhuma precificação salva ainda.</p>
          )}
        </div>
      </Card>
      </>
      )}

      {visao === "historico" && (
        <>
          <div className="flex gap-2 mb-5">
            <button
              onClick={() => setSubAbaHistorico("precificacoes")}
              className={`h-8 px-3 rounded-md text-sm border transition-colors ${
                subAbaHistorico === "precificacoes"
                  ? "bg-surface-3 border-border text-text-primary font-medium"
                  : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
              }`}
            >
              Precificações
            </button>
            <button
              onClick={() => setSubAbaHistorico("produtos")}
              className={`h-8 px-3 rounded-md text-sm border transition-colors ${
                subAbaHistorico === "produtos"
                  ? "bg-surface-3 border-border text-text-primary font-medium"
                  : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
              }`}
            >
              Produtos com Variações
            </button>
          </div>

          {subAbaHistorico === "precificacoes" && (
            <>
              <Card className="p-0 overflow-hidden">
                <div className="px-5 pt-5 pb-4 flex items-center justify-between flex-wrap gap-3">
                  <h2 className="text-base font-semibold text-text-primary">Histórico de Precificações</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      value={filtroHistoricoTexto}
                      onChange={(e) => setFiltroHistoricoTexto(e.target.value)}
                      placeholder="Buscar por produto…"
                      className="h-8 px-3 bg-surface-1 border border-border rounded-md text-xs text-text-primary outline-none focus:border-accent w-40"
                    />
                    <input
                      type="date"
                      value={filtroHistoricoDataIni}
                      onChange={(e) => setFiltroHistoricoDataIni(e.target.value)}
                      className="h-8 px-2 bg-surface-1 border border-border rounded-md text-xs text-text-primary outline-none focus:border-accent"
                    />
                    <input
                      type="date"
                      value={filtroHistoricoDataFim}
                      onChange={(e) => setFiltroHistoricoDataFim(e.target.value)}
                      className="h-8 px-2 bg-surface-1 border border-border rounded-md text-xs text-text-primary outline-none focus:border-accent"
                    />
                    <button onClick={exportarHistoricoCsv} className="text-xs text-accent hover:underline shrink-0">
                      Exportar CSV
                    </button>
                  </div>
                </div>
                <Table>
                  <Thead>
                    <tr>
                      <Th>Data</Th>
                      <Th>Produto / Kit</Th>
                      <Th>Canal</Th>
                      <Th align="right">Custo</Th>
                      <Th align="right">Preço Venda</Th>
                      <Th align="right">Lucro</Th>
                      <Th align="right">Margem</Th>
                      <Th align="right"></Th>
                    </tr>
                  </Thead>
                  <tbody>
                    {historicoFiltrado.map((h) => (
                      <Tr key={h.id}>
                        <Td mono>{new Date(h.criado_em).toLocaleDateString("pt-BR")}</Td>
                        <Td>{h.produto_nome}</Td>
                        <Td className="text-text-secondary">{h.canal ?? "—"}</Td>
                        <Td align="right" mono>
                          {formatBRL(h.custo)}
                        </Td>
                        <Td align="right" mono className="text-accent">
                          {formatBRL(h.preco_calculado)}
                        </Td>
                        <Td align="right" mono>
                          {formatBRL(h.lucro)}
                        </Td>
                        <Td align="right" mono className={classeValor(h.lucro)}>
                          {formatarMargemPct(h.lucro, h.preco_calculado)}
                        </Td>
                        <Td align="right">
                          <RowMenu
                            actions={[
                              { label: "Ver", onClick: () => { setHistoricoDetalhe(h); setMostrarDetalheHistorico(false); } },
                              { label: "Duplicar", onClick: () => duplicarHistorico(h) },
                              { label: "Remover", onClick: () => removerHistorico(h), destructive: true },
                            ]}
                          />
                        </Td>
                      </Tr>
                    ))}
                    {historicoFiltrado.length === 0 && (
                      <Tr>
                        <Td align="center" className="text-text-tertiary text-center py-8">
                          Nenhuma precificação encontrada.
                        </Td>
                      </Tr>
                    )}
                  </tbody>
                </Table>
              </Card>

              <Modal open={!!historicoDetalhe} onClose={() => setHistoricoDetalhe(null)} title={historicoDetalhe?.produto_nome ?? ""}>
                {historicoDetalhe && (
                  <div className="space-y-4">
                    <div className="text-center py-2">
                      <div className="text-xs text-text-tertiary mb-1">Preço de Venda</div>
                      <div className="font-mono text-3xl font-semibold text-accent">{formatBRL(historicoDetalhe.preco_calculado)}</div>
                    </div>
                    <div className="text-sm space-y-1.5 border-t border-border pt-3">
                      <div className="flex justify-between text-text-secondary">
                        <span>Data</span>
                        <span className="font-mono text-text-primary">
                          {new Date(historicoDetalhe.criado_em).toLocaleDateString("pt-BR")}
                        </span>
                      </div>
                      {historicoDetalhe.canal && (
                        <div className="flex justify-between text-text-secondary">
                          <span>Canal</span>
                          <span className="text-text-primary">{historicoDetalhe.canal}</span>
                        </div>
                      )}
                      {historicoDetalhe.titulo_anuncio && (
                        <div className="flex justify-between text-text-secondary">
                          <span>Título do Anúncio</span>
                          <span className="text-text-primary text-right">{historicoDetalhe.titulo_anuncio}</span>
                        </div>
                      )}

                      <DetalhamentoPrecificacao
                        aberto={mostrarDetalheHistorico}
                        onToggle={() => setMostrarDetalheHistorico((v) => !v)}
                        componentes={historicoDetalhe.componentes}
                        custoTotal={historicoDetalhe.custo}
                        taxaVariavelValor={historicoDetalhe.preco_calculado * historicoDetalhe.taxa_variavel_pct}
                        taxaVariavelPct={historicoDetalhe.taxa_variavel_pct}
                        taxaFixa={historicoDetalhe.taxa_fixa}
                        taxaAdicionalValor={historicoDetalhe.preco_calculado * historicoDetalhe.taxa_adicional_pct}
                        taxaAdicionalPct={historicoDetalhe.taxa_adicional_pct}
                        taxaExtraCalculada={
                          historicoDetalhe.taxa_extra_tipo === "percentual"
                            ? historicoDetalhe.preco_calculado * ((historicoDetalhe.taxa_extra_valor ?? 0) / 100)
                            : historicoDetalhe.taxa_extra_tipo === "fixo"
                              ? (historicoDetalhe.taxa_extra_valor ?? 0)
                              : 0
                        }
                        impostoValor={historicoDetalhe.preco_calculado * historicoDetalhe.imposto_pct}
                        impostoPct={historicoDetalhe.imposto_pct}
                      />

                      <div className="flex justify-between font-medium pt-1.5 border-t border-border">
                        <span className="text-text-primary">Lucro líquido</span>
                        <span className={`font-mono ${classeValor(historicoDetalhe.lucro)}`}>
                          {formatBRL(historicoDetalhe.lucro)} (
                          {formatarMargemPct(historicoDetalhe.lucro, historicoDetalhe.preco_calculado)}
                          %)
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => setPendenteExport({ acao: "copiar", dados: resumoDoHistorico(historicoDetalhe) })}
                      >
                        Copiar
                      </Button>
                      <Button
                        variant="primary"
                        className="flex-1"
                        onClick={() => setPendenteExport({ acao: "whatsapp", dados: resumoDoHistorico(historicoDetalhe) })}
                      >
                        Enviar WhatsApp
                      </Button>
                    </div>
                    <Button variant="secondary" className="w-full" onClick={() => setPendenteImagem(resumoDoHistorico(historicoDetalhe))}>
                      Imagem
                    </Button>
                  </div>
                )}
              </Modal>
            </>
          )}

          {subAbaHistorico === "produtos" && (
            <Card className="p-0 overflow-hidden">
              <div className="px-5 pt-5 pb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-text-primary">Produtos com Variações</h2>
                <button onClick={exportarAnunciosCsv} className="text-xs text-accent hover:underline">
                  Exportar CSV
                </button>
              </div>
              <div className="divide-y divide-border">
                {anuncios.map((a) => (
                  <div key={a.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setAnuncioExpandidoHistorico((v) => (v === a.id ? null : a.id))}
                        className="text-sm font-medium text-text-primary hover:text-accent text-left"
                      >
                        {a.nome_anuncio}{" "}
                        <span className="text-text-tertiary font-normal">
                          ({a.variacoes.length} variações · {new Date(a.criado_em).toLocaleDateString("pt-BR")})
                        </span>
                      </button>
                      <RowMenu
                        actions={[
                          {
                            label: anuncioExpandidoHistorico === a.id ? "Ver menos" : "Ver mais",
                            onClick: () => setAnuncioExpandidoHistorico((v) => (v === a.id ? null : a.id)),
                          },
                          { label: "Remover", onClick: () => excluirAnuncioHistorico(a), destructive: true },
                        ]}
                      />
                    </div>
                    {anuncioExpandidoHistorico === a.id && (
                      <div className="mt-3 border border-border rounded-md divide-y divide-border">
                        {a.variacoes.map((v) => (
                          <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <span className="text-text-primary">{v.nome_variacao}</span>
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-text-secondary">custo {formatBRL(v.custo)}</span>
                              <span className="font-mono text-accent">{formatBRL(v.preco_calculado)}</span>
                              <span className={`font-mono ${classeValor(v.lucro)}`}>
                                {formatarMargemPct(v.lucro, v.preco_calculado)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {anuncios.length === 0 && (
                  <p className="text-sm text-text-tertiary text-center py-8">Nenhum produto com variações salvo ainda.</p>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {modaisExportacao}

      {ConfirmDialog}
    </>
  );
}

/**
 * Aviso da zona morta de comissão.
 *
 * É o alerta que paga o módulo inteiro: um preço R$ 5 maior pode render R$ 7 a MENOS por
 * venda, e nada na tela contava isso. Só aparece quando há zona morta de verdade — alerta
 * que vive na tela vira ruído e para de ser lido.
 */
function AvisoZonaMorta({ zona, onAplicar }: { zona: ZonaMorta | null; onAplicar: (preco: number) => void }) {
  if (!zona) return null;

  return (
    <div className="mt-2 rounded-md border border-negative bg-negative-soft p-2.5">
      <div className="flex items-start gap-2">
        <TriangleAlert size={14} className="text-negative shrink-0 mt-0.5" />
        <div className="text-xs text-text-primary">
          <p className="font-medium mb-1">Este preço cai numa zona morta da comissão.</p>
          <p className="text-text-secondary">
            Entre {formatBRL(zona.inicio)} e {formatBRL(zona.fim)} a comissão sobe de faixa e você recebe menos do que
            receberia vendendo por {formatBRL(zona.precoMelhor)} — mesmo cobrando mais caro.
          </p>
          <p className="mt-1">
            Vendendo a {formatBRL(zona.precoMelhor)} sobram <strong>{formatBRL(zona.ganhoLiquido)} a mais</strong> por
            venda.
          </p>
          <button
            type="button"
            onClick={() => onAplicar(zona.precoMelhor)}
            className="mt-2 text-accent hover:underline font-medium"
          >
            Usar {formatBRL(zona.precoMelhor)}
          </button>
        </div>
      </div>
    </div>
  );
}

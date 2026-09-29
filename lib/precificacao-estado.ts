"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { paraCsv as paraCsvColunas, matrizParaCsv, baixarArquivo } from "@/lib/csv";
import {
  resolverPorMargem,
  resolverPorMarkup,
  resolverPorLucro,
  resultadoParaPreco,
  resultadoParaPrecoComFaixas,
  resolverComFaixas,
  analisarConcorrencia,
  type ComponenteKit,
  type ModoCalculo,
  type Concorrente,
  type TaxasPlataforma,
  type ResultadoPrecificacao,
  pctPorModo,
  zonaMortaDeFaixa,
  type FaixaComissao,
} from "@/lib/pricing";
import { type ResumoExport, useExportarPrecificacao } from "@/components/precificacao/resultado-compartilhado";
import {
  salvarPrecificacao,
  atualizarPrecoProduto,
  removerPrecificacao,
  removerAnuncio,
  criarConcorrente,
  removerConcorrenteSalvo,
} from "@/app/(painel)/precificacao/actions";
import { executarComToast } from "@/lib/acao-cliente";
import { useConfirm } from "@/components/ui/ConfirmModal";

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
export const ID_CUSTO_PRODUTO = "custo-produto";

export type VisaoPrecificacao = "individual" | "variacoes" | "massa" | "historico";

export interface PrecificacaoProps {
  historico: PrecificacaoHist[];
  produtos: ProdutoOpcao[];
  aliquotaDasPadrao: number;
  lojas: LojaOpcao[];
  anuncios: AnuncioSalvo[];
  concorrentesPorProduto: Record<string, Concorrente[]>;
}

/**
 * Todo o estado e a lógica derivada da tela de Precificação Individual — extraído de
 * `PrecificacaoClient.tsx` (que tinha 1.575 linhas) sem mudar nenhum cálculo. Os
 * componentes de painel (`components/precificacao/Painel*.tsx`) só recebem pedaços deste
 * retorno por prop; a lógica continua toda aqui, num lugar só.
 */
export function usePrecificacao({
  historico,
  produtos,
  aliquotaDasPadrao,
  lojas,
  anuncios,
  concorrentesPorProduto,
}: PrecificacaoProps) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [visao, setVisao] = useState<VisaoPrecificacao>("individual");
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

  /** "Insumo puxado do estoque": pré-preenche nome e custo a partir de um produto
   * cadastrado. `produtoId` fica gravado na linha, mas continua editável depois. */
  function adicionarComponenteDoProduto(produtoId: string) {
    const produto = produtos.find((p) => p.id === produtoId);
    if (!produto) return;
    setComponentes((prev) => [
      ...prev,
      { id: proximoIdLocal("estoque"), nome: produto.nome, quantidade: 1, custoUnitario: produto.custo, produtoId: produto.id },
    ]);
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
      // O "Lucro líquido" principal continua sempre em margem sobre venda — o pedido era
      // só a Faixa de Venda seguir a forma de calcular escolhida (abaixo).
      margemEfetivaPct: resultado.margemEfetivaPct,
      // O custo do produto era só somado ao Total, nunca listado — o texto mostrava
      // "Total: R$ 6,60" com uma única linha de insumo de R$ 0,50, sem dizer de onde vinham
      // os outros R$ 6,10. Mesmo padrão de `componentesSalvos`, usado ao salvar no histórico.
      componentes:
        custoProduto > 0
          ? [{ id: ID_CUSTO_PRODUTO, nome: "Custo do produto", quantidade: 1, custoUnitario: custoProduto }, ...componentes]
          : componentes,
      faixaVenda:
        resultadoMin && resultadoMax
          ? {
              precoMinimo: resultadoMin.precoVenda,
              precoMaximo: resultadoMax.precoVenda,
              lucroMinimo: resultadoMin.lucroLiquido,
              margemMinimaPct: pctPorModo(resultadoMin, modo),
              lucroMaximo: resultadoMax.lucroLiquido,
              margemMaximaPct: pctPorModo(resultadoMax, modo),
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

  return {
    // navegação de abas
    visao,
    setVisao,
    subAbaHistorico,
    setSubAbaHistorico,
    anuncioExpandidoHistorico,
    setAnuncioExpandidoHistorico,

    // identificação do produto/anúncio
    produtoId,
    setProdutoId,
    nomeProduto,
    setNomeProduto,
    nomeAnuncio,
    setNomeAnuncio,
    sugestoesAbertas,
    setSugestoesAbertas,
    sugestoesProdutos,
    produtoVinculado,
    selecionarSugestao,

    // custo e insumos
    custoProduto,
    setCustoProduto,
    componentes,
    custoInsumos,
    custoTotal,
    atualizarComponente,
    adicionarComponente,
    adicionarComponenteDoProduto,
    removerComponente,

    // taxas da plataforma
    modoTaxas,
    setModoTaxas,
    lojaId,
    setLojaId,
    lojaSelecionada,
    canaisAgrupados,
    taxaFixa,
    setTaxaFixa,
    taxaVariavelPct,
    setTaxaVariavelPct,
    taxaAdicionalPct,
    setTaxaAdicionalPct,
    impostoPct,
    setImpostoPct,
    faixaShopee,
    zonaMorta,
    aplicarPrecoMelhor,
    taxaVariavelPctEfetiva,
    taxaFixaEfetiva,
    taxaExtraValorEfetivo,
    taxaExtraTipoEfetivo,

    // como calcular o preço
    modo,
    setModo,
    margemPct,
    setMargemPct,
    markupPct,
    setMarkupPct,
    lucroDesejado,
    setLucroDesejado,
    precoFixo,
    setPrecoFixo,

    // concorrentes
    concorrentes,
    novoConcorrenteNome,
    setNovoConcorrenteNome,
    novoConcorrentePreco,
    setNovoConcorrentePreco,
    novoConcorrenteLink,
    setNovoConcorrenteLink,
    adicionarConcorrente,
    removerConcorrente,
    analiseConcorrencia,

    // resultado
    resultado,
    mostrarDetalheResultado,
    setMostrarDetalheResultado,
    precoMinimo,
    setPrecoMinimo,
    precoMaximo,
    setPrecoMaximo,
    resultadoMin,
    resultadoMax,
    resumoAtual,
    setPendenteExport,
    setPendenteImagem,
    salvar,
    pending,

    // histórico — precificações
    filtroHistoricoTexto,
    setFiltroHistoricoTexto,
    filtroHistoricoDataIni,
    setFiltroHistoricoDataIni,
    filtroHistoricoDataFim,
    setFiltroHistoricoDataFim,
    historicoFiltrado,
    historicoDetalhe,
    setHistoricoDetalhe,
    mostrarDetalheHistorico,
    setMostrarDetalheHistorico,
    resumoDoHistorico,
    exportarHistoricoCsv,
    duplicarHistorico,
    removerHistorico,

    // histórico — produtos com variações
    excluirAnuncioHistorico,
    exportarAnunciosCsv,

    // infraestrutura compartilhada
    modaisExportacao,
    confirm,
    ConfirmDialog,
  };
}

export type EstadoPrecificacao = ReturnType<typeof usePrecificacao>;

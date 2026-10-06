"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { formatBRL, hojeIsoBrasil } from "@/lib/format";
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
  ID_CUSTO_PRODUTO,
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
  vincularProdutoPrecificacao,
  criarProdutoDePrecificacao,
  criarProdutosDeAnuncio,
} from "@/app/(painel)/precificacao/actions";
import { executarComToast } from "@/lib/acao-cliente";
import type {
  PrecificacaoHist,
  VisaoPrecificacao,
  AnuncioSalvo,
  ProdutoOpcao,
  PrecificacaoProps,
} from "@/lib/precificacao-tipos";

export type {
  PrecificacaoHist,
  LojaOpcao,
  VariacaoSalva,
  AnuncioSalvo,
  ProdutoOpcao,
  VisaoPrecificacao,
  PrecificacaoProps,
} from "@/lib/precificacao-tipos";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { useExtrasPrecificacao } from "@/lib/precificacao-extras";

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
  concorrentesPorProduto,
  empresa = null,
  visaoInicial = "individual",
}: PrecificacaoProps) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [visao, setVisao] = useState<VisaoPrecificacao>(visaoInicial);
  const [subAbaHistorico, setSubAbaHistorico] = useState<"precificacoes" | "produtos">("precificacoes");
  const [anuncioExpandidoHistorico, setAnuncioExpandidoHistorico] = useState<string | null>(null);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [nomeProduto, setNomeProduto] = useState("");
  const [nomeAnuncio, setNomeAnuncio] = useState("");
  const [descricaoAnuncio, setDescricaoAnuncio] = useState("");
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
  const { setPendenteExport, setPendenteImagem, modais: modaisExportacao } = useExportarPrecificacao(empresa);

  const [custoProduto, setCustoProduto] = useState(0);
  const [componentes, setComponentes] = useState<ComponenteKit[]>([]);

  const [concorrentes, setConcorrentes] = useState<Concorrente[]>([]);
  const [novoConcorrenteNome, setNovoConcorrenteNome] = useState("");
  const [novoConcorrentePreco, setNovoConcorrentePreco] = useState<number | "">("");
  const [novoConcorrenteLink, setNovoConcorrenteLink] = useState("");

  const custoInsumos = componentes.reduce((acc, c) => acc + c.quantidade * c.custoUnitario, 0);
  const custoTotal = custoProduto + custoInsumos;

  const lojaSelecionada = useMemo(() => lojas.find((l) => l.id === lojaId) ?? null, [lojas, lojaId]);

  // Canal de faixas sem nenhuma faixa cadastrada cai na comissão da loja (igual ao kit):
  // com a lista vazia o motor de faixas cobraria 0% e R$ 0.
  const usaFaixas = modoTaxas === "loja" && lojaSelecionada?.tipoTaxa === "faixas" && lojaSelecionada.faixas.length > 0;

  const taxas: TaxasPlataforma = useMemo(() => {
    if (modoTaxas === "loja" && lojaSelecionada && !usaFaixas) {
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
  }, [modoTaxas, lojaSelecionada, usaFaixas, impostoPct, taxaFixa, taxaVariavelPct, taxaAdicionalPct]);

  const taxasBaseFaixas = useMemo(
    () => ({
      impostoPct: impostoPct / 100,
      taxaAdicionalPct: taxaAdicionalPct / 100,
      taxaExtraValor: lojaSelecionada?.taxaExtraValor ?? undefined,
      taxaExtraTipo: lojaSelecionada?.taxaExtraTipo ?? null,
    }),
    [impostoPct, taxaAdicionalPct, lojaSelecionada],
  );

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
      // Dia no Brasil: `slice(0, 10)` do timestamptz é o dia em UTC (depois das 21h, o seguinte).
      const dataItem = hojeIsoBrasil(new Date(h.criado_em));
      const passaIni = !filtroHistoricoDataIni || dataItem >= filtroHistoricoDataIni;
      const passaFim = !filtroHistoricoDataFim || dataItem <= filtroHistoricoDataFim;
      return passaTexto && passaIni && passaFim;
    });
  }, [historico, filtroHistoricoTexto, filtroHistoricoDataIni, filtroHistoricoDataFim]);

  const analiseConcorrencia = useMemo(
    () => analisarConcorrencia(resultado, concorrentes, taxas),
    [resultado, concorrentes, taxas],
  );

  /** Abaixo disso a venda dá prejuízo (lucro zero com as mesmas taxas). */
  const precoMinimoViavel = useMemo(() => {
    const r =
      usaFaixas && lojaSelecionada
        ? resolverComFaixas(custoTotal, "lucro", 0, taxasBaseFaixas, lojaSelecionada.faixas).resultado
        : resolverPorLucro(custoTotal, 0, taxas);
    return r.viavel && Number.isFinite(r.precoVenda) ? Math.ceil(r.precoVenda * 100) / 100 : null;
  }, [usaFaixas, lojaSelecionada, custoTotal, taxasBaseFaixas, taxas]);

  const extras = useExtrasPrecificacao({
    resultado,
    nomeProduto,
    canal: lojaSelecionada ? lojaSelecionada.canalNome : null,
    comissaoPct: taxaVariavelPctEfetiva,
    tarifa: taxaFixaEfetiva,
    impostoPct: impostoPct / 100,
    precoMinimoViavel,
    zonaMorta,
    analiseConcorrencia,
    qtdConcorrentes: concorrentes.filter((c) => c.preco > 0).length,
  });

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
      imagemUrl: extras.imagemPropria ?? produtos.find((p) => p.id === produtoId)?.imagem_url ?? null,
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
      imagemUrl: h.imagem_url ?? (h.produto_id ? (produtos.find((p) => p.id === h.produto_id)?.imagem_url ?? null) : null),
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

  function duplicarHistorico(h: PrecificacaoHist) {
    setNomeProduto(h.produto_nome);
    setNomeAnuncio(h.titulo_anuncio ?? "");
    setDescricaoAnuncio(h.descricao_anuncio ?? "");
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
    extras.carregarExtras(h);
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

  // ---------- Ligar precificação/histórico a um produto ----------

  /** Precificação sendo vinculada agora — abre o `ModalVincularProduto` em PrecificacaoClient. */
  const [vinculandoId, setVinculandoId] = useState<string | null>(null);

  function abrirVincular(h: PrecificacaoHist) {
    setVinculandoId(h.id);
  }

  function confirmarVinculo(produtoId: string) {
    if (!vinculandoId) return;
    const id = vinculandoId;
    setVinculandoId(null);
    startTransition(async () => {
      await executarComToast(vincularProdutoPrecificacao(id, produtoId), {
        sucesso: "Precificação vinculada ao produto",
        erro: "Erro ao vincular produto",
      });
    });
  }

  function aplicarPrecoDoHistorico(h: PrecificacaoHist) {
    if (!h.produto_id) return;
    startTransition(async () => {
      await executarComToast(atualizarPrecoProduto(h.produto_id!, h.preco_calculado), {
        sucesso: "Preço do produto atualizado",
        erro: "Erro ao atualizar o preço do produto",
      });
    });
  }

  function criarProdutoDoHistorico(h: PrecificacaoHist) {
    startTransition(async () => {
      await executarComToast(criarProdutoDePrecificacao(h.id), {
        sucesso: "Produto criado a partir da precificação",
        erro: "Erro ao criar produto",
      });
    });
  }

  function criarProdutosDaVariacao(a: AnuncioSalvo) {
    startTransition(async () => {
      await executarComToast(criarProdutosDeAnuncio(a.id), {
        sucesso: "Produtos criados a partir das variações",
        erro: "Erro ao criar produtos",
      });
    });
  }

  function salvar() {
    if (!nomeProduto.trim() || !resultado.viavel) {
      toast.error("Preencha o nome do produto e garanta um resultado viável antes de salvar");
      return;
    }
    // No modo manual, o canal não vem de "Selecionar Loja" — precisa ser escolhido
    // explicitamente no seletor ao lado de "Salvar Anúncio", senão o preço não aparece
    // no resumo por canal do produto.
    if (modoTaxas === "manual" && !lojaId) {
      toast.error("Escolha o canal de venda antes de salvar.");
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
          descricao_anuncio: descricaoAnuncio.trim() || null,
          loja_id: lojaId,
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
          ...extras.extrasParaSalvar(),
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
    descricaoAnuncio,
    setDescricaoAnuncio,
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
    precoMinimoViavel,
    resultadoNoPreco,

    // anúncio pago, foto própria e estratégia da Vixe (8.8)
    ...extras,

    // histórico — precificações
    filtroHistoricoTexto,
    setFiltroHistoricoTexto,
    filtroHistoricoDataIni,
    setFiltroHistoricoDataIni,
    filtroHistoricoDataFim,
    setFiltroHistoricoDataFim,
    historico,
    historicoFiltrado,
    historicoDetalhe,
    setHistoricoDetalhe,
    mostrarDetalheHistorico,
    setMostrarDetalheHistorico,
    resumoDoHistorico,
    duplicarHistorico,
    removerHistorico,

    // histórico — produtos com variações
    excluirAnuncioHistorico,
    criarProdutosDaVariacao,

    // ligar precificação/histórico a um produto
    vinculandoId,
    abrirVincular,
    fecharVincular: () => setVinculandoId(null),
    confirmarVinculo,
    aplicarPrecoDoHistorico,
    criarProdutoDoHistorico,

    // infraestrutura compartilhada
    modaisExportacao,
    confirm,
    ConfirmDialog,
  };
}

export type EstadoPrecificacao = ReturnType<typeof usePrecificacao>;

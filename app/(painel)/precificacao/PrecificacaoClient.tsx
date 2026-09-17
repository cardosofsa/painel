"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/Badge";
import { Table, Thead, Th, Tr, Td } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { formatBRL } from "@/lib/mock-data";
import {
  resolverPorMargem,
  resolverPorLucro,
  resultadoParaPreco,
  resolverComFaixaShopee,
  analisarConcorrencia,
  type ComponenteKit,
  type ModoCalculo,
  type Concorrente,
  type TaxasPlataforma,
  type FaixaComissao,
} from "@/lib/pricing";
import { CalculadoraEmMassa } from "@/components/precificacao/CalculadoraEmMassa";
import { PriceBreakdownChart } from "@/components/charts/PriceBreakdownChart";
import {
  salvarPrecificacao,
  atualizarPrecoProduto,
  removerPrecificacao,
  criarAnuncio,
  removerAnuncio,
  type VariacaoInput,
} from "./actions";

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

interface ProdutoOpcao {
  id: string;
  sku: string;
  nome: string;
  preco_venda: number;
}

interface ResumoExport {
  titulo: string;
  precoVenda: number;
  custoTotal: number;
  taxaVariavelValor: number;
  taxaVariavelPct: number;
  taxaFixa: number;
  taxaAdicionalValor: number;
  taxaAdicionalPct: number;
  impostoValor: number;
  impostoPct: number;
  taxaExtraCalculada: number;
  lucroLiquido: number;
  margemEfetivaPct: number;
  componentes: ComponenteKit[] | null;
}

function precoPsicologico(preco: number): number {
  if (preco <= 0) return 0;
  const base = Math.floor(preco);
  const candidato = base + 0.9;
  return candidato >= preco ? candidato : base + 1 + 0.9;
}

function paraCsv(valor: string | number) {
  const texto = String(valor);
  return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function montarTextoResumo(r: ResumoExport, formato: "simples" | "completo"): string {
  const linhas = [`*${r.titulo}*`];
  if (formato === "completo" && r.componentes && r.componentes.length > 0) {
    linhas.push("", "Custo:");
    for (const c of r.componentes) {
      linhas.push(`- ${c.nome}: ${formatBRL(c.quantidade * c.custoUnitario)}`);
    }
    linhas.push(`Total: ${formatBRL(r.custoTotal)}`);
  } else {
    linhas.push(`Custo: ${formatBRL(r.custoTotal)}`);
  }
  if (formato === "completo") {
    linhas.push("", "Taxas:");
    linhas.push(`- Taxa variável (${(r.taxaVariavelPct * 100).toFixed(1)}%): ${formatBRL(r.taxaVariavelValor)}`);
    if (r.taxaFixa > 0) linhas.push(`- Taxa fixa: ${formatBRL(r.taxaFixa)}`);
    if (r.taxaAdicionalPct > 0) linhas.push(`- Taxa adicional (${(r.taxaAdicionalPct * 100).toFixed(1)}%): ${formatBRL(r.taxaAdicionalValor)}`);
    if (r.taxaExtraCalculada > 0) linhas.push(`- Taxa extra: ${formatBRL(r.taxaExtraCalculada)}`);
    linhas.push(`- Imposto (${(r.impostoPct * 100).toFixed(1)}%): ${formatBRL(r.impostoValor)}`);
  }
  linhas.push("", `Preço de venda: ${formatBRL(r.precoVenda)}`);
  linhas.push(`Lucro líquido: ${formatBRL(r.lucroLiquido)} (${(r.margemEfetivaPct * 100).toFixed(1)}%)`);
  return linhas.join("\n");
}

let nextId = 1;
let nextConcorrenteId = 1;

const MODOS: { id: ModoCalculo; label: string }[] = [
  { id: "margem", label: "Margem Alvo" },
  { id: "lucro", label: "Lucro Desejado (R$)" },
  { id: "preco", label: "Preço Fixo" },
];

function FormatoExportModal({
  aberto,
  onClose,
  onEscolher,
}: {
  aberto: boolean;
  onClose: () => void;
  onEscolher: (formato: "simples" | "completo") => void;
}) {
  return (
    <Modal open={aberto} onClose={onClose} title="Formato do texto">
      <p className="text-sm text-text-secondary mb-4">Escolha como montar o texto.</p>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => onEscolher("simples")}>
          Simplificada
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => onEscolher("completo")}>
          Completa
        </Button>
      </div>
    </Modal>
  );
}

export function PrecificacaoClient({
  historico,
  produtos,
  aliquotaDasPadrao,
  lojas,
  anuncios,
}: {
  historico: PrecificacaoHist[];
  produtos: ProdutoOpcao[];
  aliquotaDasPadrao: number;
  lojas: LojaOpcao[];
  anuncios: AnuncioSalvo[];
}) {
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [visao, setVisao] = useState<"individual" | "variacoes" | "massa">("individual");
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [nomeProduto, setNomeProduto] = useState("");
  const [nomeAnuncio, setNomeAnuncio] = useState("");
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [historicoDetalhe, setHistoricoDetalhe] = useState<PrecificacaoHist | null>(null);
  const [mostrarDetalheHistorico, setMostrarDetalheHistorico] = useState(false);
  const [mostrarDetalheResultado, setMostrarDetalheResultado] = useState(false);
  const [modo, setModo] = useState<ModoCalculo>("margem");
  const [margemPct, setMargemPct] = useState(28);
  const [lucroDesejado, setLucroDesejado] = useState(30);
  const [precoFixo, setPrecoFixo] = useState(99.9);
  const [impostoPct, setImpostoPct] = useState(aliquotaDasPadrao);
  const [modoTaxas, setModoTaxas] = useState<"manual" | "loja">("manual");
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [taxaFixa, setTaxaFixa] = useState(4);
  const [taxaVariavelPct, setTaxaVariavelPct] = useState(20);
  const [taxaAdicionalPct, setTaxaAdicionalPct] = useState(0);
  const [filtroHistoricoTexto, setFiltroHistoricoTexto] = useState("");
  const [filtroHistoricoDataIni, setFiltroHistoricoDataIni] = useState("");
  const [filtroHistoricoDataFim, setFiltroHistoricoDataFim] = useState("");
  const [pendenteExport, setPendenteExport] = useState<{ acao: "copiar" | "whatsapp"; dados: ResumoExport } | null>(null);
  const [imagemParaExportar, setImagemParaExportar] = useState<ResumoExport | null>(null);
  const imagemRef = useRef<HTMLDivElement>(null);

  const [componentes, setComponentes] = useState<ComponenteKit[]>([
    { id: "c1", nome: "Óleo para Barba 30ml", quantidade: 1, custoUnitario: 8.5 },
    { id: "c2", nome: "Balm Modelador 60g", quantidade: 1, custoUnitario: 11.2 },
    { id: "c3", nome: "Estojo de Couro Rustik", quantidade: 1, custoUnitario: 19.0 },
    { id: "c4", nome: "Caixa Kraft + Embalagem", quantidade: 1, custoUnitario: 2.8 },
  ]);

  const [concorrentes, setConcorrentes] = useState<Concorrente[]>([]);
  const [novoConcorrenteNome, setNovoConcorrenteNome] = useState("");
  const [novoConcorrentePreco, setNovoConcorrentePreco] = useState<number | "">("");
  const [novoConcorrenteLink, setNovoConcorrenteLink] = useState("");

  const custoTotal = componentes.reduce((acc, c) => acc + c.quantidade * c.custoUnitario, 0);

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

  const { resultado, faixaShopee } = useMemo(() => {
    if (modoTaxas === "loja" && lojaSelecionada?.tipoTaxa === "faixas") {
      const taxasBase = {
        impostoPct: impostoPct / 100,
        taxaAdicionalPct: taxaAdicionalPct / 100,
        taxaExtraValor: lojaSelecionada.taxaExtraValor ?? undefined,
        taxaExtraTipo: lojaSelecionada.taxaExtraTipo,
      };
      const parametro = modo === "margem" ? margemPct / 100 : modo === "lucro" ? lucroDesejado : precoFixo;
      const { resultado: r, faixa } = resolverComFaixaShopee(custoTotal, modo, parametro, taxasBase);
      return { resultado: r, faixaShopee: faixa as FaixaComissao | null };
    }
    let r;
    if (modo === "margem") r = resolverPorMargem(custoTotal, margemPct / 100, taxas);
    else if (modo === "lucro") r = resolverPorLucro(custoTotal, lucroDesejado, taxas);
    else r = resultadoParaPreco(precoFixo, custoTotal, taxas);
    return { resultado: r, faixaShopee: null as FaixaComissao | null };
  }, [modoTaxas, lojaSelecionada, custoTotal, modo, margemPct, lucroDesejado, precoFixo, taxas, impostoPct, taxaAdicionalPct]);

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
    nextId += 1;
    setComponentes((prev) => [...prev, { id: `novo-${nextId}`, nome: "Novo insumo", quantidade: 1, custoUnitario: 0 }]);
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

  useEffect(() => {
    if (!imagemParaExportar || !imagemRef.current) return;
    const node = imagemRef.current;
    (async () => {
      try {
        const dataUrl = await toPng(node, { pixelRatio: 2 });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `precificacao-${imagemParaExportar.titulo.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}.png`;
        a.click();
        toast.success("Imagem baixada — anexe manualmente na conversa do WhatsApp");
      } catch {
        toast.error("Erro ao gerar imagem");
      } finally {
        setImagemParaExportar(null);
      }
    })();
  }, [imagemParaExportar]);

  function adicionarConcorrente() {
    if (!novoConcorrenteNome.trim() || novoConcorrentePreco === "" || novoConcorrentePreco <= 0) return;
    nextConcorrenteId += 1;
    setConcorrentes((prev) => [
      ...prev,
      {
        id: `conc${nextConcorrenteId}`,
        nome: novoConcorrenteNome.trim(),
        preco: Number(novoConcorrentePreco),
        link: novoConcorrenteLink.trim() || null,
      },
    ]);
    setNovoConcorrenteNome("");
    setNovoConcorrentePreco("");
    setNovoConcorrenteLink("");
  }

  function removerConcorrente(id: string) {
    setConcorrentes((prev) => prev.filter((c) => c.id !== id));
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
    };
  }

  async function executarExport(formato: "simples" | "completo") {
    if (!pendenteExport) return;
    const texto = montarTextoResumo(pendenteExport.dados, formato);
    if (pendenteExport.acao === "copiar") {
      try {
        await navigator.clipboard.writeText(texto);
        toast.success("Precificação copiada");
      } catch {
        toast.error("Não foi possível copiar");
      }
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
    }
    setPendenteExport(null);
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
    const csv = [cabecalho, ...linhas].map((linha) => linha.map(paraCsv).join(",")).join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historico-precificacoes.csv";
    a.click();
    URL.revokeObjectURL(url);
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
    setComponentes(h.componentes && h.componentes.length > 0 ? h.componentes : [{ id: "historico", nome: "Custo total (do histórico)", quantidade: 1, custoUnitario: h.custo }]);
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
      try {
        await removerPrecificacao(h.id);
        toast("Precificação removida");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover precificação");
      }
    });
  }

  function salvar() {
    if (!nomeProduto.trim() || !resultado.viavel) {
      toast.error("Preencha o nome do produto e garanta um resultado viável antes de salvar");
      return;
    }
    startTransition(async () => {
      try {
        await salvarPrecificacao({
          produto_id: produtoId,
          produto_nome: nomeProduto,
          canal: lojaSelecionada ? `${lojaSelecionada.canalNome} — ${lojaSelecionada.nome}` : null,
          titulo_anuncio: nomeAnuncio.trim() || null,
          loja_id: modoTaxas === "loja" ? lojaId : null,
          componentes,
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
        });
        toast.success("Precificação salva no histórico");

        if (produtoId) {
          const ok = await confirm({
            title: "Atualizar preço do produto?",
            message: `Atualizar o preço de venda de "${nomeProduto}" para ${formatBRL(resultado.precoVenda)}?`,
            confirmLabel: "Atualizar",
          });
          if (ok) {
            await atualizarPrecoProduto(produtoId, resultado.precoVenda);
            toast.success("Preço do produto atualizado");
          }
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar precificação");
      }
    });
  }

  return (
    <>
      <PageHeader eyebrow="Precificação" title="Calculadora de Precificação" />

      <div className="flex gap-2 mb-5">
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

      {visao === "massa" && <CalculadoraEmMassa />}

      {visao === "variacoes" && (
        <VariacoesView produtos={produtos} lojas={lojas} anuncios={anuncios} aliquotaDasPadrao={aliquotaDasPadrao} confirm={confirm} />
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
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <span className="text-sm text-text-secondary">Custo Total Direto</span>
              <span className="font-mono text-text-primary font-semibold">{formatBRL(custoTotal)}</span>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-medium text-text-primary mb-3">Taxas da Plataforma</h3>
            <div className="flex gap-2 mb-4">
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
                          <p className="text-xs text-text-tertiary mt-2 bg-surface-2 rounded-md p-2">
                            Faixa aplicada: {faixaShopee.label} · comissão {faixaShopee.comissaoPct}% + {formatBRL(faixaShopee.tarifaFixa)}
                          </p>
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
            <div className="flex gap-2 mb-4">
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
              <button
                onClick={() => setMostrarDetalheResultado((v) => !v)}
                className="text-xs text-accent hover:underline"
              >
                {mostrarDetalheResultado ? "Ocultar detalhamento ▲" : "Ver detalhamento ▾"}
              </button>
              {mostrarDetalheResultado && (
                <>
                  <div className="flex justify-between text-text-secondary">
                    <span>Custo</span>
                    <span className="font-mono text-text-primary">{formatBRL(resultado.custoTotal)}</span>
                  </div>
                  <div className="flex justify-between text-text-secondary">
                    <span>Taxa variável</span>
                    <span className="font-mono text-text-primary">{formatBRL(resultado.taxaVariavelValor)}</span>
                  </div>
                  {taxaFixaEfetiva > 0 && (
                    <div className="flex justify-between text-text-secondary">
                      <span>Taxa fixa</span>
                      <span className="font-mono text-text-primary">{formatBRL(taxaFixaEfetiva)}</span>
                    </div>
                  )}
                  {taxaAdicionalPct > 0 && (
                    <div className="flex justify-between text-text-secondary">
                      <span>Taxa adicional</span>
                      <span className="font-mono text-text-primary">{formatBRL(resultado.taxaAdicionalValor)}</span>
                    </div>
                  )}
                  {resultado.taxaExtraCalculada > 0 && (
                    <div className="flex justify-between text-text-secondary">
                      <span>Taxa extra</span>
                      <span className="font-mono text-text-primary">{formatBRL(resultado.taxaExtraCalculada)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-text-secondary">
                    <span>Imposto</span>
                    <span className="font-mono text-text-primary">{formatBRL(resultado.impostoValor)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between font-medium pt-1.5 border-t border-border">
                <span className="text-text-primary">Lucro líquido</span>
                <span className={`font-mono ${resultado.lucroLiquido >= 0 ? "text-positive" : "text-negative"}`}>
                  {formatBRL(resultado.lucroLiquido)} ({(resultado.margemEfetivaPct * 100).toFixed(1)}%)
                </span>
              </div>
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
                variant="primary"
                className="flex-1"
                onClick={() => setPendenteExport({ acao: "whatsapp", dados: resumoAtual() })}
              >
                Enviar WhatsApp
              </Button>
            </div>
            <Button variant="secondary" className="w-full mt-2" onClick={() => setImagemParaExportar(resumoAtual())}>
              Baixar Imagem
            </Button>
            <Button variant="secondary" className="w-full mt-2" onClick={salvar}>
              Salvar Precificação
            </Button>
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
                    {formatBRL(analiseConcorrencia.precoMinConcorrentes)} – {formatBRL(analiseConcorrencia.precoMaxConcorrentes)}
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

      <Card className="p-0 overflow-hidden mt-5">
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
                <Td align="right" mono className="text-positive">
                  +{h.preco_calculado > 0 ? ((h.lucro / h.preco_calculado) * 100).toFixed(1) : "0.0"}%
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

              <button onClick={() => setMostrarDetalheHistorico((v) => !v)} className="text-xs text-accent hover:underline">
                {mostrarDetalheHistorico ? "Ocultar detalhamento ▲" : "Ver detalhamento ▾"}
              </button>

              {mostrarDetalheHistorico && (
                <>
                  {historicoDetalhe.componentes && historicoDetalhe.componentes.length > 0 && (
                    <div className="border border-border rounded-md divide-y divide-border my-2">
                      {historicoDetalhe.componentes.map((c, i) => (
                        <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                          <span className="text-text-secondary">
                            {c.nome} × {c.quantidade}
                          </span>
                          <span className="font-mono text-text-primary">{formatBRL(c.quantidade * c.custoUnitario)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-between text-text-secondary">
                    <span>Custo</span>
                    <span className="font-mono text-text-primary">{formatBRL(historicoDetalhe.custo)}</span>
                  </div>
                  <div className="flex justify-between text-text-secondary">
                    <span>Taxa variável</span>
                    <span className="font-mono text-text-primary">{(historicoDetalhe.taxa_variavel_pct * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-text-secondary">
                    <span>Taxa fixa</span>
                    <span className="font-mono text-text-primary">{formatBRL(historicoDetalhe.taxa_fixa)}</span>
                  </div>
                  {historicoDetalhe.taxa_adicional_pct > 0 && (
                    <div className="flex justify-between text-text-secondary">
                      <span>Taxa adicional</span>
                      <span className="font-mono text-text-primary">{(historicoDetalhe.taxa_adicional_pct * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  <div className="flex justify-between text-text-secondary">
                    <span>Imposto / DAS</span>
                    <span className="font-mono text-text-primary">{(historicoDetalhe.imposto_pct * 100).toFixed(1)}%</span>
                  </div>
                </>
              )}

              <div className="flex justify-between font-medium pt-1.5 border-t border-border">
                <span className="text-text-primary">Lucro líquido</span>
                <span className="font-mono text-positive">
                  {formatBRL(historicoDetalhe.lucro)} (
                  {historicoDetalhe.preco_calculado > 0
                    ? ((historicoDetalhe.lucro / historicoDetalhe.preco_calculado) * 100).toFixed(1)
                    : "0.0"}
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
            <Button variant="secondary" className="w-full" onClick={() => setImagemParaExportar(resumoDoHistorico(historicoDetalhe))}>
              Baixar Imagem
            </Button>
          </div>
        )}
      </Modal>
      </>
      )}

      <FormatoExportModal aberto={!!pendenteExport} onClose={() => setPendenteExport(null)} onEscolher={executarExport} />

      <div style={{ position: "fixed", left: -9999, top: 0, width: 360, pointerEvents: "none" }} aria-hidden>
        <div ref={imagemRef}>
          {imagemParaExportar && (
            <div style={{ background: "#ffffff", padding: 24, fontFamily: "system-ui, sans-serif", color: "#111827", border: "1px solid #e5e7eb" }}>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 2 }}>{imagemParaExportar.titulo}</div>
              <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 14 }}>{new Date().toLocaleDateString("pt-BR")}</div>
              <div style={{ textAlign: "center", margin: "14px 0" }}>
                <div style={{ fontSize: 11, color: "#6b7280" }}>Preço de Venda</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: "#4f46e5", fontFamily: "monospace" }}>
                  {formatBRL(imagemParaExportar.precoVenda)}
                </div>
              </div>
              <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, fontSize: 13 }}>
                {imagemParaExportar.componentes && imagemParaExportar.componentes.length > 0 ? (
                  <>
                    {imagemParaExportar.componentes.map((c, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                        <span>{c.nome}</span>
                        <span>{formatBRL(c.quantidade * c.custoUnitario)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                    <span>Custo</span>
                    <span>{formatBRL(imagemParaExportar.custoTotal)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                  <span>Taxa variável ({(imagemParaExportar.taxaVariavelPct * 100).toFixed(1)}%)</span>
                  <span>{formatBRL(imagemParaExportar.taxaVariavelValor)}</span>
                </div>
                {imagemParaExportar.taxaFixa > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                    <span>Taxa fixa</span>
                    <span>{formatBRL(imagemParaExportar.taxaFixa)}</span>
                  </div>
                )}
                {imagemParaExportar.taxaExtraCalculada > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                    <span>Taxa extra</span>
                    <span>{formatBRL(imagemParaExportar.taxaExtraCalculada)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, color: "#374151" }}>
                  <span>Imposto ({(imagemParaExportar.impostoPct * 100).toFixed(1)}%)</span>
                  <span>{formatBRL(imagemParaExportar.impostoValor)}</span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 700,
                    borderTop: "1px solid #e5e7eb",
                    paddingTop: 8,
                    marginTop: 8,
                    color: "#16a34a",
                  }}
                >
                  <span>Lucro líquido</span>
                  <span>
                    {formatBRL(imagemParaExportar.lucroLiquido)} ({(imagemParaExportar.margemEfetivaPct * 100).toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {ConfirmDialog}
    </>
  );
}

function VariacoesView({
  produtos,
  lojas,
  anuncios,
  aliquotaDasPadrao,
  confirm,
}: {
  produtos: ProdutoOpcao[];
  lojas: LojaOpcao[];
  anuncios: AnuncioSalvo[];
  aliquotaDasPadrao: number;
  confirm: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const [, startTransition] = useTransition();
  const [nomeAnuncio, setNomeAnuncio] = useState("");
  const [tituloAnuncio, setTituloAnuncio] = useState("");
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [modoTaxas, setModoTaxas] = useState<"manual" | "loja">("manual");
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [custoUnitarioBase, setCustoUnitarioBase] = useState(10);
  const [taxaFixa, setTaxaFixa] = useState(4);
  const [taxaVariavelPct, setTaxaVariavelPct] = useState(20);
  const [taxaAdicionalPct, setTaxaAdicionalPct] = useState(0);
  const [impostoPct, setImpostoPct] = useState(aliquotaDasPadrao);
  const [margemPct, setMargemPct] = useState(28);
  const [anuncioExpandido, setAnuncioExpandido] = useState<string | null>(null);

  interface VariacaoLinha {
    id: string;
    nome: string;
    multiplicador: number;
    custoManual: number | null;
  }
  const [variacoes, setVariacoes] = useState<VariacaoLinha[]>([
    { id: "v1", nome: "Unidade", multiplicador: 1, custoManual: null },
    { id: "v2", nome: "Kit 2", multiplicador: 2, custoManual: null },
    { id: "v3", nome: "Kit 3", multiplicador: 3, custoManual: null },
  ]);

  const lojaSelecionada = useMemo(() => lojas.find((l) => l.id === lojaId) ?? null, [lojas, lojaId]);
  const canaisAgrupados = useMemo(() => Array.from(new Set(lojas.map((l) => l.canalNome))), [lojas]);

  function taxasEfetivas(): TaxasPlataforma {
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
  }

  function calcularVariacao(v: VariacaoLinha) {
    const custo = v.custoManual ?? custoUnitarioBase * v.multiplicador;
    if (modoTaxas === "loja" && lojaSelecionada?.tipoTaxa === "faixas") {
      const { resultado } = resolverComFaixaShopee(custo, "margem", margemPct / 100, {
        impostoPct: impostoPct / 100,
        taxaAdicionalPct: taxaAdicionalPct / 100,
        taxaExtraValor: lojaSelecionada.taxaExtraValor ?? undefined,
        taxaExtraTipo: lojaSelecionada.taxaExtraTipo,
      });
      return { custo, resultado };
    }
    const resultado = resolverPorMargem(custo, margemPct / 100, taxasEfetivas());
    return { custo, resultado };
  }

  function adicionarVariacao() {
    setVariacoes((prev) => [
      ...prev,
      { id: `v${Date.now()}`, nome: `Kit ${prev.length + 1}`, multiplicador: prev.length + 1, custoManual: null },
    ]);
  }

  function removerVariacao(id: string) {
    setVariacoes((prev) => prev.filter((v) => v.id !== id));
  }

  function atualizarVariacao(id: string, campo: keyof VariacaoLinha, valor: string) {
    setVariacoes((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        if (campo === "nome") return { ...v, nome: valor };
        if (campo === "multiplicador") return { ...v, multiplicador: Number(valor) || 1 };
        return { ...v, custoManual: valor.trim() === "" ? null : Number(valor) };
      }),
    );
  }

  function salvarAnuncio() {
    if (!nomeAnuncio.trim() || variacoes.length === 0) {
      toast.error("Preencha o nome do anúncio e adicione ao menos uma variação");
      return;
    }
    const variacoesInput: VariacaoInput[] = variacoes.map((v) => {
      const { custo, resultado } = calcularVariacao(v);
      const taxas = taxasEfetivas();
      const taxaVariavelPctFinal =
        modoTaxas === "loja" && lojaSelecionada?.tipoTaxa === "faixas"
          ? resultado.taxaVariavelValor / (resultado.precoVenda || 1)
          : taxas.taxaVariavelPct;
      const taxaFixaFinal = modoTaxas === "loja" && lojaSelecionada?.tipoTaxa === "faixas" ? resultado.precoVenda - custo - resultado.lucroLiquido - resultado.taxaVariavelValor - resultado.impostoValor : taxas.taxaFixa;
      return {
        nome_variacao: v.nome,
        multiplicador: v.multiplicador,
        custo,
        taxa_variavel_pct: taxaVariavelPctFinal,
        taxa_fixa: Math.max(0, taxaFixaFinal),
        taxa_adicional_pct: taxaAdicionalPct / 100,
        imposto_pct: impostoPct / 100,
        taxa_extra_valor: modoTaxas === "loja" ? (lojaSelecionada?.taxaExtraValor ?? null) : null,
        taxa_extra_tipo: modoTaxas === "loja" ? (lojaSelecionada?.taxaExtraTipo ?? null) : null,
        margem_pct: margemPct / 100,
        preco_calculado: resultado.precoVenda,
        lucro: resultado.lucroLiquido,
      };
    });

    startTransition(async () => {
      try {
        await criarAnuncio({
          produto_id: produtoId,
          loja_id: modoTaxas === "loja" ? lojaId : null,
          nome_anuncio: nomeAnuncio,
          titulo_anuncio: tituloAnuncio.trim() || null,
          componentes_base: [{ id: "base", nome: "Custo unitário base", quantidade: 1, custoUnitario: custoUnitarioBase }],
          variacoes: variacoesInput,
        });
        toast.success("Anúncio com variações salvo");
        setNomeAnuncio("");
        setTituloAnuncio("");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar anúncio");
      }
    });
  }

  async function excluirAnuncio(a: AnuncioSalvo) {
    const ok = await confirm({ title: "Remover anúncio?", message: `"${a.nome_anuncio}" e suas variações serão removidas definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      try {
        await removerAnuncio(a.id);
        toast("Anúncio removido");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover anúncio");
      }
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="text-sm font-medium text-text-primary mb-3">Anúncio com Variações</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Nome do Anúncio *</label>
            <input
              value={nomeAnuncio}
              onChange={(e) => setNomeAnuncio(e.target.value)}
              placeholder="Ex: Óleo para Barba"
              className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Título do Anúncio (opcional)</label>
            <input
              value={tituloAnuncio}
              onChange={(e) => setTituloAnuncio(e.target.value)}
              className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs text-text-secondary mb-1.5 block">Vincular Produto (opcional)</label>
          <select
            value={produtoId ?? ""}
            onChange={(e) => setProdutoId(e.target.value || null)}
            className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md text-sm text-text-primary outline-none focus:border-accent"
          >
            <option value="">Nenhum</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Custo Unitário Base (R$)</label>
            <input
              type="number"
              step="0.01"
              value={custoUnitarioBase}
              onChange={(e) => setCustoUnitarioBase(Number(e.target.value) || 0)}
              className="w-full h-9 px-3 bg-surface-1 border border-border rounded-md tabular text-text-primary outline-none focus:border-accent"
            />
          </div>
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

        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setModoTaxas("manual")}
            className={`h-9 px-3 rounded-md text-sm border transition-colors ${
              modoTaxas === "manual" ? "bg-accent-soft border-accent-soft text-accent font-medium" : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
            }`}
          >
            Manual
          </button>
          <button
            onClick={() => setModoTaxas("loja")}
            className={`h-9 px-3 rounded-md text-sm border transition-colors ${
              modoTaxas === "loja" ? "bg-accent-soft border-accent-soft text-accent font-medium" : "bg-surface-1 border-border text-text-secondary hover:bg-surface-2"
            }`}
          >
            Selecionar Loja
          </button>
        </div>

        {modoTaxas === "manual" ? (
          <div className="grid grid-cols-2 gap-4">
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
        ) : (
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
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">Variações</h3>
          <button onClick={adicionarVariacao} className="text-sm text-accent hover:underline">
            + Adicionar Variação
          </button>
        </div>
        <Table>
          <Thead>
            <tr>
              <Th>Nome</Th>
              <Th align="right">Multiplicador</Th>
              <Th align="right">Custo (R$)</Th>
              <Th align="right">Preço Sugerido</Th>
              <Th align="right">Lucro</Th>
              <Th align="right">Margem</Th>
              <Th></Th>
            </tr>
          </Thead>
          <tbody>
            {variacoes.map((v) => {
              const { custo, resultado } = calcularVariacao(v);
              return (
                <Tr key={v.id}>
                  <Td>
                    <input
                      value={v.nome}
                      onChange={(e) => atualizarVariacao(v.id, "nome", e.target.value)}
                      className="w-full bg-transparent text-text-primary outline-none"
                    />
                  </Td>
                  <Td align="right">
                    <input
                      type="number"
                      min={1}
                      value={v.multiplicador}
                      onChange={(e) => atualizarVariacao(v.id, "multiplicador", e.target.value)}
                      className="w-14 bg-transparent text-text-primary text-right outline-none tabular"
                    />
                  </Td>
                  <Td align="right">
                    <input
                      type="number"
                      step="0.01"
                      value={v.custoManual ?? custo}
                      onChange={(e) => atualizarVariacao(v.id, "custoManual", e.target.value)}
                      className="w-24 bg-transparent text-text-primary text-right outline-none tabular"
                    />
                  </Td>
                  <Td align="right" mono className="text-accent">
                    {formatBRL(resultado.precoVenda)}
                  </Td>
                  <Td align="right" mono>
                    {formatBRL(resultado.lucroLiquido)}
                  </Td>
                  <Td align="right" mono className="text-positive">
                    {(resultado.margemEfetivaPct * 100).toFixed(1)}%
                  </Td>
                  <Td align="right">
                    <button onClick={() => removerVariacao(v.id)} className="text-text-tertiary hover:text-negative">
                      ×
                    </button>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <div className="p-4 border-t border-border">
          <Button variant="primary" onClick={salvarAnuncio}>
            Salvar Anúncio
          </Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 pt-5 pb-4">
          <h2 className="text-base font-semibold text-text-primary">Anúncios Salvos</h2>
        </div>
        <div className="divide-y divide-border">
          {anuncios.map((a) => (
            <div key={a.id} className="p-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setAnuncioExpandido((v) => (v === a.id ? null : a.id))}
                  className="text-sm font-medium text-text-primary hover:text-accent text-left"
                >
                  {a.nome_anuncio} <span className="text-text-tertiary font-normal">({a.variacoes.length} variações)</span>
                </button>
                <button onClick={() => excluirAnuncio(a)} className="text-xs text-negative hover:underline shrink-0">
                  Remover
                </button>
              </div>
              {anuncioExpandido === a.id && (
                <div className="mt-3 border border-border rounded-md divide-y divide-border">
                  {a.variacoes.map((v) => (
                    <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="text-text-primary">{v.nome_variacao}</span>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-text-secondary">custo {formatBRL(v.custo)}</span>
                        <span className="font-mono text-accent">{formatBRL(v.preco_calculado)}</span>
                        <span className="font-mono text-positive">
                          {v.preco_calculado > 0 ? ((v.lucro / v.preco_calculado) * 100).toFixed(1) : "0.0"}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {anuncios.length === 0 && (
            <p className="text-sm text-text-tertiary text-center py-8">Nenhum anúncio com variações salvo ainda.</p>
          )}
        </div>
      </Card>
    </div>
  );
}

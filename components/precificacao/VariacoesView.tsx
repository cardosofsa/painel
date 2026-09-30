"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { numeroOuNulo } from "@/lib/format";
import { MODOS, type ModoCalculo } from "@/lib/pricing";
import {
  calcularVariacao,
  type ConfigVariacoes,
  type VariacaoLinha,
} from "@/lib/precificacao-variacoes";
import { type ResumoExport, useExportarPrecificacao } from "@/components/precificacao/resultado-compartilhado";
import { TabelaVariacoes } from "@/components/precificacao/variacoes/TabelaVariacoes";
import { VariacoesSalvas } from "@/components/precificacao/variacoes/VariacoesSalvas";
import { criarAnuncio, removerAnuncio, gerarTituloAnuncioIA, type VariacaoInput } from "@/app/(painel)/precificacao/actions";
import { GeradorIA } from "@/components/ia/GeradorIA";
import { limiteEfetivo } from "@/lib/ia/prompts";
import type { ProdutoOpcao, LojaOpcao, AnuncioSalvo } from "@/lib/precificacao-estado";
import { executarComToast } from "@/lib/acao-cliente";
import { inputClass } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";

const VARIACOES_INICIAIS: VariacaoLinha[] = [
  { id: "v1", nome: "Unidade", multiplicador: 1, custoManual: null, parametroOverride: null },
  { id: "v2", nome: "Kit 2", multiplicador: 2, custoManual: null, parametroOverride: null },
  { id: "v3", nome: "Kit 3", multiplicador: 3, custoManual: null, parametroOverride: null },
];

export function VariacoesView({
  produtos,
  lojas,
  anuncios,
  aliquotaDasPadrao,
  confirm,
  setVisao,
  exportarAnunciosCsv,
  iaDisponivel,
}: {
  produtos: ProdutoOpcao[];
  lojas: LojaOpcao[];
  anuncios: AnuncioSalvo[];
  aliquotaDasPadrao: number;
  /** Vem do servidor via PrecificacaoClient: `GEMINI_API_KEY` não é lida no cliente. */
  iaDisponivel: boolean;
  confirm: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  setVisao: (visao: "individual" | "variacoes" | "massa" | "historico") => void;
  exportarAnunciosCsv: () => void;
}) {
  const [pending, startTransition] = useTransition();
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
  const [modo, setModo] = useState<ModoCalculo>("margem");
  const [margemPct, setMargemPct] = useState(28);
  const [lucroDesejado, setLucroDesejado] = useState(30);
  const [precoFixo, setPrecoFixo] = useState(99.9);
  const [variacoes, setVariacoes] = useState<VariacaoLinha[]>(VARIACOES_INICIAIS);
  const { setPendenteExport, setPendenteImagem, modais: modaisExportacao } = useExportarPrecificacao();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- override de parâmetro só faz sentido dentro do modo em que foi digitado
    setVariacoes((prev) => prev.map((v) => ({ ...v, parametroOverride: null })));
  }, [modo]);

  const lojaSelecionada = useMemo(() => lojas.find((l) => l.id === lojaId) ?? null, [lojas, lojaId]);
  const canaisAgrupados = useMemo(() => Array.from(new Set(lojas.map((l) => l.canalNome))), [lojas]);
  const parametroPadrao = modo === "margem" ? margemPct : modo === "lucro" ? lucroDesejado : precoFixo;

  const config: ConfigVariacoes = {
    modo,
    parametroPadrao,
    custoUnitarioBase,
    impostoPct,
    taxaAdicionalPct,
    loja: modoTaxas === "loja" ? lojaSelecionada : null,
    taxaFixa,
    taxaVariavelPct,
  };
  const calcular = (v: VariacaoLinha) => calcularVariacao(config, v);

  function adicionarVariacao() {
    setVariacoes((prev) => [
      ...prev,
      { id: `v${Date.now()}`, nome: `Kit ${prev.length + 1}`, multiplicador: prev.length + 1, custoManual: null, parametroOverride: null },
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
        // `Number("1,50")` — o usuário digitando no formato brasileiro — devolve NaN, e o
        // `??` lá na frente não pega NaN: ele atravessava o cálculo inteiro e só estourava
        // no INSERT. `numeroOuNulo` converte vírgula e recusa qualquer coisa não finita.
        if (campo === "multiplicador") return { ...v, multiplicador: numeroOuNulo(valor) ?? 1 };
        if (campo === "parametroOverride") return { ...v, parametroOverride: numeroOuNulo(valor) };
        return { ...v, custoManual: numeroOuNulo(valor) };
      }),
    );
  }

  function resumoDeVariacao(v: VariacaoLinha): ResumoExport {
    const { resultado, taxas } = calcular(v);
    return {
      titulo: `${nomeAnuncio.trim() || "Anúncio"} — ${v.nome}`,
      precoVenda: resultado.precoVenda,
      custoTotal: resultado.custoTotal,
      taxaVariavelValor: resultado.taxaVariavelValor,
      taxaVariavelPct: taxas.taxaVariavelPct,
      taxaFixa: taxas.taxaFixa,
      taxaAdicionalValor: resultado.taxaAdicionalValor,
      taxaAdicionalPct: taxaAdicionalPct / 100,
      impostoValor: resultado.impostoValor,
      impostoPct: impostoPct / 100,
      taxaExtraCalculada: resultado.taxaExtraCalculada,
      lucroLiquido: resultado.lucroLiquido,
      margemEfetivaPct: resultado.margemEfetivaPct,
      componentes: null,
      faixaVenda: null,
    };
  }

  const podeSalvar = !!nomeAnuncio.trim() && custoUnitarioBase > 0 && variacoes.length > 0;

  function salvarAnuncio() {
    if (!podeSalvar) {
      toast.error("Preencha o nome do anúncio, o custo unitário base e adicione ao menos uma variação");
      return;
    }
    const variacoesInput: VariacaoInput[] = variacoes.map((v) => {
      const { custo, resultado, taxas } = calcular(v);
      return {
        nome_variacao: v.nome,
        multiplicador: v.multiplicador,
        custo,
        taxa_variavel_pct: taxas.taxaVariavelPct,
        taxa_fixa: taxas.taxaFixa,
        taxa_adicional_pct: taxaAdicionalPct / 100,
        imposto_pct: impostoPct / 100,
        taxa_extra_valor: taxas.taxaExtraValor ?? null,
        taxa_extra_tipo: taxas.taxaExtraTipo ?? null,
        margem_pct: resultado.margemEfetivaPct,
        preco_calculado: resultado.precoVenda,
        lucro: resultado.lucroLiquido,
      };
    });

    startTransition(async () => {
      const r = await executarComToast(
        criarAnuncio({
          produto_id: produtoId,
          loja_id: modoTaxas === "loja" ? lojaId : null,
          nome_anuncio: nomeAnuncio,
          titulo_anuncio: tituloAnuncio.trim() || null,
          componentes_base: [{ id: "base", nome: "Custo unitário base", quantidade: 1, custoUnitario: custoUnitarioBase }],
          variacoes: variacoesInput,
        }),
        { sucesso: "Anúncio com variações salvo", erro: "Erro ao salvar anúncio" },
      );
      if (r.ok) {
        setNomeAnuncio("");
        setTituloAnuncio("");
      }
    });
  }

  async function excluirAnuncio(a: AnuncioSalvo) {
    const ok = await confirm({ title: "Remover anúncio?", message: `"${a.nome_anuncio}" e suas variações serão removidas definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerAnuncio(a.id), { sucesso: "Anúncio removido", erro: "Erro ao remover anúncio" });
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <h3 className="text-sm font-medium text-text-primary mb-3">Produto com Variações</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">
              Nome do Anúncio <span className="text-negative">*</span>
            </label>
            <input
              value={nomeAnuncio}
              onChange={(e) => setNomeAnuncio(e.target.value)}
              placeholder="Ex: Óleo para Barba"
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Título do Anúncio (opcional)</label>
            <input value={tituloAnuncio} onChange={(e) => setTituloAnuncio(e.target.value)} className={inputClass} />
            <GeradorIA
              key={`ia-titulo-var-${produtoId ?? nomeAnuncio}`}
              rotulo="Gerar título com IA"
              tipo="titulo"
              limite={limiteEfetivo("titulo", lojaSelecionada?.limiteTitulo)}
              termoPrincipal={nomeAnuncio}
              valorAtual={tituloAnuncio}
              disponivel={iaDisponivel}
              desabilitado={!nomeAnuncio.trim()}
              motivoDesabilitado={!nomeAnuncio.trim() ? "Preencha o nome do anúncio primeiro." : undefined}
              gerar={(instrucaoExtra, tom) =>
                gerarTituloAnuncioIA({
                  produtoNome: nomeAnuncio,
                  sku: produtos.find((p) => p.id === produtoId)?.sku ?? null,
                  canal: lojaSelecionada?.canalNome ?? null,
                  loja: lojaSelecionada?.nome ?? null,
                  custo: custoUnitarioBase,
                      variacoes: variacoes.map((v) => v.nome.trim()).filter(Boolean),
                  limite: lojaSelecionada?.limiteTitulo ?? null,
                  tom,
                  instrucaoExtra,
                })
              }
              onUsar={setTituloAnuncio}
            />
          </div>
        </div>
        <div className="mb-4">
          <label className="text-xs text-text-secondary mb-1.5 block">Vincular Produto (opcional)</label>
          <select value={produtoId ?? ""} onChange={(e) => setProdutoId(e.target.value || null)} className={inputClass}>
            <option value="">Nenhum</option>
            {produtos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} — {p.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="text-xs text-text-secondary mb-1.5 block">Como calcular o preço (padrão pra variações sem override)</label>
          <div className="flex gap-2 flex-wrap">
            {MODOS.map((m) => (
              <Chip key={m.id} onClick={() => setModo(m.id)} ativo={modo === m.id}>
                {m.label}
              </Chip>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">
              Custo Unitário Base (R$) <span className="text-negative">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              value={custoUnitarioBase}
              onChange={(e) => setCustoUnitarioBase(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">
              {modo === "margem" ? "Margem Líquida Alvo (%)" : modo === "lucro" ? "Lucro Líquido Desejado (R$)" : "Preço de Venda (R$)"}
            </label>
            <input
              type="number"
              step={modo === "margem" ? "0.1" : "0.01"}
              value={parametroPadrao}
              onChange={(e) => {
                const valor = Number(e.target.value) || 0;
                if (modo === "margem") setMargemPct(valor);
                else if (modo === "lucro") setLucroDesejado(valor);
                else setPrecoFixo(valor);
              }}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Taxa Adicional (%)</label>
            <input
              type="number"
              step="0.1"
              value={taxaAdicionalPct}
              onChange={(e) => setTaxaAdicionalPct(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Imposto / DAS (%)</label>
            <input
              type="number"
              step="0.1"
              value={impostoPct}
              onChange={(e) => setImpostoPct(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex gap-2 mb-3 flex-wrap">
          <Chip onClick={() => setModoTaxas("manual")} ativo={modoTaxas === "manual"}>
            Manual
          </Chip>
          <Chip onClick={() => setModoTaxas("loja")} ativo={modoTaxas === "loja"}>
            Selecionar Loja
          </Chip>
        </div>

        {modoTaxas === "manual" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-text-secondary mb-1.5 block">Taxa Fixa (R$)</label>
              <input
                type="number"
                step="0.01"
                value={taxaFixa}
                onChange={(e) => setTaxaFixa(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1.5 block">Taxa Variável (%)</label>
              <input
                type="number"
                step="0.1"
                value={taxaVariavelPct}
                onChange={(e) => setTaxaVariavelPct(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
          </div>
        ) : (
          <select value={lojaId ?? ""} onChange={(e) => setLojaId(e.target.value || null)} className={inputClass}>
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

      <TabelaVariacoes
        variacoes={variacoes}
        modo={modo}
        parametroPadrao={parametroPadrao}
        calcular={calcular}
        impostoPct={impostoPct}
        taxaAdicionalPct={taxaAdicionalPct}
        resumoDe={resumoDeVariacao}
        onCopiar={(dados) => setPendenteExport({ acao: "copiar", dados })}
        onWhatsapp={(dados) => setPendenteExport({ acao: "whatsapp", dados })}
        onImagem={setPendenteImagem}
        onAdicionar={adicionarVariacao}
        onRemover={removerVariacao}
        onAtualizar={atualizarVariacao}
        onSalvar={salvarAnuncio}
        salvando={pending}
        podeSalvar={podeSalvar}
      />

      <VariacoesSalvas
        anuncios={anuncios}
        onExcluir={excluirAnuncio}
        onExportarCsv={exportarAnunciosCsv}
        onVerHistorico={() => setVisao("historico")}
      />

      {modaisExportacao}
    </div>
  );
}

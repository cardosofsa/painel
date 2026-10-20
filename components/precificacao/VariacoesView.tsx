"use client";
import { CampoNumero } from "@/components/ui/CampoNumero";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { formatBRL, numeroOuNulo } from "@/lib/format";
import { margemAtingida, type ModoCalculo } from "@/lib/pricing";
import {
  calcularVariacao,
  custoDaVariacao,
  UNIDADES_BASE,
  unidadeBase,
  type ConfigVariacoes,
  type UnidadeBase,
  type VariacaoLinha,
} from "@/lib/precificacao-variacoes";
import { type ResumoExport, useExportarPrecificacao } from "@/components/precificacao/resultado-compartilhado";
import { EscadaPrecos, ListaVariacoes } from "@/components/precificacao/variacoes/TabelaVariacoes";
import { Button } from "@/components/ui/Button";
import { ChevronDown, Copy, ImageIcon, MessageCircle } from "lucide-react";
import { ExportarVariacoesModal } from "@/components/precificacao/ExportarPrecificacoes";
import { VariacoesSalvas } from "@/components/precificacao/variacoes/VariacoesSalvas";
import { criarAnuncio, removerAnuncio, type VariacaoInput } from "@/app/(painel)/precificacao/actions";
import { limiteEfetivo, LIMITE_DESCRICAO_ANUNCIO } from "@/lib/ia/prompts";
import type { ProdutoOpcao, LojaOpcao, AnuncioSalvo } from "@/lib/precificacao-estado";
import { executarComToast } from "@/lib/acao-cliente";
import { FormField, inputClass } from "@/components/ui/Modal";
import { Combobox } from "@/components/ui/Combobox";
import { BotaoCusto, SeletorCusto } from "@/components/precificacao/SeletorCusto";
import { ComoLucrar, MODOS_PRECO, OndeVende, Passo } from "@/components/precificacao/blocos";
import { AvisoRascunho, IndicadorRascunho } from "@/components/precificacao/RascunhoAviso";
import { lerId, lerLista, lerNumero, lerTexto, useRascunhoDaAba, type RascunhoPendente, type RelatarRascunho } from "@/lib/precificacao-rascunho";

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
  onVerHistorico,
  empresa = null,
  rascunhoPendente = null,
  relatar,
}: {
  /** Rascunho desta aba guardado no banco (0100). */
  rascunhoPendente?: RascunhoPendente | null;
  relatar?: RelatarRascunho;
  empresa?: { nome: string | null; logoUrl: string | null } | null;
  produtos: ProdutoOpcao[];
  lojas: LojaOpcao[];
  anuncios: AnuncioSalvo[];
  aliquotaDasPadrao: number;
  /** Vem do servidor via PrecificacaoClient: `GEMINI_API_KEY` não é lida no cliente. */
  confirm: (options: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
  /** Abre o pop-up com o histórico de precificações. */
  onVerHistorico: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [nomeAnuncio, setNomeAnuncio] = useState("");
  const [tituloAnuncio, setTituloAnuncio] = useState("");
  const [descricaoAnuncio, setDescricaoAnuncio] = useState("");
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [modoTaxas, setModoTaxas] = useState<"manual" | "loja">("manual");
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [custoUnitarioBase, setCustoUnitarioBase] = useState(10);
  // A que se refere o custo base: produto a granel é por kg ou litro, e cada variação diz quanto leva.
  const [unidade, setUnidade] = useState<UnidadeBase>("un");
  const [escolhendoCusto, setEscolhendoCusto] = useState(false);
  const [taxaFixa, setTaxaFixa] = useState(4);
  const [taxaVariavelPct, setTaxaVariavelPct] = useState(20);
  const [taxaAdicionalPct, setTaxaAdicionalPct] = useState(0);
  const [impostoPct, setImpostoPct] = useState(aliquotaDasPadrao);
  const [modo, setModo] = useState<ModoCalculo>("margem");
  const [margemPct, setMargemPct] = useState(28);
  const [markupPct, setMarkupPct] = useState(50);
  const [lucroDesejado, setLucroDesejado] = useState(30);
  const [precoFixo, setPrecoFixo] = useState(99.9);
  const [variacoes, setVariacoes] = useState<VariacaoLinha[]>(VARIACOES_INICIAIS);
  const [exportandoAnuncios, setExportandoAnuncios] = useState(false);
  const { setPendenteExport, setPendenteImagem, modais: modaisExportacao } = useExportarPrecificacao(empresa);

  /** O valor próprio de uma variação só faz sentido no modo em que foi digitado. */
  function trocarModo(m: ModoCalculo) {
    if (m === modo) return;
    setModo(m);
    setVariacoes((prev) => prev.map((v) => ({ ...v, parametroOverride: null })));
  }

  function escolherProduto(id: string | null) {
    setProdutoId(id);
    const p = produtos.find((x) => x.id === id);
    if (!p) return;
    // Escolher o produto traz o custo (antes só vinculava e o custo continuava o digitado).
    if (Number(p.custo) > 0) setCustoUnitarioBase(Number(p.custo));
    if (!nomeAnuncio.trim()) setNomeAnuncio(p.nome);
  }

  const instantaneo = { nomeAnuncio, tituloAnuncio, descricaoAnuncio, produtoId, modoTaxas, lojaId, custoUnitarioBase, unidade, taxaFixa, taxaVariavelPct, taxaAdicionalPct, impostoPct, modo, margemPct, markupPct, lucroDesejado, precoFixo, variacoes };
  // Depois de salvar, o nome volta a vazio: sem nome não há o que guardar.
  const temConteudo = !!nomeAnuncio.trim();
  const aba = useRascunhoDaAba({
    visao: "variacoes",
    instantaneo,
    temConteudo,
    titulo: nomeAnuncio.trim() || "Variações",
    produtoId,
    pendenteInicial: rascunhoPendente,
    relatar,
    confirm,
    aplicar: (d) => {
      setNomeAnuncio(lerTexto(d.nomeAnuncio));
      setTituloAnuncio(lerTexto(d.tituloAnuncio));
      setDescricaoAnuncio(lerTexto(d.descricaoAnuncio));
      const pid = lerId(d.produtoId);
      setProdutoId(pid && produtos.some((p) => p.id === pid) ? pid : null);
      const lid = lerId(d.lojaId);
      const lojaValida = lid && lojas.some((l) => l.id === lid) ? lid : null;
      setLojaId(lojaValida);
      setModoTaxas(d.modoTaxas === "loja" && lojaValida ? "loja" : "manual");
      setCustoUnitarioBase(lerNumero(d.custoUnitarioBase, 10));
      setUnidade(UNIDADES_BASE.find((u) => u.id === d.unidade)?.id ?? "un");
      setTaxaFixa(lerNumero(d.taxaFixa, 4));
      setTaxaVariavelPct(lerNumero(d.taxaVariavelPct, 20));
      setTaxaAdicionalPct(lerNumero(d.taxaAdicionalPct, 0));
      setImpostoPct(lerNumero(d.impostoPct, aliquotaDasPadrao));
      setModo(MODOS_PRECO.some((m) => m.id === d.modo) ? (d.modo as ModoCalculo) : "margem");
      setMargemPct(lerNumero(d.margemPct, 28));
      setMarkupPct(lerNumero(d.markupPct, 50));
      setLucroDesejado(lerNumero(d.lucroDesejado, 30));
      setPrecoFixo(lerNumero(d.precoFixo, 99.9));
      const lidas = lerLista<VariacaoLinha>(d.variacoes, (x) =>
        typeof x.id === "string" && typeof x.nome === "string"
          ? {
              id: x.id,
              nome: x.nome,
              multiplicador: lerNumero(x.multiplicador, 1),
              custoManual: typeof x.custoManual === "number" ? x.custoManual : null,
              parametroOverride: typeof x.parametroOverride === "number" ? x.parametroOverride : null,
              embalagem: lerNumero(x.embalagem, 0),
              insumos: lerNumero(x.insumos, 0),
            }
          : null,
      );
      setVariacoes(lidas.length ? lidas : VARIACOES_INICIAIS);
    },
  });

  const lojaSelecionada = useMemo(() => lojas.find((l) => l.id === lojaId) ?? null, [lojas, lojaId]);
  const limiteDescricao = limiteEfetivo("descricao", lojaSelecionada?.limiteDescricao ?? LIMITE_DESCRICAO_ANUNCIO);
  const parametroPadrao =
    modo === "margem" ? margemPct : modo === "markup" ? markupPct : modo === "lucro" ? lucroDesejado : precoFixo;

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
        if (campo === "embalagem") return { ...v, embalagem: numeroOuNulo(valor) ?? 0 };
        if (campo === "insumos") return { ...v, insumos: numeroOuNulo(valor) ?? 0 };
        return { ...v, custoManual: numeroOuNulo(valor) };
      }),
    );
  }

  function resumoDeVariacao(v: VariacaoLinha): ResumoExport {
    const { resultado, taxas } = calcular(v);
    return {
      titulo: `${nomeAnuncio.trim() || "Anúncio"} — ${v.nome}`,
      canal: modoTaxas === "loja" && lojaSelecionada ? `${lojaSelecionada.canalNome} · ${lojaSelecionada.nome}` : null,
      imagemUrl: produtos.find((p) => p.id === produtoId)?.imagem_url ?? null,
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

  /** A escada inteira para Copiar, WhatsApp e Imagem: uma linha por variação. */
  function resumoDasVariacoes(): ResumoExport {
    const un = unidadeBase(unidade);
    return {
      ...resumoDeVariacao(variacoes[0]),
      titulo: nomeAnuncio.trim() || "Variações",
      variacoes: variacoes.map((v) => {
        const { resultado } = calcular(v);
        const qtd = v.multiplicador.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
        return {
          nome: v.nome || "Sem nome",
          quantidade: `${qtd} ${un.curto}`,
          custo: resultado.custoTotal,
          preco: resultado.precoVenda,
          lucro: resultado.lucroLiquido,
          margemPct: resultado.margemEfetivaPct,
          porUnidade: resultado.viavel && v.multiplicador > 0 && (un.fracionada || v.multiplicador !== 1) ? `${formatBRL(resultado.precoVenda / v.multiplicador)}/${un.curto}` : null,
          viavel: resultado.viavel,
        };
      }),
    };
  }
  const algumaViavel = variacoes.some((v) => calcular(v).resultado.viavel);

  const podeSalvar = !!nomeAnuncio.trim() && custoUnitarioBase > 0 && variacoes.length > 0;

  function salvarAnuncio() {
    if (!podeSalvar) {
      toast.error("Preencha o nome do anúncio, o custo base e adicione ao menos uma variação");
      return;
    }
    const variacoesInput: VariacaoInput[] = variacoes.map((v) => {
      const { custo, resultado, taxas } = calcular(v);
      const partes = custoDaVariacao(custoUnitarioBase, v);
      return {
        nome_variacao: v.nome,
        multiplicador: v.multiplicador,
        unidade,
        custo_embalagem: partes.embalagem,
        custo_insumos: partes.insumos,
        custo,
        taxa_variavel_pct: taxas.taxaVariavelPct,
        taxa_fixa: taxas.taxaFixa,
        taxa_adicional_pct: taxaAdicionalPct / 100,
        imposto_pct: impostoPct / 100,
        taxa_extra_valor: taxas.taxaExtraValor ?? null,
        taxa_extra_tipo: taxas.taxaExtraTipo ?? null,
        margem_pct: margemAtingida(resultado),
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
          descricao: descricaoAnuncio.trim() || null,
          componentes_base: [{ id: "base", nome: `Custo base por ${unidadeBase(unidade).curto}`, quantidade: 1, custoUnitario: custoUnitarioBase }],
          variacoes: variacoesInput,
        }),
        { sucesso: "Anúncio com variações salvo", erro: "Erro ao salvar anúncio" },
      );
      if (r.ok) {
        await aba.rasc.descartarAposSalvar();
        setNomeAnuncio("");
        setTituloAnuncio("");
        setDescricaoAnuncio("");
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

  const canal = modoTaxas === "loja" && lojaSelecionada ? `${lojaSelecionada.canalNome} · ${lojaSelecionada.nome}` : null;

  return (
    <div className="space-y-5">
      {escolhendoCusto && (
        <SeletorCusto
          onFechar={() => setEscolhendoCusto(false)}
          onEscolher={([{ custo }]) => {
            // Custo registrado (não é produto): vira o custo base, na unidade dele (kg, L, cx, un).
            setProdutoId(null);
            setCustoUnitarioBase(custo.custo);
            setUnidade(custo.unidade);
            if (!nomeAnuncio.trim()) setNomeAnuncio(custo.nome);
            setEscolhendoCusto(false);
          }}
        />
      )}
      {aba.pendente && <AvisoRascunho pendente={aba.pendente} onContinuar={aba.continuar} onDescartar={() => void aba.descartar()} />}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-5 items-start">
      <Card padding="nenhum" className="min-w-0">
        <Passo n={1} titulo="Anúncio e produto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:mb-0">
            <FormField label="Nome do anúncio *">
              <input value={nomeAnuncio} onChange={(e) => setNomeAnuncio(e.target.value)} placeholder="Ex.: Óleo para Barba" className={inputClass} />
            </FormField>
            <div className="flex flex-col">
              {/* Mesma linha de rótulo do FormField ao lado (text-xs, mb-1.5): os campos ficam alinhados. */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-medium text-text-secondary">Produto</span>
                <BotaoCusto compacto onClick={() => setEscolhendoCusto(true)} />
              </div>
              <Combobox
                ariaLabel="Produto"
                key={produtoId ?? "nenhum"}
                itens={produtos.map((p) => ({ id: p.id, rotulo: p.nome, busca: p.sku, detalhe: formatBRL(Number(p.custo)) }))}
                valor={produtoId}
                onChange={escolherProduto}
                placeholder="Buscar produto pelo nome ou SKU…"
              />
              <span className="mt-1.5 text-xs text-text-tertiary">Sem cadastro? Use “Custo” ou informe o custo base.</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
              <FormField label={`Custo por ${unidadeBase(unidade).curto} (R$) *`} dica="Só o produto. Embalagem e insumos vão em cada variação.">
                <CampoNumero value={custoUnitarioBase} onChange={setCustoUnitarioBase} min={0} casas={2} />
              </FormField>
              <FormField label="Vendido por" dica={unidadeBase(unidade).fracionada ? "0,5 = meia unidade" : undefined}>
                <select value={unidade} onChange={(e) => setUnidade(e.target.value as UnidadeBase)} className={inputClass}>
                  {UNIDADES_BASE.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.rotulo}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <FormField label="Título do anúncio (opcional)">
              <input value={tituloAnuncio} onChange={(e) => setTituloAnuncio(e.target.value)} className={inputClass} />
            </FormField>
          </div>
          <details className="mt-3 group">
            <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-text-secondary hover:text-text-primary list-none">
              Descrição, imposto e taxa adicional
              <ChevronDown size={14} className="transition-transform duration-[--duracao-media] group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:mb-0">
              <div className="sm:col-span-2">
                <FormField label="Descrição do anúncio (opcional)" dica="Vai junto para os produtos criados a partir destas variações.">
                  <textarea value={descricaoAnuncio} onChange={(e) => setDescricaoAnuncio(e.target.value)} className={`${inputClass} h-24 py-2 resize-y`} maxLength={limiteDescricao} />
                </FormField>
              </div>
              <FormField label="Imposto / DAS (%)">
                <CampoNumero value={impostoPct} onChange={setImpostoPct} min={0} max={50} />
              </FormField>
              <FormField label="Taxa adicional (%)">
                <CampoNumero value={taxaAdicionalPct} onChange={setTaxaAdicionalPct} min={0} max={50} />
              </FormField>
            </div>
          </details>
        </Passo>

        <Passo n={2} titulo="Onde vende" resumo={modoTaxas === "loja" && lojaSelecionada ? `${lojaSelecionada.canalNome} · ${lojaSelecionada.nome}` : "taxas à mão"}>
          <OndeVende
            lojas={lojas}
            lojaId={modoTaxas === "loja" ? lojaId : null}
            onEscolher={(id) => {
              setModoTaxas(id ? "loja" : "manual");
              if (id) setLojaId(id);
            }}
          />
          {modoTaxas === "manual" && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:mb-0">
              <FormField label="Comissão (%)">
                <CampoNumero value={taxaVariavelPct} onChange={setTaxaVariavelPct} min={0} max={99} />
              </FormField>
              <FormField label="Tarifa fixa (R$)">
                <CampoNumero value={taxaFixa} onChange={setTaxaFixa} min={0} casas={2} />
              </FormField>
            </div>
          )}
        </Passo>

        <Passo n={3} titulo="Como quer lucrar" resumo="vale para as variações sem valor próprio">
          <ComoLucrar
            modos={[...MODOS_PRECO]}
            modo={modo}
            onModo={trocarModo}
            valor={parametroPadrao}
            onValor={(valor) => {
              if (modo === "margem") setMargemPct(valor);
              else if (modo === "markup") setMarkupPct(valor);
              else if (modo === "lucro") setLucroDesejado(valor);
              else setPrecoFixo(valor);
            }}
          />
        </Passo>

        <Passo n={4} titulo="Variações" resumo={`${variacoes.length} variaç${variacoes.length === 1 ? "ão" : "ões"}`} ultimo>
          <ListaVariacoes
            variacoes={variacoes}
            unidade={unidade}
            custoBase={custoUnitarioBase}
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
          />
        </Passo>
      </Card>

      <div className="lg:sticky lg:top-20">
        <EscadaPrecos
          variacoes={variacoes}
          unidade={unidade}
          calcular={calcular}
          canal={canal}
          acoes={
            <>
              <Button variant="primary" className="w-full" onClick={salvarAnuncio} loading={pending} disabled={!podeSalvar}>
                Salvar variações
              </Button>
              {!nomeAnuncio.trim() && <p className="mt-1.5 text-xs text-text-tertiary">Dê um nome ao anúncio para salvar.</p>}
              <Button variant="secondary" size="sm" className="w-full mt-2" onClick={() => void aba.rasc.salvarRascunho()} loading={aba.rasc.salvando} disabled={!temConteudo}>
                Salvar rascunho
              </Button>
              {/* Os mesmos atalhos da Individual, com a escada inteira (cada variação tem os seus ao abrir). */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPendenteExport({ acao: "copiar", dados: resumoDasVariacoes() })} disabled={!algumaViavel}>
                  <Copy size={14} aria-hidden /> Copiar
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPendenteExport({ acao: "whatsapp", dados: resumoDasVariacoes() })} disabled={!algumaViavel}>
                  <MessageCircle size={14} aria-hidden /> WhatsApp
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPendenteImagem(resumoDasVariacoes())} disabled={!algumaViavel}>
                  <ImageIcon size={14} aria-hidden /> Imagem
                </Button>
              </div>
              <div className="mt-2 text-center">
                <IndicadorRascunho sujo={aba.rasc.sujo} salvando={aba.rasc.salvando} salvoEm={aba.rasc.salvoEm} semMigracao={aba.rasc.semMigracao} />
              </div>
            </>
          }
        />
      </div>
      </div>

      <VariacoesSalvas
        anuncios={anuncios}
        onExcluir={excluirAnuncio}
        onExportarCsv={() => setExportandoAnuncios(true)}
        onVerHistorico={onVerHistorico}
      />

      {modaisExportacao}
      {exportandoAnuncios && (
        <ExportarVariacoesModal onClose={() => setExportandoAnuncios(false)} empresa={empresa} grupos={[{ id: "todos", rotulo: "Todos os anúncios", lista: anuncios }]} />
      )}
    </div>
  );
}

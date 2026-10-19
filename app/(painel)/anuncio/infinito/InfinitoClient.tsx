"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Circle, MessageCircle, Plus, Settings, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { AberturaMarca } from "@/components/anuncio/AberturaMarca";
import { TrilhoEtapas } from "@/components/anuncio/TrilhoEtapas";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Combobox } from "@/components/ui/Combobox";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Modal, inputClass } from "@/components/ui/Modal";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { ModalSaida } from "@/components/ui/ModalSaida";
import { useProtegerSaida } from "@/lib/hooks/useProtegerSaida";
import { Tabs } from "@/components/ui/Tabs";
import { PainelTitulos } from "@/components/estudio/PainelTitulos";
import { PainelConcorrentes } from "@/components/estudio/PainelConcorrentes";
import { PainelCapa } from "@/components/estudio/PainelCapa";
import { PainelDescricao } from "@/components/estudio/PainelDescricao";
import { PainelPacote } from "@/components/estudio/PainelPacote";
import { PainelShopee } from "@/components/estudio/PainelShopee";
import { ConversaAssistente } from "@/components/estudio/ConversaAssistente";
import { PerfilForm } from "@/components/marca/PerfilForm";
import { AprenderCapas } from "@/components/marca/AprenderCapas";
import { FichaEditor } from "@/components/marca/FichaEditor";
import { MemoriaMarcaCard } from "@/components/marca/MemoriaMarca";
import { DirecaoIA } from "@/components/marca/DirecaoIA";
import { ConferirTexto } from "@/components/marca/ConferirTexto";
import { termosDoPerfil } from "@/lib/conformidade/termos";
import { LIMITE_DESCRICAO_ESTUDIO } from "@/lib/ia/prompts-descricao-estudio";
import { executarComToast } from "@/lib/acao-cliente";
import { calcularEtapas, ETAPAS, type EtapaId } from "@/lib/anuncio/etapas";
import { mesclarFicha, type FichaMarca, type TipoImagemMarca } from "@/lib/marca/ficha";
import { regrasDaPlataforma, type PlataformaMarcaId } from "@/lib/marca/plataformas";
import { urlPublicaImagem, type ExemploMarca, type FichaSalva, type LojaParaMarca, type MemoriaMarca, type PerfilMarca } from "@/lib/marca/tipos";
import type { AcaoProposta } from "@/lib/ia/prompts-assistente";
import { adicionarMemoriaMarca, salvarFichaMarca } from "../../produtos/marca/actions";
import { abrirRascunho, abrirRascunhoPorId, criarProdutoParaAnuncio, conversar, descartarRascunho, marcarPublicado, definirNumeroImagens, escolherTitulo, gerarDescricaoEstudio, gerarTitulosEstudio, pesquisarConcorrentesEstudio, salvarDescricao, type RascunhoAberto, type TitulosDoEstudio } from "../../produtos/estudio/actions";

export type ConfigAba = "perfil" | "direcao" | "ficha" | "memoria" | "conferir" | "aprender";
type Qual = "titulos" | "concorrentes" | "conversa" | "descricao" | null;
type LojaComPlataforma = LojaParaMarca & { plataforma: PlataformaMarcaId | null };

/** Teto da descrição no estúdio: o mesmo do servidor (limite da Shopee Brasil). */
const TETO_DESCRICAO = LIMITE_DESCRICAO_ESTUDIO;

const ABAS_CONFIG: { value: ConfigAba; label: string }[] = [
  { value: "perfil", label: "Perfil" },
  { value: "direcao", label: "Direção da IA" },
  { value: "ficha", label: "Ficha de arte" },
  { value: "memoria", label: "Memória" },
  { value: "aprender", label: "Aprender das capas" },
  { value: "conferir", label: "Conferir texto" },
];

/**
 * Anúncio Infinito: o fluxo inteiro do anúncio numa tela guiada, uma etapa por vez. As
 * configurações (perfil, ficha, memória, conferência) ficam numa gaveta sempre à mão, e o
 * assistente numa janela de conversa. O estado do trabalho fica no banco (rascunho): recarregar
 * ou sair e voltar retoma na etapa certa.
 */
export function InfinitoClient({
  produtos,
  produtoInicial,
  rascunhoInicial,
  perfilInicial = null,
  saldoTexto,
  configInicial,
  perfis,
  memorias,
  exemplos,
  semMigracaoExemplos,
  fichas,
  lojas,
  iaDisponivel,
  imagensUsadas,
  semMigracao,
}: {
  produtos: { id: string; rotulo: string; sku: string | null }[];
  produtoInicial: string | null;
  rascunhoInicial: RascunhoAberto | null;
  perfilInicial?: string | null;
  /** Saldo de IA de texto lido no servidor, para aparecer antes de gastar. */
  saldoTexto: { origem: "propria" | "sistema"; usadas: number; limite: number } | null;
  configInicial: ConfigAba | null;
  perfis: PerfilMarca[];
  memorias: MemoriaMarca[];
  exemplos: ExemploMarca[];
  semMigracaoExemplos: boolean;
  fichas: FichaSalva[];
  lojas: LojaComPlataforma[];
  iaDisponivel: boolean;
  imagensUsadas: number | null;
  semMigracao: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [qual, setQual] = useState<Qual>(null);
  const [produtoId, setProdutoId] = useState<string | null>(rascunhoInicial?.produtoId ?? produtoInicial);
  const [perfilId, setPerfilId] = useState(rascunhoInicial ? (rascunhoInicial.perfilId ?? "") : (perfilInicial ?? perfis[0]?.id ?? ""));
  const [lojaDecidida, setLojaDecidida] = useState(!!produtoInicial || !!rascunhoInicial);
  const [rascunho, setRascunho] = useState<RascunhoAberto | null>(rascunhoInicial);
  // O par produto/perfil que de fato está aberto: trocar o seletor depois não muda o rascunho.
  const [aberto, setAberto] = useState<{ produto: string; perfil: string } | null>(
    rascunhoInicial ? { produto: rascunhoInicial.produtoId, perfil: rascunhoInicial.perfilId ?? "" } : null,
  );
  const [manual, setManual] = useState<EtapaId | null>(null);
  const [titulos, setTitulos] = useState<TitulosDoEstudio | null>(null);
  const [descGerada, setDescGerada] = useState<{ texto: string; palavras: string[]; versao: number; meta: string } | null>(null);
  const [versaoDesc, setVersaoDesc] = useState(0);
  const [observacao, setObservacao] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [meta, setMeta] = useState<string | null>(null);
  const [configAberta, setConfigAberta] = useState(!!configInicial);
  const [abaConfig, setAbaConfig] = useState<ConfigAba>(configInicial ?? "perfil");
  const [cfgPerfil, setCfgPerfil] = useState<string>(perfis[0]?.id ?? "novo");
  const [conversaAberta, setConversaAberta] = useState(false);
  const [shopeeAberto, setShopeeAberto] = useState(false);
  // Produto que ainda não está cadastrado (criado na hora, a partir do nome digitado na busca).
  const [novoProduto, setNovoProduto] = useState<{ nome: string; custo: number | null } | null>(null);
  // Montar título e descrição com IA logo depois de abrir; e o passo em andamento, quando montando.
  const [montarAoAbrir, setMontarAoAbrir] = useState(iaDisponivel);
  const [montando, setMontando] = useState<string | null>(null);
  // Erro de IA fica na tela (com "Tentar de novo") até dar certo: antes era só um toast que sumia.
  const [falhaIA, setFalhaIA] = useState<{ etapa: EtapaId; mensagem: string; repetir: () => void } | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();
  // O que foi digitado e ainda não está no rascunho: o resto já fica no banco a cada ação.
  const [descPendente, setDescPendente] = useState<string | null>(null);
  const [tituloPendente, setTituloPendente] = useState<string | null>(null);
  const protecao = useProtegerSaida({
    sujo: !!rascunho && (descPendente !== null || tituloPendente !== null),
    salvarRascunho: async () => {
      if (!rascunho) return true;
      if (tituloPendente) {
        const r = await executarComToast(escolherTitulo({ rascunho_id: rascunho.id, titulo: tituloPendente.trim() }), { erro: "Não foi possível salvar o título." });
        if (!r.ok) return false;
        setTituloPendente(null);
      }
      if (descPendente) {
        const r = await executarComToast(salvarDescricao({ rascunho_id: rascunho.id, descricao: descPendente, original: descGerada?.texto ?? rascunho.descricao }), { erro: "Não foi possível salvar a descrição." });
        if (!r.ok) return false;
        setDescPendente(null);
      }
      return true;
    },
  });

  const perfil = perfis.find((p) => p.id === aberto?.perfil) ?? null;
  // O que a IA de texto vai seguir neste perfil (0109): instruções e exemplos ativos.
  const direcao = {
    instrucoes: [perfil?.instrucoes_titulo, perfil?.instrucoes_descricao].filter((t) => t?.trim()).length,
    exemplos: exemplos.filter((e) => e.ativo && (e.perfil_id === null || e.perfil_id === perfil?.id)).length,
  };
  const plataforma = regrasDaPlataforma(perfil?.plataforma ?? "shopee");
  const termosPerfil = useMemo(() => termosDoPerfil(perfil), [perfil]);
  const limiteTitulo = plataforma.limiteTitulo ?? 120;
  const limiteDescricao = Math.min(plataforma.limiteDescricao ?? TETO_DESCRICAO, TETO_DESCRICAO);

  const fichaAtiva = (tipo: TipoImagemMarca): FichaMarca => (perfil ? (fichas.find((f) => f.perfil_id === perfil.id && f.tipo_imagem === tipo && f.ativa)?.dados ?? {}) : {});
  const fichaCapa1 = useMemo(() => mesclarFicha(fichaAtiva("geral"), fichaAtiva("capa_1")), [perfil, fichas]); // eslint-disable-line react-hooks/exhaustive-deps

  const estado = rascunho?.estado;
  const capaAprovada = (estado?.capas ?? []).some((c) => c.veredito === "aprovada");
  const calculo = calcularEtapas({
    lojaDecidida: lojaDecidida || !!rascunho,
    produtoId,
    rascunhoAberto: !!rascunho,
    titulo: rascunho?.titulo ?? null,
    descricao: rascunho?.descricao ?? null,
    capaAprovada,
    itemCriadoNaShopee: !!estado?.itemShopee,
    publicado: rascunho?.status === "publicado",
  });
  const etapaLiberada = (id: EtapaId) => calculo.etapas.find((e) => e.id === id)?.liberada ?? false;
  const atual: EtapaId = manual && etapaLiberada(manual) ? manual : calculo.atual;
  const indice = ETAPAS.findIndex((e) => e.id === atual);
  const proxima = ETAPAS[indice + 1];
  const anterior = ETAPAS[indice - 1];

  /** Relê o rascunho aberto PELO ID (depois de cada ação). Pelo par produto/perfil, com dois
   * rascunhos do mesmo produto, a tela pulava para o mais recente. */
  async function carregar(): Promise<boolean> {
    if (!rascunho) return false;
    const r = await executarComToast(abrirRascunhoPorId({ rascunho_id: rascunho.id }), { erro: "Não foi possível atualizar o anúncio." });
    if (r.ok) setRascunho(r.dado);
    return r.ok;
  }

  /** Põe o rascunho na tela e o id na URL (recarregar ou voltar para a página abre ESTE rascunho). */
  function mostrarAberto(r: RascunhoAberto, par: { produto: string; perfil: string }) {
    setRascunho(r);
    setAberto(par);
    if (r.id !== rascunho?.id) router.replace(`/anuncio/infinito?rascunho=${r.id}`, { scroll: false });
  }

  async function abrirPar(par: { produto: string; perfil: string }): Promise<RascunhoAberto | null> {
    const r = await executarComToast(abrirRascunho({ produto_id: par.produto, perfil_id: par.perfil || null }), { erro: "Não foi possível abrir o anúncio." });
    if (!r.ok) return null;
    mostrarAberto(r.dado, par);
    return r.dado;
  }

  /**
   * "Montar com IA": o que antes eram vários cliques numa tacada só. Gera os títulos, usa o de
   * melhor nota que passa na conferência de termos, gera a descrição e salva se ela também
   * passa, e para na Capa (que gasta a cota de imagens e pede a sua aprovação). Onde algo não
   * passa, para naquela etapa com o que já foi feito, para você ajustar.
   */
  async function montarComIA(rascunhoId: string) {
    setFalhaIA(null);
    try {
      setMontando("Gerando os títulos…");
      const t = await executarComToast(gerarTitulosEstudio({ rascunho_id: rascunhoId, pedido: null }), { erro: "Não foi possível gerar os títulos." });
      if (!t.ok) return setManual("titulo");
      setTitulos(t.dado);
      const melhor = t.dado.variantes.find((x) => x.utilizavel);
      if (!melhor) {
        toast.message("Nenhum título gerado passou na conferência. Escolha um e ajuste, ou digite o seu.");
        return setManual("titulo");
      }
      setMontando("Usando o título de melhor nota…");
      const e = await executarComToast(escolherTitulo({ rascunho_id: rascunhoId, titulo: melhor.titulo }), { erro: "Não foi possível usar o título." });
      if (!e.ok) return setManual("titulo");
      setMontando("Escrevendo a descrição…");
      const d = await executarComToast(gerarDescricaoEstudio({ rascunho_id: rascunhoId, pedido: null }), { erro: "Não foi possível gerar a descrição." });
      if (!d.ok) return setManual("descricao");
      if (!d.dado.avaliacao.utilizavel) {
        setVersaoDesc((n) => n + 1);
        setDescGerada({ texto: d.dado.descricao, palavras: d.dado.palavrasChave, versao: versaoDesc + 1, meta: "A descrição precisa de um ajuste antes de salvar (veja os avisos)." });
        return setManual("descricao");
      }
      setMontando("Salvando a descrição…");
      const sv = await executarComToast(salvarDescricao({ rascunho_id: rascunhoId, descricao: d.dado.descricao, original: d.dado.descricao }), { erro: "Não foi possível salvar a descrição." });
      if (!sv.ok) return setManual("descricao");
      toast.success("Título e descrição prontos. Revise o que quiser e siga para a capa.");
      setManual("capa");
    } finally {
      setMontando(null);
      const r = await executarComToast(abrirRascunhoPorId({ rascunho_id: rascunhoId }), { erro: "Não foi possível atualizar o anúncio." });
      if (r.ok) setRascunho(r.dado);
    }
  }

  /** Produto que ainda não existe: cria o mínimo e já abre o anúncio (e monta com IA, se marcado). */
  function criarEAbrir() {
    if (!novoProduto || novoProduto.nome.trim().length < 2) return;
    setTitulos(null);
    setDescGerada(null);
    setObservacao(null);
    startTransition(async () => {
      const r = await executarComToast(criarProdutoParaAnuncio({ nome: novoProduto.nome.trim(), custo: novoProduto.custo, perfil_id: perfilId || null }), {
        sucesso: "Produto criado e anúncio aberto",
        erro: "Não foi possível criar o produto.",
      });
      if (!r.ok) return;
      setNovoProduto(null);
      setProdutoId(r.dado.produtoId);
      mostrarAberto(r.dado, { produto: r.dado.produtoId, perfil: perfilId });
      setManual(null);
      if (montarAoAbrir && iaDisponivel) await montarComIA(r.dado.id);
    });
  }

  // `?produto=` (atalho "Criar anúncio deste produto"): abre o rascunho sem pedir mais um clique.
  const autoAbrir = useRef(!rascunhoInicial && !!produtoInicial);
  useEffect(() => {
    if (!autoAbrir.current || !produtoInicial) return;
    autoAbrir.current = false;
    startTransition(async () => {
      await abrirPar({ produto: produtoInicial, perfil: perfilInicial ?? perfis[0]?.id ?? "" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na primeira montagem
  }, []);

  function abrir() {
    if (!produtoId) return;
    setTitulos(null);
    setDescGerada(null);
    setObservacao(null);
    startTransition(async () => {
      const aberto = await abrirPar({ produto: produtoId, perfil: perfilId });
      if (!aberto) return;
      setManual(null);
      // Só monta sozinho um anúncio ainda sem título (reabrir um começado não sobrescreve nada).
      if (montarAoAbrir && iaDisponivel && !aberto.titulo) await montarComIA(aberto.id);
    });
  }

  // ---------- Ações (a tela e o assistente chamam as mesmas) ----------

  async function gerarTitulos(pedido: string | null) {
    if (!rascunho) return false;
    setQual("titulos");
    const r = await executarComToast(gerarTitulosEstudio({ rascunho_id: rascunho.id, pedido }), { erro: "Não foi possível gerar os títulos." });
    setQual(null);
    setFalhaIA(r.ok ? null : { etapa: "titulo", mensagem: r.erro, repetir: () => void gerarTitulos(pedido) });
    if (r.ok) setTitulos(r.dado);
    return r.ok;
  }

  async function gerarDescricao(pedido: string | null) {
    if (!rascunho) return false;
    setQual("descricao");
    const r = await executarComToast(gerarDescricaoEstudio({ rascunho_id: rascunho.id, pedido }), { erro: "Não foi possível gerar a descrição." });
    setQual(null);
    setFalhaIA(r.ok ? null : { etapa: "descricao", mensagem: r.erro, repetir: () => void gerarDescricao(pedido) });
    if (r.ok) {
      setVersaoDesc((n) => n + 1);
      setDescGerada({ texto: r.dado.descricao, palavras: r.dado.palavrasChave, versao: versaoDesc + 1, meta: r.dado.doCache ? "Resposta guardada (não gastou cota)." : `Geração ${r.dado.usadas} de ${r.dado.limite} de hoje. Edite à vontade e salve.` });
    }
    return r.ok;
  }

  async function guardarDescricao(texto: string) {
    if (!rascunho) return;
    setQual("descricao");
    // O texto de partida do editor (o da IA ou o salvo antes): o que mudou vira exemplo para a IA.
    const r = await executarComToast(salvarDescricao({ rascunho_id: rascunho.id, descricao: texto, original: descGerada?.texto ?? rascunho.descricao }), {
      sucesso: (d) => (d.aprendeu ? "Descrição salva. A sua edição vira exemplo para as próximas descrições." : "Descrição salva"),
      erro: "Não foi possível salvar a descrição.",
    });
    setQual(null);
    if (r.ok) {
      setDescGerada(null);
      setVersaoDesc((n) => n + 1);
      await carregar();
    }
  }

  async function escolher(titulo: string) {
    if (!rascunho) return false;
    const r = await executarComToast(escolherTitulo({ rascunho_id: rascunho.id, titulo }), {
      sucesso: (d) => (d.aprendeu ? "Título escolhido. O seu jeito de escrever vira exemplo para os próximos." : "Título escolhido"),
      erro: "Não foi possível usar este título.",
    });
    if (r.ok) await carregar();
    return r.ok;
  }

  async function pesquisar() {
    if (!rascunho) return false;
    setQual("concorrentes");
    const r = await executarComToast(pesquisarConcorrentesEstudio({ rascunho_id: rascunho.id }), { erro: "Não foi possível pesquisar." });
    setQual(null);
    setFalhaIA(r.ok ? null : { etapa: "titulo", mensagem: r.erro, repetir: () => void pesquisar() });
    if (r.ok) {
      setObservacao(r.dado.pesquisa.observacao || null);
      await carregar();
    }
    return r.ok;
  }

  async function enviarMensagem() {
    if (!rascunho) return;
    setQual("conversa");
    const r = await executarComToast(conversar({ rascunho_id: rascunho.id, mensagem: texto }), { erro: "Não foi possível falar com o assistente." });
    setQual(null);
    if (r.ok) {
      setTexto("");
      setMeta(r.dado.doCache ? "Resposta guardada (não gastou cota)." : `Geração ${r.dado.usadas} de ${r.dado.limite} de hoje.`);
      await carregar();
    }
  }

  async function aplicar(a: AcaoProposta): Promise<boolean> {
    if (!rascunho) return false;
    switch (a.tipo) {
      case "definir_numero_imagens": {
        const r = await executarComToast(definirNumeroImagens({ rascunho_id: rascunho.id, n: a.n }), { sucesso: `Combinado: ${a.n} imagens`, erro: "Não foi possível combinar." });
        if (r.ok) await carregar();
        return r.ok;
      }
      case "guardar_memoria": {
        const r = await executarComToast(adicionarMemoriaMarca({ perfil_id: perfil?.id ?? null, tipo: a.memoria.tipo, texto: a.memoria.texto, origem: "ia" }), { sucesso: "Guardado na memória", erro: "Não foi possível guardar." });
        if (r.ok) router.refresh();
        return r.ok;
      }
      case "ajustar_ficha": {
        if (!perfil) {
          toast.error("Crie um perfil em Configurações para a ficha poder ser ajustada.");
          return false;
        }
        const r = await executarComToast(
          salvarFichaMarca({ perfil_id: perfil.id, tipo_imagem: a.tipoImagem, dados: mesclarFicha(fichaAtiva(a.tipoImagem), a.campos), origem: "ajuste_ia", nota: "Ajuste proposto na conversa" }),
          { sucesso: "Ficha atualizada (nova versão)", erro: "Não foi possível ajustar a ficha." },
        );
        if (r.ok) router.refresh();
        return r.ok;
      }
      case "gerar_titulos":
        setManual("titulo");
        setConversaAberta(false);
        return gerarTitulos(a.pedido);
      case "gerar_descricao":
        setManual("descricao");
        setConversaAberta(false);
        return gerarDescricao(a.pedido);
      case "gerar_capa":
        setManual("capa");
        setConversaAberta(false);
        toast.message(a.modo === "imagem" ? "Confirme o custo no painel da capa." : "Use “Ver o prompt (sem custo)” no painel da capa.");
        return true;
      case "pesquisar_concorrentes":
        setManual("titulo");
        setConversaAberta(false);
        return pesquisar();
    }
  }

  async function descartar() {
    if (!rascunho) return;
    const ok = await confirm({
      title: "Descartar este anúncio?",
      message: `O rascunho de “${rascunho.titulo || rascunho.produto.nome}” e a conversa dele serão apagados. Capas já geradas continuam na cota do mês.${estado?.itemShopee ? " O item já criado na Shopee NÃO é apagado." : ""}`,
      confirmLabel: "Descartar",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await executarComToast(descartarRascunho({ rascunho_id: rascunho.id }), { sucesso: "Anúncio descartado", erro: "Não foi possível descartar." });
      if (r.ok) router.push("/anuncio");
    });
  }

  function publiqueiManualmente() {
    if (!rascunho) return;
    startTransition(async () => {
      const r = await executarComToast(marcarPublicado({ rascunho_id: rascunho.id }), { sucesso: "Marcado como publicado", erro: "Não foi possível marcar." });
      if (r.ok) await carregar();
    });
  }

  function abrirConfig(aba: ConfigAba) {
    setAbaConfig(aba);
    setConfigAberta(true);
  }

  const cfgPerfilAtual = perfis.find((p) => p.id === cfgPerfil) ?? null;
  const cfgNovo = cfgPerfil === "novo" || !cfgPerfilAtual;
  const checklist = rascunho
    ? [
        { ok: !!rascunho.titulo, texto: "Título escolhido e conferido" },
        { ok: !!rascunho.descricao, texto: "Descrição salva" },
        { ok: !!estado?.numeroImagens, texto: estado?.numeroImagens ? `Quantidade de imagens combinada: ${estado.numeroImagens}` : "Quantidade de imagens (diga ao assistente)" },
        { ok: capaAprovada, texto: "Capa 1 aprovada" },
        { ok: !!rascunho.preco.preco, texto: rascunho.preco.preco ? `Preço definido${rascunho.preco.origem === "loja" ? ` para ${rascunho.preco.lojaRotulo}` : " (do cadastro)"}` : "Preço da loja definido" },
      ]
    : [];

  if (semMigracao) {
    return (
      <Card>
        <EmptyState icon={AlertTriangle} title="Faltam migrações" description="Aplique as migrações 0098 e 0099 no Supabase (SQL Editor), nessa ordem, e recarregue esta página." />
      </Card>
    );
  }

  return (
    <>
      <Link href="/anuncio" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} aria-hidden /> Anúncio
      </Link>
      <AberturaMarca
        eyebrow="Anúncio Infinito"
        titulo={rascunho ? rascunho.produto.nome || "Seu anúncio" : "Monte um anúncio novo"}
        texto="Você aprova cada passo e vê o custo antes de gastar."
      >
        <Button variant="secondary" onClick={() => abrirConfig("perfil")}>
          <Settings size={14} aria-hidden /> Configurações
        </Button>
        <Button variant="secondary" onClick={() => setConversaAberta(true)} disabled={!rascunho}>
          <MessageCircle size={14} aria-hidden /> Pergunte à IA
        </Button>
      </AberturaMarca>

      <FaixaSaldo feitas={calculo.feitas} total={ETAPAS.length} saldo={saldoTexto} imagens={imagensUsadas} />

      {!iaDisponivel && <p className="text-sm text-text-secondary mb-4">Sem IA configurada, só dá para digitar o título e ver os prompts. Configure uma IA em Configurações para gerar.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] gap-6 items-start">
        <div className="lg:sticky lg:top-4">
          <TrilhoEtapas etapas={calculo.etapas} atual={atual} onEscolher={setManual} />
          {rascunho && (
            <Button variant="ghost" size="sm" className="mt-2 text-text-secondary" onClick={descartar} disabled={pending}>
              <Trash2 size={14} aria-hidden /> Descartar este anúncio
            </Button>
          )}
        </div>

        <div className="space-y-4 min-w-0">
          <p className="lg:hidden text-xs font-medium text-text-secondary" aria-live="polite">
            Etapa {indice + 1} de {ETAPAS.length}: {ETAPAS[indice]?.rotulo}
          </p>
          {falhaIA && falhaIA.etapa === atual && (
            <Card className="border-negative/40">
              <div role="alert" className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-sm text-negative flex gap-2 min-w-0">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> {falhaIA.mensagem}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={falhaIA.repetir} disabled={qual !== null}>
                    Tentar de novo
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setFalhaIA(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {atual === "loja" && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Para qual loja é este anúncio?</CardTitle>
                  <CardSubtitle>A loja define a plataforma, o visual e os termos que a IA segue. Pode seguir sem perfil, com um padrão neutro.</CardSubtitle>
                </div>
              </CardHeader>
              {perfis.length === 0 ? (
                <EmptyState icon={Sparkles} title="Você ainda não tem um perfil de loja" description="Crie um agora (leva um minuto) ou siga com o padrão neutro e ajuste depois." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Perfil da loja">
                  {[...perfis.map((p) => ({ id: p.id, nome: p.nome, sub: regrasDaPlataforma(p.plataforma).nome })), { id: "", nome: "Sem perfil", sub: "Padrão neutro" }].map((o) => (
                    <button
                      key={o.id || "neutro"}
                      type="button"
                      role="radio"
                      aria-checked={perfilId === o.id}
                      onClick={() => setPerfilId(o.id)}
                      className={`rounded-lg border p-4 text-left transition-colors ${perfilId === o.id ? "border-accent bg-accent-soft" : "border-border hover:border-border-forte"}`}
                    >
                      <span className="block text-sm font-semibold text-text-primary">{o.nome}</span>
                      <span className="block text-xs text-text-secondary">{o.sub}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <Button
                  variant="primary"
                  onClick={() => {
                    setLojaDecidida(true);
                    setManual("produto");
                  }}
                >
                  Continuar <ArrowRight size={14} aria-hidden />
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCfgPerfil("novo");
                    abrirConfig("perfil");
                  }}
                >
                  <Plus size={14} aria-hidden /> Criar perfil
                </Button>
              </div>
            </Card>
          )}

          {atual === "produto" && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Qual produto vira anúncio?</CardTitle>
                  <CardSubtitle>{perfilId ? `Perfil: ${perfis.find((p) => p.id === perfilId)?.nome ?? ""}.` : "Sem perfil (padrão neutro)."} Depois de abrir, o anúncio fica salvo e você pode sair e voltar.</CardSubtitle>
                </div>
              </CardHeader>
              {novoProduto || produtos.length === 0 ? (
                // Produto que ainda não existe: o mínimo para começar; o resto se completa no cadastro.
                <div className="rounded-lg border border-dashed border-border p-4">
                  <p className="text-sm font-medium text-text-primary">Produto novo</p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    O Painel cadastra o produto com o nome (e o custo, se souber) e já abre o anúncio. Foto, medidas, estoque e preço por loja você completa depois em Produtos e na
                    Precificação.
                  </p>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_10rem] gap-3">
                    <FormField label="Nome do produto">
                      <input
                        className={inputClass}
                        value={novoProduto?.nome ?? ""}
                        maxLength={120}
                        autoFocus={!!novoProduto}
                        onChange={(e) => setNovoProduto((a) => ({ nome: e.target.value, custo: a?.custo ?? null }))}
                        placeholder="Ex.: Caneca de porcelana 300 ml"
                      />
                    </FormField>
                    <FormField label="Custo (opcional)">
                      <CampoNumero value={novoProduto?.custo ?? 0} onChange={(n) => setNovoProduto((a) => ({ nome: a?.nome ?? "", custo: n > 0 ? n : null }))} min={0} casas={2} />
                    </FormField>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" onClick={criarEAbrir} loading={pending} disabled={pending || (novoProduto?.nome.trim().length ?? 0) < 2}>
                      <Wand2 size={14} aria-hidden /> Criar e abrir o anúncio
                    </Button>
                    {produtos.length > 0 && (
                      <Button variant="ghost" onClick={() => setNovoProduto(null)} disabled={pending}>
                        Escolher um produto cadastrado
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <FormField label="Produto">
                    <Combobox
                      itens={produtos.map((p) => ({ id: p.id, rotulo: p.rotulo, detalhe: p.sku ?? undefined, busca: p.sku ?? undefined }))}
                      valor={produtoId}
                      onChange={setProdutoId}
                      placeholder="Buscar produto ou digitar um novo…"
                      criar={{ rotulo: (t) => `+ Criar anúncio para “${t}” (produto novo)`, onCriar: (t) => setNovoProduto({ nome: t, custo: null }) }}
                    />
                  </FormField>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" onClick={abrir} loading={pending} disabled={pending || !produtoId}>
                      <Wand2 size={14} aria-hidden /> {rascunho ? "Reabrir anúncio" : "Abrir o anúncio"}
                    </Button>
                    <Button variant="ghost" onClick={() => setNovoProduto({ nome: "", custo: null })} disabled={pending}>
                      <Plus size={14} aria-hidden /> Produto ainda não cadastrado
                    </Button>
                  </div>
                </>
              )}
              {iaDisponivel && (
                <label className="mt-4 flex items-start gap-2 text-sm text-text-secondary">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={montarAoAbrir} onChange={(e) => setMontarAoAbrir(e.target.checked)} />
                  <span>
                    <span className="font-medium text-text-primary">Já montar título e descrição com IA ao abrir.</span> Usa o título de melhor nota e para na capa para você revisar (gasta 2
                    gerações de texto; a capa não).
                  </span>
                </label>
              )}
            </Card>
          )}

          {montando && (
            <Card>
              <p role="status" className="flex items-center gap-2 text-sm text-text-primary">
                <Sparkles size={16} className="shrink-0 animate-pulse text-accent" aria-hidden /> Montando com IA: {montando}
              </p>
            </Card>
          )}

          {rascunho && atual === "titulo" && !rascunho.titulo && iaDisponivel && !montando && (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>Montar com IA</CardTitle>
                  <CardSubtitle>Gera os títulos, usa o de melhor nota, escreve a descrição e para na capa para você revisar. 2 gerações de texto.</CardSubtitle>
                </div>
                <Button variant="primary" onClick={() => void montarComIA(rascunho.id)} disabled={qual !== null}>
                  <Sparkles size={14} aria-hidden /> Montar título e descrição
                </Button>
              </div>
            </Card>
          )}

          {rascunho && (atual === "titulo" || atual === "descricao") && perfil && (
            <p className="text-xs text-text-secondary">
              {direcao.instrucoes || direcao.exemplos
                ? `A IA segue a direção deste perfil: ${[direcao.instrucoes ? `${direcao.instrucoes} ${direcao.instrucoes > 1 ? "instruções" : "instrução"}` : null, direcao.exemplos ? `${direcao.exemplos} exemplo${direcao.exemplos > 1 ? "s" : ""}` : null].filter(Boolean).join(" e ")}.`
                : "A IA ainda não tem instruções nem exemplos deste perfil."}{" "}
              <button type="button" className="text-accent underline" onClick={() => abrirConfig("direcao")}>
                {direcao.instrucoes || direcao.exemplos ? "Ajustar" : "Dar uma direção"}
              </button>
            </p>
          )}

          {rascunho && atual === "titulo" && (
            <>
              <PainelTitulos key={`titulos-${rascunho.id}`} onPendente={setTituloPendente} usados={rascunho.titulosUsados} titulo={rascunho.titulo} limite={limiteTitulo} resultado={titulos} iaDisponivel={iaDisponivel} ocupado={qual === "titulos"} onGerar={gerarTitulos} onEscolher={escolher}>
                <PainelConcorrentes concorrentes={estado?.concorrentes ?? []} observacao={observacao} iaDisponivel={iaDisponivel} ocupado={qual === "concorrentes"} onPesquisar={pesquisar} />
              </PainelTitulos>
            </>
          )}

          {rascunho && atual === "capa" && (
            <PainelCapa
              key={`capa-${rascunho.id}`}
              rascunho={rascunho}
              ficha={fichaCapa1}
              logoUrl={perfil?.logo_path ? urlPublicaImagem(perfil.logo_path) : null}
              plataforma={plataforma}
              imagensUsadas={imagensUsadas}
              iaDisponivel={iaDisponivel}
              // Fica na Capa: com a primeira imagem aprovada ou enviada a etapa conta como feita e
              // a tela pulava para a Descrição, no meio de quem ainda ia enviar outras imagens.
              onMudou={() => {
                setManual("capa");
                void carregar();
              }}
              onAjustar={(t) => {
                setTexto(t);
                setConversaAberta(true);
              }}
            />
          )}

          {rascunho && atual === "descricao" && (
            <PainelDescricao
              key={`descricao-${rascunho.id}`}
              onPendente={setDescPendente}
              salva={rascunho.descricao}
              geradaTexto={descGerada?.texto ?? null}
              versao={versaoDesc}
              limite={limiteDescricao}
              termos={termosPerfil}
              titulo={rascunho.titulo}
              iaDisponivel={iaDisponivel}
              ocupado={qual === "descricao"}
              meta={descGerada?.meta ?? null}
              onGerar={gerarDescricao}
              onSalvar={guardarDescricao}
            />
          )}

          {rascunho && atual === "revisar" && (
            <>
              <Card>
                <CardTitle>Pronto para publicar?</CardTitle>
                <PrecoDoAnuncioResumo rascunho={rascunho} />
                <ul className="space-y-1.5 text-sm mt-3">
                  {checklist.map((i) => (
                    <li key={i.texto} className={`flex gap-2 ${i.ok ? "text-text-primary" : "text-text-secondary"}`}>
                      {i.ok ? <Check size={14} className="mt-0.5 text-positive shrink-0" aria-hidden /> : <Circle size={14} className="mt-0.5 shrink-0" aria-hidden />}
                      {i.texto}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-text-tertiary mt-3">Título, descrição e textos da capa passam pela conferência de termos: o que as plataformas costumam barrar e o que você marcou para bloquear não deixa salvar nem criar na Shopee. A revisão final é sempre sua.</p>
                {rascunho.anuncioLojaId && (
                  <Link href={`/anuncio/analise/${rascunho.anuncioLojaId}`} className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                    <Sparkles size={14} aria-hidden /> Analisar o anúncio que está na loja
                  </Link>
                )}
                {rascunho.status === "publicado" ? (
                  <p className="mt-3 text-sm text-positive flex gap-1.5">
                    <Check size={14} className="mt-0.5" aria-hidden /> Publicado.
                  </p>
                ) : (
                  !estado?.itemShopee && (
                    <Button className="mt-3" size="sm" variant="secondary" onClick={publiqueiManualmente} loading={pending} disabled={!rascunho.titulo || !rascunho.descricao}>
                      <Check size={14} aria-hidden /> Publiquei manualmente
                    </Button>
                  )
                )}
              </Card>
              <PainelPacote rascunho={rascunho} palavrasChave={[...rascunho.produto.palavrasChave, ...(titulos?.palavrasChave ?? []), ...(descGerada?.palavras ?? [])]} />
              {/* Criar pela API é opcional: o Pacote acima já basta para publicar à mão. */}
              <Card>
                <button type="button" className="w-full flex items-center justify-between text-left" aria-expanded={shopeeAberto} onClick={() => setShopeeAberto((v) => !v)}>
                  <span>
                    <CardTitle>Criar na Shopee pelo Painel (opcional)</CardTitle>
                    <CardSubtitle>Cria como não listado: você revisa e publica no Seller Centre.</CardSubtitle>
                  </span>
                  <ArrowRight size={16} className={`text-text-tertiary transition-transform duration-[--duracao-media] ${shopeeAberto ? "rotate-90" : ""}`} aria-hidden />
                </button>
              </Card>
              {(shopeeAberto || !!estado?.itemShopee) && <PainelShopee key={`shopee-${rascunho.id}`} rascunho={rascunho} onMudou={() => void carregar()} />}
            </>
          )}

          {atual !== "loja" && atual !== "produto" && (
            <div className="flex items-center justify-between gap-2 pt-2">
              {anterior ? (
                <Button variant="ghost" onClick={() => setManual(anterior.id)}>
                  <ArrowLeft size={14} aria-hidden /> {anterior.rotulo}
                </Button>
              ) : (
                <span />
              )}
              {proxima && (
                <Button variant="primary" onClick={() => setManual(proxima.id)} disabled={!etapaLiberada(proxima.id)}>
                  {proxima.rotulo} <ArrowRight size={14} aria-hidden />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Gaveta de configurações: tudo que é padrão da loja, num lugar só. */}
      <Modal open={configAberta} onClose={() => setConfigAberta(false)} title="Configurações do anúncio" width="max-w-3xl">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-text-secondary" htmlFor="cfg-perfil">
              Perfil
            </label>
            <select id="cfg-perfil" className="rounded-md border border-border bg-surface-1 px-2 h-9 text-sm" value={cfgPerfil} onChange={(e) => setCfgPerfil(e.target.value)}>
              {perfis.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
              <option value="novo">+ Novo perfil</option>
            </select>
          </div>
          <Tabs tabs={cfgNovo ? ABAS_CONFIG.filter((a) => a.value === "perfil" || a.value === "conferir") : ABAS_CONFIG} value={cfgNovo && abaConfig !== "conferir" ? "perfil" : abaConfig} onChange={setAbaConfig} />
          {abaConfig === "perfil" || (cfgNovo && abaConfig !== "conferir") ? (
            <PerfilForm key={cfgPerfilAtual?.id ?? "novo"} perfil={cfgNovo ? null : cfgPerfilAtual} lojas={lojas} onSalvo={(id) => setCfgPerfil(id)} onRemovido={() => setCfgPerfil("novo")} />
          ) : null}
          {!cfgNovo && cfgPerfilAtual && abaConfig === "ficha" && <FichaEditor perfilId={cfgPerfilAtual.id} fichas={fichas} />}
          {!cfgNovo && cfgPerfilAtual && abaConfig === "direcao" && <DirecaoIA key={`direcao-${cfgPerfilAtual.id}`} perfil={cfgPerfilAtual} exemplos={exemplos} semMigracao={semMigracaoExemplos} />}
          {!cfgNovo && cfgPerfilAtual && abaConfig === "memoria" && <MemoriaMarcaCard perfilId={cfgPerfilAtual.id} memorias={memorias} />}
          {!cfgNovo && cfgPerfilAtual && abaConfig === "aprender" && (
            <AprenderCapas key={`aprender-${cfgPerfilAtual.id}-${cfgPerfilAtual.referencias.join("|")}`} perfil={cfgPerfilAtual} fichas={fichas} iaDisponivel={iaDisponivel} />
          )}
          {abaConfig === "conferir" && <ConferirTexto termosDoPerfil={termosDoPerfil(cfgPerfilAtual)} />}
        </div>
      </Modal>

      {/* Assistente: conversa do anúncio aberto. */}
      {ConfirmDialog}
      <ModalSaida protecao={protecao} />

      <Modal open={conversaAberta && !!rascunho} onClose={() => setConversaAberta(false)} title="Pergunte à IA" width="max-w-xl">
        {rascunho && <ConversaAssistente mensagens={rascunho.mensagens} texto={texto} onTexto={setTexto} enviando={qual === "conversa"} iaDisponivel={iaDisponivel} meta={meta} onEnviar={enviarMensagem} onAplicar={aplicar} />}
      </Modal>
    </>
  );
}

/**
 * Progresso e saldo, sempre à vista no topo (antes era uma frase dentro da abertura): quanto do
 * anúncio está feito e quanto de IA ainda dá para gastar, antes de gastar.
 */
function FaixaSaldo({ feitas, total, saldo, imagens }: { feitas: number; total: number; saldo: { origem: "propria" | "sistema"; usadas: number; limite: number } | null; imagens: number | null }) {
  const textoIA = !saldo ? null : saldo.origem === "propria" ? "a sua chave (sem cota do Painel)" : saldo.limite > 0 ? `${saldo.usadas} de ${saldo.limite} hoje` : "do sistema";
  const acabou = !!saldo && saldo.origem === "sistema" && saldo.limite > 0 && saldo.usadas >= saldo.limite;
  return (
    <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="rounded-lg border border-border bg-surface-1 px-4 py-3 shadow-elev-1">
        <span className="block text-xs text-text-tertiary">Progresso</span>
        <span className="mt-1 flex items-center gap-3">
          <span className="font-mono text-sm font-semibold text-text-primary whitespace-nowrap">
            {feitas} de {total}
          </span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={feitas} aria-label="Etapas feitas">
            <span className="block h-full rounded-full bg-accent transition-[width] duration-[--duracao-media]" style={{ width: `${(feitas / total) * 100}%` }} />
          </span>
        </span>
      </div>
      <div className="rounded-lg border border-border bg-surface-1 px-4 py-3 shadow-elev-1">
        <span className="block text-xs text-text-tertiary">IA de texto</span>
        <span className={`mt-1 block truncate text-sm font-medium ${acabou ? "text-negative" : "text-text-primary"}`}>{textoIA ?? "sem IA configurada"}</span>
      </div>
      <div className="rounded-lg border border-border bg-surface-1 px-4 py-3 shadow-elev-1">
        <span className="block text-xs text-text-tertiary">Imagens geradas no mês</span>
        <span className="mt-1 block font-mono text-sm font-medium text-text-primary">{imagens ?? "—"}</span>
      </div>
    </div>
  );
}

/** Preço que vai para o anúncio, com lucro e margem da loja e o alerta de prejuízo ou zona morta. */
function PrecoDoAnuncioResumo({ rascunho }: { rascunho: RascunhoAberto }) {
  const p = rascunho.preco;
  const precificar = `/precificacao?produto=${rascunho.produtoId}${p.lojaId ? `&loja=${p.lojaId}` : ""}`;
  if (p.preco === null) {
    return (
      <div className="mt-3 rounded-md border border-border bg-surface-2 p-3 text-sm flex flex-wrap items-center justify-between gap-2">
        <span className={p.erro ? "text-negative" : "text-text-secondary"}>{p.erro ?? (p.origem === "loja" ? `Este produto ainda não tem preço em ${p.lojaRotulo}.` : "O produto está sem preço de venda.")}</span>
        <Link href={precificar} className="text-accent hover:underline font-medium">
          Precificar agora
        </Link>
      </div>
    );
  }
  const pct = p.margemPct !== null ? `${(p.margemPct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : null;
  return (
    <div className="mt-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-2xl font-semibold text-text-primary">{formatBRL(p.preco)}</span>
        {p.lucro !== null && (
          <span className="text-sm text-text-secondary">
            Lucro <span className={p.lucro < 0 ? "text-negative font-medium" : "text-text-primary font-medium"}>{formatBRL(p.lucro)}</span>
            {pct && <> · margem {pct}</>}
          </span>
        )}
        <span className="text-xs text-text-tertiary">{p.origem === "loja" ? p.lojaRotulo : "preço do cadastro (o perfil não tem loja)"}</span>
      </div>
      {p.situacao === "prejuizo" && (
        <p role="alert" className="mt-2 text-sm text-negative flex gap-1.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> Neste preço cada venda dá prejuízo.{" "}
          <Link href={precificar} className="underline">
            Ajustar o preço
          </Link>
        </p>
      )}
      {p.situacao === "zona_morta" && p.precoMelhor !== null && (
        <p role="alert" className="mt-2 text-sm text-negative flex gap-1.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden /> Zona morta: a {formatBRL(p.precoMelhor)} você recebe mais por venda.{" "}
          <Link href={precificar} className="underline">
            Ajustar o preço
          </Link>
        </p>
      )}
    </div>
  );
}

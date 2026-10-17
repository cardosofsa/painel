"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Circle, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Combobox } from "@/components/ui/Combobox";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, inputClass } from "@/components/ui/Modal";
import { PainelTitulos } from "@/components/estudio/PainelTitulos";
import { PainelConcorrentes } from "@/components/estudio/PainelConcorrentes";
import { PainelCapa } from "@/components/estudio/PainelCapa";
import { ConversaAssistente } from "@/components/estudio/ConversaAssistente";
import { executarComToast } from "@/lib/acao-cliente";
import { mesclarFicha, type FichaMarca, type TipoImagemMarca } from "@/lib/marca/ficha";
import { regrasDaPlataforma } from "@/lib/marca/plataformas";
import { urlPublicaImagem, type FichaSalva, type PerfilMarca } from "@/lib/marca/tipos";
import type { AcaoProposta } from "@/lib/ia/prompts-assistente";
import { adicionarMemoriaMarca, salvarFichaMarca } from "../marca/actions";
import { abrirRascunho, conversar, definirNumeroImagens, escolherTitulo, gerarTitulosEstudio, pesquisarConcorrentesEstudio, type RascunhoAberto, type TitulosDoEstudio } from "./actions";

type Qual = "titulos" | "concorrentes" | "conversa" | null;

/**
 * Estúdio de anúncios: título e capa 1 em primeiro lugar, concorrentes da web e um assistente de
 * conversa. O estado do trabalho fica no banco (rascunho); depois de cada ação a tela relê o
 * rascunho, então recarregar a página não perde nada.
 */
export function EstudioClient({
  produtos,
  produtoInicial,
  perfis,
  fichas,
  iaDisponivel,
  imagensUsadas,
  semMigracao,
}: {
  produtos: { id: string; rotulo: string; sku: string | null }[];
  produtoInicial: string | null;
  perfis: PerfilMarca[];
  fichas: FichaSalva[];
  iaDisponivel: boolean;
  imagensUsadas: number | null;
  semMigracao: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [qual, setQual] = useState<Qual>(null);
  const [produtoId, setProdutoId] = useState<string | null>(produtoInicial);
  const [perfilId, setPerfilId] = useState("");
  const [rascunho, setRascunho] = useState<RascunhoAberto | null>(null);
  // O par produto/perfil que de fato está aberto: trocar o seletor depois não muda o rascunho.
  const [aberto, setAberto] = useState<{ produto: string; perfil: string } | null>(null);
  const [titulos, setTitulos] = useState<TitulosDoEstudio | null>(null);
  const [observacao, setObservacao] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [meta, setMeta] = useState<string | null>(null);

  const perfil = perfis.find((p) => p.id === aberto?.perfil) ?? null;
  const plataforma = regrasDaPlataforma(perfil?.plataforma ?? "shopee");
  const limiteTitulo = plataforma.limiteTitulo ?? 120;

  const fichaAtiva = (tipo: TipoImagemMarca): FichaMarca => (perfil ? (fichas.find((f) => f.perfil_id === perfil.id && f.tipo_imagem === tipo && f.ativa)?.dados ?? {}) : {});
  const fichaCapa1 = useMemo(() => mesclarFicha(fichaAtiva("geral"), fichaAtiva("capa_1")), [perfil, fichas]); // eslint-disable-line react-hooks/exhaustive-deps

  async function carregar(par: { produto: string; perfil: string } | null = aberto): Promise<boolean> {
    if (!par) return false;
    const r = await executarComToast(abrirRascunho({ produto_id: par.produto, perfil_id: par.perfil || null }), { erro: "Não foi possível abrir o estúdio." });
    if (r.ok) {
      setRascunho(r.dado);
      setAberto(par);
    }
    return r.ok;
  }

  function abrir() {
    if (!produtoId) return;
    setTitulos(null);
    setObservacao(null);
    startTransition(async () => void (await carregar({ produto: produtoId, perfil: perfilId })));
  }

  // ---------- Ações (a tela e o assistente chamam as mesmas) ----------

  async function gerarTitulos(pedido: string | null) {
    if (!rascunho) return false;
    setQual("titulos");
    const r = await executarComToast(gerarTitulosEstudio({ rascunho_id: rascunho.id, pedido }), { erro: "Não foi possível gerar os títulos." });
    setQual(null);
    if (r.ok) setTitulos(r.dado);
    return r.ok;
  }

  async function escolher(titulo: string) {
    if (!rascunho) return false;
    const r = await executarComToast(escolherTitulo({ rascunho_id: rascunho.id, titulo }), { sucesso: "Título escolhido", erro: "Não foi possível usar este título." });
    if (r.ok) await carregar();
    return r.ok;
  }

  async function pesquisar() {
    if (!rascunho) return false;
    setQual("concorrentes");
    const r = await executarComToast(pesquisarConcorrentesEstudio({ rascunho_id: rascunho.id }), { erro: "Não foi possível pesquisar." });
    setQual(null);
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
          toast.error("Crie um perfil em “Padrão da loja” para a ficha poder ser ajustada.");
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
        return gerarTitulos(a.pedido);
      case "gerar_capa":
        document.getElementById("painel-capa")?.scrollIntoView({ behavior: "smooth", block: "start" });
        toast.message(a.modo === "imagem" ? "Confirme o custo no painel da capa." : "Use “Ver o prompt (sem custo)” no painel da capa.");
        return true;
      case "pesquisar_concorrentes":
        return pesquisar();
    }
  }

  // ---------- Tela ----------

  const estado = rascunho?.estado;
  const capaAprovada = (estado?.capas ?? []).some((c) => c.veredito === "aprovada");
  const checklist = rascunho
    ? [
        { ok: !!rascunho.titulo, texto: "Título escolhido e conferido" },
        { ok: !!estado?.numeroImagens, texto: estado?.numeroImagens ? `Quantidade de imagens combinada: ${estado.numeroImagens}` : "Quantidade de imagens (diga ao assistente)" },
        { ok: capaAprovada, texto: "Capa 1 aprovada" },
        { ok: (estado?.concorrentes ?? []).length > 0, texto: "Concorrentes pesquisados (opcional, ajuda no título)" },
      ]
    : [];

  return (
    <>
      <Link href="/produtos" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} /> Produtos
      </Link>
      <PageHeader title="Estúdio de anúncios" descricao="Monte o título e a capa 1 do anúncio, com a IA seguindo o padrão da sua loja. Você aprova cada passo e vê o custo antes de gastar." />

      {semMigracao ? (
        <Card>
          <EmptyState icon={AlertTriangle} title="Faltam migrações" description="Aplique as migrações 0098 e 0099 no Supabase (SQL Editor), nessa ordem, e recarregue esta página." />
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Para qual produto e qual loja?</CardTitle>
                <CardSubtitle>O perfil define a plataforma, o visual e os termos que a IA segue. Sem perfil, usa um padrão neutro.</CardSubtitle>
              </div>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
              <FormField label="Produto">
                <Combobox itens={produtos.map((p) => ({ id: p.id, rotulo: p.rotulo, detalhe: p.sku ?? undefined, busca: p.sku ?? undefined }))} valor={produtoId} onChange={setProdutoId} placeholder="Buscar produto…" />
              </FormField>
              <FormField label="Perfil da loja" dica={perfis.length === 0 ? "Crie um em Produtos › Padrão da loja." : undefined}>
                <select className={inputClass} value={perfilId} onChange={(e) => setPerfilId(e.target.value)}>
                  <option value="">Sem perfil (padrão neutro)</option>
                  {perfis.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome} · {regrasDaPlataforma(p.plataforma).nome}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            <Button variant="primary" onClick={abrir} loading={pending && !rascunho} disabled={pending || !produtoId}>
              <Wand2 size={14} /> {rascunho ? "Reabrir" : "Abrir o estúdio"}
            </Button>
            {perfis.length === 0 && (
              <Link href="/produtos/marca" className="ml-3 text-sm text-accent hover:underline">
                Criar o padrão da loja
              </Link>
            )}
          </Card>

          {!iaDisponivel && <p className="text-sm text-text-secondary">Sem IA configurada, só dá para digitar o título e ver os prompts. Configure uma IA em Configurações para gerar.</p>}

          {rascunho && (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] gap-4 items-start">
              <div className="space-y-4">
                <PainelTitulos titulo={rascunho.titulo} limite={limiteTitulo} resultado={titulos} iaDisponivel={iaDisponivel} ocupado={qual === "titulos"} onGerar={gerarTitulos} onEscolher={escolher} />
                <PainelConcorrentes concorrentes={estado?.concorrentes ?? []} observacao={observacao} iaDisponivel={iaDisponivel} ocupado={qual === "concorrentes"} onPesquisar={pesquisar} />
                <PainelCapa
                  key={`capa-${rascunho.id}`}
                  rascunho={rascunho}
                  ficha={fichaCapa1}
                  logoUrl={perfil?.logo_path ? urlPublicaImagem(perfil.logo_path) : null}
                  plataforma={plataforma}
                  imagensUsadas={imagensUsadas}
                  iaDisponivel={iaDisponivel}
                  onMudou={() => void carregar()}
                  onAjustar={setTexto}
                />
              </div>
              <div className="space-y-4 lg:sticky lg:top-4">
                <ConversaAssistente mensagens={rascunho.mensagens} texto={texto} onTexto={setTexto} enviando={qual === "conversa"} iaDisponivel={iaDisponivel} meta={meta} onEnviar={enviarMensagem} onAplicar={aplicar} />
                <Card>
                  <CardHeader>
                    <CardTitle>Andamento</CardTitle>
                  </CardHeader>
                  <ul className="space-y-1.5 text-sm">
                    {checklist.map((i) => (
                      <li key={i.texto} className={`flex gap-2 ${i.ok ? "text-text-primary" : "text-text-secondary"}`}>
                        {i.ok ? <Check size={14} className="mt-0.5 text-positive shrink-0" aria-hidden /> : <Circle size={14} className="mt-0.5 shrink-0" aria-hidden />}
                        {i.texto}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-text-tertiary mt-3">Os termos que as plataformas costumam barrar são conferidos no título e nos textos da capa. A revisão final é sempre sua.</p>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

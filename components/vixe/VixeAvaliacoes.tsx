"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { MessageSquareQuote, Send, Sparkles, Star } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executar } from "@/lib/acao";
import { executarComToast } from "@/lib/acao-cliente";
import { formatarDataHora } from "@/lib/format";
import { LIMITE_RESPOSTA_AVALIACAO } from "@/lib/marketplace/shopee-avaliacoes";
import { gerarTextoVixe } from "@/app/(painel)/vixe/actions";
import { carregarAvaliacoes, responderAvaliacaoShopee, type AvaliacaoComProduto, type LojaAvaliacoes } from "@/app/(painel)/vixe/avaliacoes/actions";

type Filtro = "pendentes" | "ruins" | "todas";

/**
 * Vixe → Avaliações (onda B): as avaliações dos produtos na Shopee, sem resposta primeiro.
 * A IA escreve a resposta (agradece o elogio; na nota baixa pede desculpas e chama para o
 * chat, sem prometer troca), você revisa e publica direto na Shopee.
 */
export function VixeAvaliacoes({ nomeNegocio, iaDisponivel }: { nomeNegocio: string | null; iaDisponivel: boolean }) {
  const [dados, setDados] = useState<{ apiLigada: boolean; lojas: LojaAvaliacoes[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [respondidas, setRespondidas] = useState<Record<string, string>>({});

  useEffect(() => {
    let vivo = true;
    executar(carregarAvaliacoes())
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : "Erro ao carregar as avaliações"));
    return () => {
      vivo = false;
    };
  }, []);

  if (erro)
    return (
      <Card>
        <p className="text-sm text-negative">{erro}</p>
      </Card>
    );
  if (!dados)
    return (
      <Card>
        <p className="text-sm text-text-secondary">Lendo as avaliações na Shopee…</p>
      </Card>
    );
  if (!dados.apiLigada || dados.lojas.length === 0)
    return (
      <Card>
        <EmptyState
          icon={MessageSquareQuote}
          title={dados.apiLigada ? "Nenhuma loja Shopee conectada" : "A integração com a Shopee não está ligada"}
          description="Conecte a loja à API da Shopee para ler as avaliações dos produtos e responder com a ajuda da Vixe."
          action={
            <Link href="/configuracoes?aba=canais-de-venda" className="text-sm text-accent hover:underline">
              Ir para Canais de venda
            </Link>
          }
        />
      </Card>
    );

  const chave = (l: LojaAvaliacoes, a: AvaliacaoComProduto) => `${l.conexaoId}:${a.commentId}`;
  const resposta = (l: LojaAvaliacoes, a: AvaliacaoComProduto) => a.resposta ?? respondidas[chave(l, a)] ?? null;
  const todas = dados.lojas.flatMap((l) => l.avaliacoes.map((a) => ({ l, a })));
  const pendentes = todas.filter(({ l, a }) => !resposta(l, a)).length;
  const ruins = todas.filter(({ l, a }) => !resposta(l, a) && a.estrelas <= 3).length;
  const visiveis = todas.filter(({ l, a }) => (filtro === "todas" ? true : filtro === "ruins" ? !resposta(l, a) && a.estrelas <= 3 : !resposta(l, a)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {pendentes
            ? `${pendentes} ${pendentes === 1 ? "avaliação sem resposta" : "avaliações sem resposta"}${ruins ? `, ${ruins} com nota baixa` : ""}.`
            : "Tudo respondido. 👏"}
        </p>
        <ChipRow>
          <Chip ativo={filtro === "pendentes"} onClick={() => setFiltro("pendentes")}>
            Sem resposta ({pendentes})
          </Chip>
          <Chip ativo={filtro === "ruins"} onClick={() => setFiltro("ruins")}>
            Nota baixa ({ruins})
          </Chip>
          <Chip ativo={filtro === "todas"} onClick={() => setFiltro("todas")}>
            Todas ({todas.length})
          </Chip>
        </ChipRow>
      </div>

      {dados.lojas
        .filter((l) => l.erro)
        .map((l) => (
          <p key={l.conexaoId} className="text-sm text-negative border border-border bg-surface-2 rounded-md px-3 py-2">
            {l.loja}: não deu para ler as avaliações ({l.erro}). Confira se o app da Shopee tem a permissão de produto.
          </p>
        ))}

      {visiveis.length === 0 ? (
        <Card>
          <EmptyState icon={MessageSquareQuote} title="Nada por aqui" description="Nenhuma avaliação neste filtro." />
        </Card>
      ) : (
        visiveis.map(({ l, a }) => (
          <CartaoAvaliacao
            key={chave(l, a)}
            loja={dados.lojas.length > 1 ? l.loja : null}
            conexaoId={l.conexaoId}
            avaliacao={a}
            respostaPublicada={resposta(l, a)}
            nomeNegocio={nomeNegocio}
            iaDisponivel={iaDisponivel}
            onRespondida={(texto) => setRespondidas((r) => ({ ...r, [chave(l, a)]: texto }))}
          />
        ))
      )}
    </div>
  );
}

function Estrelas({ n }: { n: number }) {
  return (
    <span className="inline-flex" aria-label={`${n} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={14} className={i <= n ? (n <= 3 ? "text-negative fill-current" : "text-accent fill-current") : "text-border-forte"} aria-hidden />
      ))}
    </span>
  );
}

function CartaoAvaliacao({
  loja,
  conexaoId,
  avaliacao: a,
  respostaPublicada,
  nomeNegocio,
  iaDisponivel,
  onRespondida,
}: {
  loja: string | null;
  conexaoId: string;
  avaliacao: AvaliacaoComProduto;
  respostaPublicada: string | null;
  nomeNegocio: string | null;
  iaDisponivel: boolean;
  onRespondida: (texto: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [gerando, startGerar] = useTransition();
  const [publicando, startPublicar] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();

  function gerar() {
    startGerar(async () => {
      try {
        const r = await executar(
          gerarTextoVixe("resposta", {
            produto: a.produto ?? { nome: a.anuncio ?? "Produto da loja" },
            pergunta: a.comentario.length >= 3 ? a.comentario : "(sem comentário, só as estrelas)",
            nomeNegocio,
            estrelas: a.estrelas,
          }),
        );
        setTexto(r.texto.slice(0, LIMITE_RESPOSTA_AVALIACAO));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível gerar agora.");
      }
    });
  }

  async function publicar() {
    const ok = await confirm({
      title: "Publicar a resposta na Shopee?",
      message: "A resposta fica pública na página do produto e a Shopee não deixa editar depois.",
      confirmLabel: "Publicar",
    });
    if (!ok) return;
    startPublicar(async () => {
      const r = await executarComToast(responderAvaliacaoShopee({ conexaoId, commentId: a.commentId, texto }), {
        sucesso: "Resposta publicada na Shopee.",
        erro: "Erro ao publicar a resposta",
      });
      if (r.ok) onRespondida(texto.trim());
    });
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <Estrelas n={a.estrelas} />
          <span className="text-sm font-medium text-text-primary truncate">{a.produto?.nome ?? a.anuncio ?? `Anúncio ${a.itemId}`}</span>
        </div>
        <span className="text-xs text-text-tertiary">
          {loja ? `${loja} · ` : ""}
          {a.criadaEm ? formatarDataHora(a.criadaEm) : ""}
        </span>
      </div>
      <p className="text-sm text-text-secondary whitespace-pre-wrap">
        {a.comentario || <span className="italic text-text-tertiary">Sem comentário, só as estrelas.</span>}
      </p>

      {respostaPublicada ? (
        <div className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-sm">
          <span className="text-xs font-medium text-text-tertiary block mb-0.5">Resposta da loja</span>
          {respostaPublicada}
        </div>
      ) : (
        <div className="mt-3">
          <textarea
            className={`${inputClass} h-24 py-2 resize-y`}
            value={texto}
            maxLength={LIMITE_RESPOSTA_AVALIACAO}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva a resposta ou peça para a Vixe escrever."
            aria-label="Resposta à avaliação"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-text-tertiary">
              {texto.length}/{LIMITE_RESPOSTA_AVALIACAO}
            </span>
            <div className="flex gap-2">
              {iaDisponivel && (
                <Button size="sm" variant="secondary" onClick={gerar} loading={gerando}>
                  <Sparkles size={14} /> {texto ? "Gerar outra" : "Escrever com a Vixe"}
                </Button>
              )}
              <Button size="sm" variant="primary" onClick={publicar} loading={publicando} disabled={texto.trim().length < 2}>
                <Send size={14} /> Publicar
              </Button>
            </div>
          </div>
        </div>
      )}
      {ConfirmDialog}
    </Card>
  );
}

"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Check, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { inputClass } from "@/components/ui/Modal";
import { ROTULO_CAMPO, ROTULO_TIPO_IMAGEM, valorLegivel, type FichaMarca } from "@/lib/marca/ficha";
import { LIMITE_MENSAGEM_CHAT } from "@/lib/validacao";
import type { EtapaId } from "@/lib/anuncio/etapas";
import type { AcaoProposta } from "@/lib/ia/prompts-assistente";
import type { MensagemDoChat } from "@/lib/estudio/servidor";

export function descreverAcao(a: AcaoProposta): { rotulo: string; botao: string } {
  switch (a.tipo) {
    case "definir_numero_imagens":
      return { rotulo: `Combinar ${a.n} ${a.n === 1 ? "imagem" : "imagens"} neste anúncio`, botao: "Combinar" };
    case "guardar_memoria":
      return { rotulo: `Guardar na memória: “${a.memoria.texto}”`, botao: "Guardar" };
    case "ajustar_ficha": {
      const campos = (Object.keys(a.campos) as (keyof FichaMarca)[]).map((c) => `${ROTULO_CAMPO[c]}: ${valorLegivel(c, a.campos[c])}`).join("; ");
      return { rotulo: `Ajustar a ficha (${ROTULO_TIPO_IMAGEM[a.tipoImagem]}) — ${campos}`, botao: "Aplicar ajuste" };
    }
    case "gerar_titulos":
      return { rotulo: `Gerar títulos${a.pedido ? `: ${a.pedido}` : ""} (1 geração de texto)`, botao: "Gerar títulos" };
    case "gerar_descricao":
      return { rotulo: `Gerar a descrição${a.pedido ? `: ${a.pedido}` : ""} (1 geração de texto)`, botao: "Gerar descrição" };
    case "gerar_capa":
      return a.modo === "imagem"
        ? { rotulo: "Gerar a capa (você confirma o gasto de 1 imagem da cota na etapa Capa)", botao: "Ir para a capa" }
        : { rotulo: "Montar o prompt da capa (sem custo)", botao: "Ir para a capa" };
    case "pesquisar_concorrentes":
      return { rotulo: "Pesquisar concorrentes na web (1 geração de texto)", botao: "Pesquisar" };
  }
}

/** O campo padrão sem a altura fixa: o texto cresce até ~6 linhas. */
const CAMPO = inputClass.replace("h-9 ", "");

/** Sem IA, as sugestões que gravam continuam valendo; só as que geram texto ficam travadas. */
const PRECISAM_DE_IA = new Set<AcaoProposta["tipo"]>(["gerar_titulos", "gerar_descricao", "pesquisar_concorrentes"]);

/** Sugestões para começar, conforme a etapa aberta. */
const SUGESTOES: Partial<Record<EtapaId, string[]>> = {
  titulo: ["Faz o título mais curto", "Quero um título que comece pelo uso", "O que você já sabe do meu padrão?"],
  capa: ["Quero a capa sem pessoa", "Quantas imagens você sugere?", "O que você já sabe do meu padrão?"],
  descricao: ["Deixa a descrição mais acolhedora", "Faz a descrição mais curta", "O que você já sabe do meu padrão?"],
  revisar: ["Esse preço está bom?", "O que falta para publicar?", "O que você já sabe do meu padrão?"],
};

/** A mensagem que está indo (aparece na hora) ou que falhou (volta para o campo, com o erro). */
type Pendente = { texto: string; erro: string | null };

/**
 * Chat do anúncio. A IA responde e SUGERE ações; cada uma é um botão que você aprova. Nada caro
 * roda sozinho e nada é gravado sem o clique. O "Feito" vem do banco: recarregar não deixa
 * aplicar de novo.
 */
export function ChatAnuncio({
  mensagens,
  texto,
  onTexto,
  etapa,
  iaDisponivel,
  custo,
  onEnviar,
  onAplicar,
  campoRef,
}: {
  mensagens: MensagemDoChat[];
  texto: string;
  onTexto: (t: string) => void;
  etapa: EtapaId;
  iaDisponivel: boolean;
  /** Frase do custo antes de enviar ("Cada mensagem usa 1 geração de texto…"). */
  custo: string | null;
  /** Devolve `null` se deu certo, ou a mensagem de erro. */
  onEnviar: (texto: string) => Promise<string | null>;
  /** Aplica e devolve a nota para mostrar abaixo da ação (ou `false` se falhou). */
  onAplicar: (mensagemId: string, indice: number, a: AcaoProposta) => Promise<string | false>;
  campoRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [pendente, setPendente] = useState<Pendente | null>(null);
  // "Feito" desta sessão (sem a 0110 ele não volta do banco) e a nota de cada ação aplicada.
  const [feitas, setFeitas] = useState<Map<string, string>>(new Map());
  const [aplicando, setAplicando] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const noFim = useRef(true);
  const enviando = !!pendente && !pendente.erro;

  // Rola para a última mensagem só se a pessoa já estava no fim (não puxa quem está lendo lá em cima).
  useLayoutEffect(() => {
    const el = listaRef.current;
    if (el && noFim.current) el.scrollTop = el.scrollHeight;
  }, [mensagens.length, pendente]);

  async function enviar(t = texto) {
    const limpo = t.trim();
    if (!limpo || enviando || !iaDisponivel) return;
    noFim.current = true;
    setPendente({ texto: limpo, erro: null });
    onTexto("");
    const erro = await onEnviar(limpo);
    if (erro) {
      // Nada se perde: o texto volta para o campo, e o erro fica ao lado com "Tentar de novo".
      onTexto(limpo);
      setPendente({ texto: limpo, erro });
    } else {
      setPendente(null);
    }
  }

  async function aplicar(m: MensagemDoChat, i: number, a: AcaoProposta) {
    const chave = `${m.id}:${i}`;
    setAplicando(chave);
    const nota = await onAplicar(m.id, i, a);
    setAplicando(null);
    if (nota !== false) setFeitas((s) => new Map(s).set(chave, nota));
  }

  const sugestoes = SUGESTOES[etapa] ?? ["O que você já sabe do meu padrão?"];
  const perto = texto.length > LIMITE_MENSAGEM_CHAT * 0.8;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={listaRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="flex-1 min-h-0 overflow-y-auto space-y-3 px-4 py-3"
        role="log"
        aria-live="polite"
        aria-label="Conversa sobre o anúncio"
      >
        {mensagens.length === 0 && !pendente && (
          <div className="space-y-3">
            <p className="text-sm text-text-secondary flex gap-2">
              <MessageCircle size={16} className="mt-0.5 shrink-0" aria-hidden /> Diga o que quer em palavras simples. A IA sugere, você aprova cada passo.
            </p>
            {iaDisponivel && (
              <ul className="flex flex-wrap gap-2" aria-label="Sugestões para começar">
                {sugestoes.map((s) => (
                  <li key={s}>
                    <button type="button" className="rounded-full border border-border bg-surface-1 px-3 py-1 text-xs text-text-primary hover:bg-surface-2" onClick={() => void enviar(s)}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {mensagens.map((m) => (
          <Bolha key={m.id} papel={m.papel} texto={m.texto}>
            {m.papel === "ia" && m.acoes.length > 0 && (
              <ul className="mt-2 space-y-1.5" aria-label="Sugestões da IA">
                {m.acoes.map((a, i) => {
                  const chave = `${m.id}:${i}`;
                  const d = descreverAcao(a);
                  const feita = m.acoesFeitas.includes(i) || feitas.has(chave);
                  const nota = feitas.get(chave);
                  return (
                    <li key={chave} className="rounded-md border border-border bg-surface-1 p-2 text-xs text-text-secondary">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex-1 min-w-[10rem] break-words">{d.rotulo}</span>
                        {feita ? (
                          <span className="inline-flex items-center gap-1 text-positive">
                            <Check size={12} aria-hidden /> Feito
                          </span>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => void aplicar(m, i, a)} loading={aplicando === chave} disabled={aplicando !== null || (!iaDisponivel && PRECISAM_DE_IA.has(a.tipo))}>
                            {d.botao}
                          </Button>
                        )}
                      </div>
                      {nota && <p className="mt-1 text-text-primary">{nota}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Bolha>
        ))}

        {pendente && (
          <>
            <Bolha papel="usuario" texto={pendente.texto} />
            {pendente.erro ? (
              <div role="alert" className="rounded-md border border-negative/40 p-2 text-xs text-negative">
                <p className="flex gap-1.5">
                  <AlertTriangle size={14} className="shrink-0" aria-hidden /> {pendente.erro}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void enviar(pendente.texto)}>
                    Tentar de novo
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendente(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-secondary animate-pulse" role="status">
                A IA está pensando…
              </p>
            )}
          </>
        )}
      </div>

      <form
        className="border-t border-border px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void enviar();
        }}
      >
        {!iaDisponivel ? (
          <p className="text-sm text-text-secondary">
            Sem IA configurada, o chat fica desligado.{" "}
            <Link href="/configuracoes?aba=ia" className="text-accent underline">
              Configurar uma IA
            </Link>
          </p>
        ) : (
          <>
            <label htmlFor="chat-anuncio-campo" className="sr-only">
              Mensagem para a IA
            </label>
            <div className="flex items-end gap-2">
              <textarea
                id="chat-anuncio-campo"
                ref={campoRef}
                rows={1}
                className={`${CAMPO} flex-1 min-h-9 max-h-36 resize-none py-2 field-sizing-content`}
                value={texto}
                maxLength={LIMITE_MENSAGEM_CHAT}
                onChange={(e) => onTexto(e.target.value)}
                onKeyDown={(e) => {
                  // Enter envia; Shift+Enter quebra a linha (e nada durante a composição de acento).
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
                placeholder="Escreva para a IA (Shift+Enter quebra a linha)"
              />
              <Button type="submit" variant="primary" aria-label="Enviar mensagem" loading={enviando} disabled={enviando || texto.trim().length === 0}>
                <Send size={14} aria-hidden />
              </Button>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 text-xs text-text-tertiary">
              <span>{custo}</span>
              {perto && (
                <span className={texto.length >= LIMITE_MENSAGEM_CHAT ? "text-negative" : ""} aria-live="polite">
                  {texto.length.toLocaleString("pt-BR")}/{LIMITE_MENSAGEM_CHAT.toLocaleString("pt-BR")}
                </span>
              )}
            </div>
          </>
        )}
      </form>
    </div>
  );
}

function Bolha({ papel, texto, children }: { papel: "usuario" | "ia"; texto: string; children?: ReactNode }) {
  const minha = papel === "usuario";
  return (
    <div className={minha ? "text-right" : ""}>
      <div className={`inline-flex max-w-full items-start gap-1 ${minha ? "flex-row-reverse" : ""}`}>
        <p className={`rounded-lg px-3 py-2 text-sm text-left whitespace-pre-line break-words ${minha ? "bg-accent-soft text-text-primary" : "bg-surface-2 text-text-primary"}`}>
          <span className="sr-only">{minha ? "Você disse: " : "A IA respondeu: "}</span>
          {texto}
        </p>
        <BotaoCopiar texto={texto} rotulo={minha ? "sua mensagem" : "resposta da IA"} compacto />
      </div>
      {children && <div className="text-left">{children}</div>}
    </div>
  );
}

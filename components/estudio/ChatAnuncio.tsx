"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { AlertTriangle, Check, ClipboardPaste, ImageOff, MessageCircle, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { inputClass } from "@/components/ui/Modal";
import { diferencasFicha, mesclarFicha, ROTULO_CAMPO, ROTULO_TIPO_IMAGEM, valorLegivel, type FichaMarca, type TipoImagemMarca } from "@/lib/marca/ficha";
import { urlPublicaImagem } from "@/lib/marca/tipos";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { montarMontagemDeArquivos } from "@/components/marca/montagem";
import { LIMITE_MENSAGEM_CHAT } from "@/lib/validacao";
import type { EtapaId } from "@/lib/anuncio/etapas";
import { LIMITE_REFERENCIA, MAX_IMAGENS_MENSAGEM, ROTULO_REFERENCIA, type AcaoProposta, type AnexoMensagem, type QualReferencia } from "@/lib/ia/prompts-assistente";
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
    case "guardar_referencia_imagem":
      return { rotulo: "Guardar esta imagem nas referências do perfil (o visual que a loja quer)", botao: "Guardar referência" };
    case "usar_imagem_no_anuncio":
      return { rotulo: "Usar esta imagem no anúncio, como enviada por você (sem cota)", botao: "Usar no anúncio" };
    case "guardar_exemplo":
      return { rotulo: `Guardar como exemplo de ${a.tipoExemplo === "titulo" ? "título" : "descrição"} (a IA imita o tom e a estrutura): “${a.texto.length > 160 ? `${a.texto.slice(0, 160)}…` : a.texto}”`, botao: "Guardar exemplo" };
  }
}

/** O que vai junto da mensagem. */
export interface EnvioChat {
  texto: string;
  referencia: { qual: QualReferencia; deOutraLoja: boolean; texto: string } | null;
  /** Caminhos no Storage das imagens já enviadas e, com mais de uma, da montagem que vai à IA. */
  imagens: string[];
  montagem: string | null;
}

const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
const MAX_FOTO_MB = 5;

/** Imagem escolhida no chat: a prévia é local; o caminho existe depois de enviada ao Storage. */
type Foto = { id: string; arquivo: File; previa: string; path: string | null };

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
type Pendente = { texto: string; referencia: EnvioChat["referencia"]; fotos: Foto[]; montagem: string | null; erro: string | null };

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
  referenciasPerfil,
  fichaDoPerfil,
}: {
  mensagens: MensagemDoChat[];
  texto: string;
  onTexto: (t: string) => void;
  etapa: EtapaId;
  iaDisponivel: boolean;
  /** Frase do custo antes de enviar ("Cada mensagem usa 1 geração de texto…"). */
  custo: string | null;
  /** Devolve `null` se deu certo, ou a mensagem de erro. */
  onEnviar: (envio: EnvioChat) => Promise<string | null>;
  /** Aplica e devolve a nota para mostrar abaixo da ação (ou `false` se falhou). */
  onAplicar: (mensagemId: string, indice: number, a: AcaoProposta, extra?: { substituir?: string }) => Promise<string | false>;
  campoRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Referências de imagem do perfil (para escolher qual sai quando estão cheias); `null` = sem perfil. */
  referenciasPerfil: string[] | null;
  /** Ficha ativa do perfil, para mostrar o antes e depois de um ajuste. */
  fichaDoPerfil: (tipo: TipoImagemMarca) => FichaMarca;
}) {
  const [pendente, setPendente] = useState<Pendente | null>(null);
  // Referência sendo colada (painel aberto acima do campo) ou `null`.
  const [referencia, setReferencia] = useState<EnvioChat["referencia"]>(null);
  // "Feito" desta sessão (sem a 0110 ele não volta do banco) e a nota de cada ação aplicada.
  const [feitas, setFeitas] = useState<Map<string, string>>(new Map());
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  // Referências do perfil cheias: qual ação está esperando a escolha de quem sai, e a escolha.
  const [trocando, setTrocando] = useState<{ chave: string; substituir: string | null } | null>(null);
  const { enviar: subir } = useSupabaseUpload("produtos");
  const arquivoRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  const noFim = useRef(true);
  const enviando = !!pendente && !pendente.erro;

  // Rola para a última mensagem só se a pessoa já estava no fim (não puxa quem está lendo lá em cima).
  useLayoutEffect(() => {
    const el = listaRef.current;
    if (el && noFim.current) el.scrollTop = el.scrollHeight;
  }, [mensagens.length, pendente]);

  const referenciaCurta = !!referencia && referencia.texto.trim().length < 10;
  const podeEnviar = !!iaDisponivel && (texto.trim().length > 0 || !!referencia || fotos.length > 0) && !referenciaCurta;

  /** Imagens escolhidas pelo clipe, coladas (Ctrl+V) ou arrastadas: até 4, JPG/PNG/WebP de até 5 MB. */
  function adicionarFotos(arquivos: File[]) {
    const validos = arquivos.filter((f) => TIPOS_FOTO.includes(f.type) && f.size <= MAX_FOTO_MB * 1024 * 1024);
    if (validos.length < arquivos.length) toast.error(`Use imagem JPG, PNG ou WebP de até ${MAX_FOTO_MB} MB.`);
    const cabem = validos.slice(0, MAX_IMAGENS_MENSAGEM - fotos.length);
    if (cabem.length < validos.length) toast.error(`Até ${MAX_IMAGENS_MENSAGEM} imagens por mensagem.`);
    if (cabem.length) setFotos((atual) => [...atual, ...cabem.map((arquivo) => ({ id: crypto.randomUUID(), arquivo, previa: URL.createObjectURL(arquivo), path: null }))]);
  }

  function tirarFoto(id: string) {
    setFotos((atual) => {
      const f = atual.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.previa);
      return atual.filter((x) => x.id !== id);
    });
  }

  async function enviar(p: Omit<Pendente, "erro"> = { texto: texto.trim(), referencia: referencia ? { ...referencia, texto: referencia.texto.trim() } : null, fotos, montagem: null }) {
    if (enviando || !iaDisponivel || (!p.texto && !p.referencia && p.fotos.length === 0)) return;
    noFim.current = true;
    setPendente({ ...p, erro: null });
    onTexto("");
    setReferencia(null);
    setFotos([]);
    let atual = p;
    // Nada se perde: texto, referência e imagens voltam para o campo, e o erro fica ao lado com "Tentar de novo".
    const falhar = (erro: string) => {
      onTexto(atual.texto);
      setReferencia(atual.referencia);
      setFotos(atual.fotos);
      setPendente({ ...atual, erro });
    };
    try {
      // Envia ao Storage só o que ainda não foi (tentar de novo não sobe a mesma imagem duas vezes).
      const enviadas = await Promise.all(
        p.fotos.map(async (f) => (f.path ? f : { ...f, path: (await subir(f.arquivo, { maxSizeMb: MAX_FOTO_MB, tiposAceitos: TIPOS_FOTO, prefixo: "estudio-chat" }))?.path ?? null })),
      );
      atual = { ...atual, fotos: enviadas };
      if (enviadas.some((f) => !f.path)) return falhar("Não consegui enviar a imagem. Tente de novo.");
      // A IA lê uma imagem por chamada: com várias, vai uma montagem delas (as originais ficam guardadas).
      let montagem = p.montagem;
      if (enviadas.length > 1 && !montagem) {
        const blob = await montarMontagemDeArquivos(enviadas.map((f) => f.arquivo));
        montagem = (await subir(new File([blob], "montagem.jpg", { type: "image/jpeg" }), { maxSizeMb: MAX_FOTO_MB, tiposAceitos: ["image/"], prefixo: "estudio-chat-montagem" }))?.path ?? null;
        if (!montagem) return falhar("Não consegui juntar as imagens. Tente de novo.");
        atual = { ...atual, montagem };
      }
      const erro = await onEnviar({ texto: p.texto, referencia: p.referencia, imagens: enviadas.map((f) => f.path!), montagem });
      if (erro) return falhar(erro);
      enviadas.forEach((f) => URL.revokeObjectURL(f.previa));
      setPendente(null);
    } catch (e) {
      falhar(e instanceof Error ? e.message : "Não consegui preparar as imagens.");
    }
  }

  async function aplicar(m: MensagemDoChat, i: number, a: AcaoProposta, substituir?: string) {
    const chave = `${m.id}:${i}`;
    // Referências do perfil cheias: antes de aplicar, você escolhe qual sai.
    if (a.tipo === "guardar_referencia_imagem" && !substituir && (referenciasPerfil?.length ?? 0) >= 8) {
      setTrocando({ chave, substituir: null });
      return;
    }
    setAplicando(chave);
    const nota = await onAplicar(m.id, i, a, substituir ? { substituir } : undefined);
    setAplicando(null);
    if (nota !== false) {
      setTrocando(null);
      setFeitas((s) => new Map(s).set(chave, nota));
    }
  }

  const sugestoes = SUGESTOES[etapa] ?? ["O que você já sabe do meu padrão?"];
  const perto = texto.length > LIMITE_MENSAGEM_CHAT * 0.8;

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col ${arrastando ? "ring-2 ring-inset ring-accent" : ""}`}
      onDragOver={(e) => {
        if (!iaDisponivel || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
      }}
      onDrop={(e) => {
        if (!iaDisponivel) return;
        e.preventDefault();
        setArrastando(false);
        adicionarFotos(Array.from(e.dataTransfer.files));
      }}
    >
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
                    <button type="button" className="rounded-full border border-border bg-surface-1 px-3 py-1 text-xs text-text-primary hover:bg-surface-2" onClick={() => void enviar({ texto: s, referencia: null, fotos: [], montagem: null })}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {mensagens.map((m) => (
          <Bolha key={m.id} papel={m.papel} texto={m.texto} anexos={m.anexos} onAmpliar={setAmpliada}>
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
                        {"path" in a && <Miniatura src={urlPublicaImagem(a.path)} alt="Imagem da sugestão" onAmpliar={setAmpliada} pequena />}
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
                      {a.tipo === "ajustar_ficha" && !feita && <AntesDepoisFicha atual={fichaDoPerfil(a.tipoImagem)} campos={a.campos} />}
                      {trocando?.chave === chave && referenciasPerfil && (
                        <fieldset className="mt-2 rounded-md border border-border p-2">
                          <legend className="px-1 text-xs text-text-primary">O perfil já tem 8 referências. Qual sai para esta entrar?</legend>
                          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Referência que sai">
                            {referenciasPerfil.map((r) => (
                              <button
                                key={r}
                                type="button"
                                role="radio"
                                aria-checked={trocando.substituir === r}
                                aria-label="Tirar esta referência"
                                onClick={() => setTrocando({ chave, substituir: r })}
                                className={`overflow-hidden rounded-md border-2 ${trocando.substituir === r ? "border-accent" : "border-transparent"}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Storage, já otimizada no envio */}
                                <img src={urlPublicaImagem(r)} alt="" className="aspect-square w-full object-cover" />
                              </button>
                            ))}
                          </div>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="primary" disabled={!trocando.substituir || aplicando !== null} loading={aplicando === chave} onClick={() => void aplicar(m, i, a, trocando.substituir!)}>
                              Trocar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setTrocando(null)}>
                              Cancelar
                            </Button>
                          </div>
                        </fieldset>
                      )}
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
            <Bolha papel="usuario" texto={pendente.texto} anexos={pendente.referencia ? [{ tipo: "texto", ...pendente.referencia }] : []} previas={pendente.fotos.map((f) => f.previa)} onAmpliar={setAmpliada} />
            {pendente.erro ? (
              <div role="alert" className="rounded-md border border-negative/40 p-2 text-xs text-negative">
                <p className="flex gap-1.5">
                  <AlertTriangle size={14} className="shrink-0" aria-hidden /> {pendente.erro}
                </p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void enviar(pendente)}>
                    Tentar de novo
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendente(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-secondary animate-pulse" role="status">
                {pendente.fotos.length ? "A IA está olhando as imagens…" : "A IA está pensando…"}
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
            {referencia && <PainelReferencia valor={referencia} onMudar={setReferencia} />}
            {fotos.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-2" aria-label="Imagens para enviar">
                {fotos.map((f, i) => (
                  <li key={f.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
                    <img src={f.previa} alt={`Imagem ${i + 1}`} className="h-16 w-16 rounded-md border border-border object-cover" />
                    <button
                      type="button"
                      aria-label={`Remover a imagem ${i + 1}`}
                      onClick={() => tirarFoto(f.id)}
                      className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border border-border bg-surface-1 text-text-secondary shadow-elev-1 hover:text-text-primary"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
                onPaste={(e) => {
                  // Print colado (Ctrl+V) vira anexo; texto colado segue normal.
                  const imagens = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
                  if (imagens.length) {
                    e.preventDefault();
                    adicionarFotos(imagens);
                  }
                }}
                onKeyDown={(e) => {
                  // Enter envia; Shift+Enter quebra a linha (e nada durante a composição de acento).
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void enviar();
                  }
                }}
                placeholder={referencia ? "O que você quer saber dessa referência? (opcional)" : "Escreva para a IA (Shift+Enter quebra a linha)"}
              />
              <Button type="submit" variant="primary" aria-label="Enviar mensagem" loading={enviando} disabled={enviando || !podeEnviar}>
                <Send size={14} aria-hidden />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {!referencia && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setReferencia({ qual: "descricao", deOutraLoja: false, texto: "" })}>
                  <ClipboardPaste size={14} aria-hidden /> Colar referência
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" onClick={() => arquivoRef.current?.click()} disabled={fotos.length >= MAX_IMAGENS_MENSAGEM}>
                <Paperclip size={14} aria-hidden /> Imagem
              </Button>
              <input
                ref={arquivoRef}
                type="file"
                accept={TIPOS_FOTO.join(",")}
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  adicionarFotos(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 text-xs text-text-tertiary">
              <span>{fotos.length ? `${custo ?? ""} Mensagem com imagem leva alguns segundos.`.trim() : custo}</span>
              {perto && (
                <span className={texto.length >= LIMITE_MENSAGEM_CHAT ? "text-negative" : ""} aria-live="polite">
                  {texto.length.toLocaleString("pt-BR")}/{LIMITE_MENSAGEM_CHAT.toLocaleString("pt-BR")}
                </span>
              )}
            </div>
          </>
        )}
      </form>

      {ampliada && (
        <div
          className="absolute inset-0 z-10 flex flex-col bg-surface-1"
          role="dialog"
          aria-label="Imagem ampliada"
          tabIndex={-1}
          ref={(el) => el?.focus()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              // Fecha só a imagem, não o chat.
              e.preventDefault();
              setAmpliada(null);
            }
          }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
            <a href={ampliada} target="_blank" rel="noopener noreferrer" download className="text-sm text-accent underline">
              Baixar
            </a>
            <button type="button" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary" onClick={() => setAmpliada(null)}>
              <X size={14} aria-hidden /> Fechar
            </button>
          </div>
          <div className="flex-1 min-h-0 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagem inteira, sem recorte */}
            <img src={ampliada} alt="Imagem mandada na conversa" className="h-full w-full object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}

/** O que muda na ficha se o ajuste for aplicado, campo a campo. */
function AntesDepoisFicha({ atual, campos }: { atual: FichaMarca; campos: FichaMarca }) {
  const mudancas = diferencasFicha(atual, mesclarFicha(atual, campos));
  if (mudancas.length === 0) return <p className="mt-1 text-text-tertiary">A ficha atual já está assim: nada muda.</p>;
  return (
    <ul className="mt-1.5 space-y-0.5" aria-label="Antes e depois na ficha">
      {mudancas.map((d) => (
        <li key={d.campo}>
          <span className="text-text-secondary">{d.rotulo}:</span> <span className="line-through">{d.de}</span> → <span className="text-text-primary">{d.para}</span>
        </li>
      ))}
    </ul>
  );
}

/** Miniatura de imagem do chat: clicar amplia; imagem apagada do Storage mostra o aviso sem quebrar. */
function Miniatura({ src, alt, onAmpliar, pequena = false }: { src: string; alt: string; onAmpliar: (src: string) => void; pequena?: boolean }) {
  const [erro, setErro] = useState(false);
  const tamanho = pequena ? "h-10 w-10" : "h-20 w-20";
  if (erro)
    return (
      <span className={`${tamanho} inline-grid shrink-0 place-items-center rounded-md border border-dashed border-border text-center text-[10px] leading-tight text-text-tertiary`}>
        <ImageOff size={14} aria-hidden />
        imagem indisponível
      </span>
    );
  return (
    <button type="button" onClick={() => onAmpliar(src)} aria-label={`Ampliar: ${alt}`} className={`${tamanho} shrink-0 overflow-hidden rounded-md border border-border`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagem do Storage ou prévia local */}
      <img src={src} alt="" className="h-full w-full object-cover" onError={() => setErro(true)} />
    </button>
  );
}

/** Escolha curta em botões (rádio acessível pelo teclado com Tab e espaço). */
function Escolha<T extends string | boolean>({ rotulo, opcoes, valor, onMudar }: { rotulo: string; opcoes: { valor: T; texto: string }[]; valor: T; onMudar: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-text-secondary">{rotulo}:</span>
      {opcoes.map((o) => (
        <button
          key={String(o.valor)}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onMudar(o.valor)}
          className={`rounded-full border px-2.5 py-0.5 text-xs ${valor === o.valor ? "border-accent bg-accent-soft text-text-primary" : "border-border text-text-secondary hover:bg-surface-2"}`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/**
 * "Colar referência": um título ou uma descrição que você gosta (seu ou de outra loja). Vai à
 * IA como exemplo, nunca como ordem. Link não é lido: cole o texto.
 */
function PainelReferencia({ valor, onMudar }: { valor: NonNullable<EnvioChat["referencia"]>; onMudar: (v: EnvioChat["referencia"]) => void }) {
  return (
    <fieldset className="mb-2 space-y-2 rounded-md border border-border bg-surface-2 p-2">
      <legend className="sr-only">Referência colada</legend>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-primary" aria-hidden>
          Referência colada
        </span>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary" onClick={() => onMudar(null)}>
          <X size={12} aria-hidden /> Tirar
        </button>
      </div>
      <Escolha
        rotulo="O que é"
        valor={valor.qual}
        onMudar={(qual) => onMudar({ ...valor, qual })}
        opcoes={[
          { valor: "titulo", texto: "Um título" },
          { valor: "descricao", texto: "Uma descrição" },
          { valor: "outro", texto: "Outro texto" },
        ]}
      />
      <Escolha
        rotulo="De quem é"
        valor={valor.deOutraLoja}
        onMudar={(deOutraLoja) => onMudar({ ...valor, deOutraLoja })}
        opcoes={[
          { valor: false, texto: "Meu" },
          { valor: true, texto: "De outra loja" },
        ]}
      />
      <label className="sr-only" htmlFor="chat-anuncio-referencia">
        Texto de referência
      </label>
      <textarea
        id="chat-anuncio-referencia"
        className={`${CAMPO} h-28 resize-y py-2`}
        value={valor.texto}
        maxLength={LIMITE_REFERENCIA}
        autoFocus
        onChange={(e) => onMudar({ ...valor, texto: e.target.value })}
        placeholder="Cole aqui o texto (link não é lido: copie o texto do anúncio)"
      />
      <p className="flex flex-wrap justify-between gap-x-3 text-xs text-text-tertiary">
        <span>{valor.deOutraLoja ? "De outra loja: a IA aproveita a estrutura e o tom, não o texto." : "Seu: a IA pode guardar como exemplo, se você aprovar."}</span>
        <span>
          {valor.texto.length.toLocaleString("pt-BR")}/{LIMITE_REFERENCIA.toLocaleString("pt-BR")}
        </span>
      </p>
    </fieldset>
  );
}

function Bolha({
  papel,
  texto,
  anexos = [],
  previas = [],
  onAmpliar,
  children,
}: {
  papel: "usuario" | "ia";
  texto: string;
  anexos?: AnexoMensagem[];
  /** Prévias locais da mensagem que ainda está indo. */
  previas?: string[];
  onAmpliar?: (src: string) => void;
  children?: ReactNode;
}) {
  const minha = papel === "usuario";
  const imagens = [...anexos.flatMap((a) => (a.tipo === "imagem" ? [urlPublicaImagem(a.path)] : [])), ...previas];
  return (
    <div className={minha ? "text-right" : ""}>
      {texto && (
        <div className={`inline-flex max-w-full items-start gap-1 ${minha ? "flex-row-reverse" : ""}`}>
          <p className={`rounded-lg px-3 py-2 text-sm text-left whitespace-pre-line break-words ${minha ? "bg-accent-soft text-text-primary" : "bg-surface-2 text-text-primary"}`}>
            <span className="sr-only">{minha ? "Você disse: " : "A IA respondeu: "}</span>
            {texto}
          </p>
          <BotaoCopiar texto={texto} rotulo={minha ? "sua mensagem" : "resposta da IA"} compacto />
        </div>
      )}
      {imagens.length > 0 && onAmpliar && (
        <div className={`mt-1 flex flex-wrap gap-1.5 ${minha ? "justify-end" : ""}`}>
          {imagens.map((src, i) => (
            <Miniatura key={src} src={src} alt={`imagem ${i + 1} da mensagem`} onAmpliar={onAmpliar} />
          ))}
        </div>
      )}
      {anexos.map((a, i) =>
        a.tipo === "texto" ? (
          <details key={i} className="mt-1 ml-auto max-w-[90%] rounded-md border border-border bg-surface-1 px-2 py-1 text-left text-xs">
            <summary className="cursor-pointer text-text-secondary">
              Referência: {ROTULO_REFERENCIA[a.qual]} {a.deOutraLoja ? "de outra loja" : "sua"}
            </summary>
            <p className="mt-1 whitespace-pre-line break-words text-text-primary">{a.texto}</p>
          </details>
        ) : null,
      )}
      {children && <div className="text-left">{children}</div>}
    </div>
  );
}

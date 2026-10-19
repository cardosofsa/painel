"use client";

import { useState, useTransition } from "react";
import { Copy, ImageIcon, ThumbsDown, ThumbsUp, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AcoesImagem, BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { FormField, Modal, inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import type { FichaMarca } from "@/lib/marca/ficha";
import type { RegrasPlataforma } from "@/lib/marca/plataformas";
import { resumoDaFicha } from "@/lib/marca/prompt-capa";
import { urlPublicaImagem } from "@/lib/marca/tipos";
import type { Violacao } from "@/lib/conformidade/termos";
import { adicionarCapaPropria, gerarCenaCapa, promptDaCapa, registrarCapaFinal, removerCapaPropria, vereditoCapa, type RascunhoAberto } from "@/app/(painel)/produtos/estudio/actions";
import { comporCapa } from "@/components/marca/compor";
import { numeroDaEtapa } from "@/lib/anuncio/etapas";

type Veredito = "aprovada" | "ajustar" | "rejeitada";
const ROTULO_VEREDITO: Record<Veredito, string> = { aprovada: "Aprovada", ajustar: "Ajustar", rejeitada: "Rejeitada" };

interface Previa {
  indice: number;
  blob: Blob;
  url: string;
  cenaPath: string;
}

/**
 * Capa 1. Dois caminhos: (A) só o prompt, sem custo, para usar em outro gerador; (B) gerar aqui.
 * No B a IA faz SÓ a cena; o título, os selos, a faixa e a logo são desenhados no navegador, com a
 * ortografia aprovada. Uma capa por vez, cada uma com veredito: o motivo vira ajuste da ficha.
 */
export function PainelCapa({
  rascunho,
  ficha,
  logoUrl,
  plataforma,
  imagensUsadas,
  iaDisponivel,
  onMudou,
  onAjustar,
}: {
  rascunho: RascunhoAberto;
  ficha: FichaMarca;
  logoUrl: string | null;
  plataforma: RegrasPlataforma;
  imagensUsadas: number | null;
  iaDisponivel: boolean;
  onMudou: () => void;
  /** Leva o motivo do usuário para a conversa, onde a IA propõe o ajuste da ficha. */
  onAjustar: (mensagem: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const { enviar } = useSupabaseUpload("produtos");
  const [textoFaixa, setTextoFaixa] = useState(rascunho.estado.textoFaixa ?? "");
  const [prompts, setPrompts] = useState<{ cena: string; completo: string; violacoes: Violacao[] } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [motivo, setMotivo] = useState("");
  const [usadas, setUsadas] = useState<{ usadas: number; limite: number | null } | null>(null);
  // A cena já foi gerada e paga, mas desenhar o texto falhou: fica o aviso com "Desenhar de
  // novo", que só refaz o desenho no navegador (sem cota). Antes a prévia sumia com um toast.
  const [falhaDesenho, setFalhaDesenho] = useState<{ indice: number; cenaPath: string; mensagem: string } | null>(null);
  const [gerando, setGerando] = useState(false);

  const titulo = rascunho.titulo;
  const capas = rascunho.estado.capas ?? [];
  const semVeredito = capas.some((c) => !c.veredito);
  const geradas = capas.filter((c) => !c.propria).length;
  const cheio = capas.length >= 12;
  const fichaVazia = Object.keys(ficha).length === 0;

  function verPrompt() {
    startTransition(async () => {
      const r = await executarComToast(promptDaCapa({ rascunho_id: rascunho.id, textoFaixa: textoFaixa.trim() || null }), { erro: "Não foi possível montar o prompt." });
      if (r.ok) setPrompts(r.dado);
    });
  }

  async function comporDe(cenaUrl: string, indice: number, cenaPath: string) {
    const blob = await comporCapa({ cenaUrl, titulo: titulo ?? "", ficha, textoFaixa: textoFaixa.trim() || null, logoUrl });
    setPrevia((antiga) => {
      if (antiga) URL.revokeObjectURL(antiga.url);
      return { indice, blob, url: URL.createObjectURL(blob), cenaPath };
    });
  }

  function gerar() {
    setConfirmando(false);
    setGerando(true);
    startTransition(async () => {
      const r = await executarComToast(gerarCenaCapa({ rascunho_id: rascunho.id, textoFaixa: textoFaixa.trim() || null }), { erro: "Não foi possível gerar a capa." });
      setGerando(false);
      if (!r.ok) return;
      setUsadas({ usadas: r.dado.usadas, limite: r.dado.limite });
      await desenhar(r.dado.url, r.dado.indice, r.dado.cenaPath);
      onMudou();
    });
  }

  async function desenhar(cenaUrl: string, indice: number, cenaPath: string) {
    try {
      await comporDe(cenaUrl, indice, cenaPath);
      setFalhaDesenho(null);
    } catch (e) {
      setFalhaDesenho({ indice, cenaPath, mensagem: e instanceof Error ? e.message : "Não consegui desenhar o título na imagem." });
    }
  }

  function reabrir(indice: number, cenaPath: string) {
    startTransition(async () => {
      await desenhar(urlPublicaImagem(cenaPath), indice, cenaPath);
    });
  }

  /** Imagem feita fora do Painel: vai direto, aprovada, sem cota. */
  function enviarPropria(file: File) {
    startTransition(async () => {
      const up = await enviar(file, { maxSizeMb: 5, tiposAceitos: ["image/jpeg", "image/png", "image/webp"], prefixo: "estudio-propria" });
      if (!up) return;
      const r = await executarComToast(adicionarCapaPropria({ rascunho_id: rascunho.id, path: up.path }), { sucesso: "Imagem adicionada ao anúncio.", erro: "Não foi possível adicionar a imagem." });
      if (r.ok) onMudou();
    });
  }

  function remover(indice: number) {
    startTransition(async () => {
      const r = await executarComToast(removerCapaPropria({ rascunho_id: rascunho.id, indice }), { sucesso: "Imagem removida do anúncio.", erro: "Não foi possível remover a imagem." });
      if (r.ok) onMudou();
    });
  }

  function decidir(v: Veredito) {
    if (!previa) return;
    startTransition(async () => {
      const up = await enviar(new File([previa.blob], "capa.png", { type: "image/png" }), { maxSizeMb: 5, tiposAceitos: ["image/"], prefixo: "estudio-capa" });
      if (!up) return;
      const f = await executarComToast(registrarCapaFinal({ rascunho_id: rascunho.id, indice: previa.indice, finalPath: up.path }), { erro: "Não foi possível guardar a capa." });
      if (!f.ok) return;
      const r = await executarComToast(vereditoCapa({ rascunho_id: rascunho.id, indice: previa.indice, veredito: v, motivo: motivo.trim() || null }), { sucesso: ROTULO_VEREDITO[v], erro: "Não foi possível registrar o veredito." });
      if (!r.ok) return;
      if (v !== "aprovada" && motivo.trim()) onAjustar(`${v === "rejeitada" ? "Rejeitei" : "Quero ajustar"} a capa porque: ${motivo.trim()}. O que muda na ficha?`);
      URL.revokeObjectURL(previa.url);
      setPrevia(null);
      setMotivo("");
      onMudou();
    });
  }

  return (
    <Card>
      <div id="painel-capa" />
      <CardHeader>
        <div>
          <CardTitle>{numeroDaEtapa("capa")}. Capa 1</CardTitle>
          <CardSubtitle>A primeira imagem decide o clique. Em 2 segundos, reduzida, o produto e o nome precisam ser entendidos.</CardSubtitle>
        </div>
      </CardHeader>

      {!titulo ? (
        <p className="text-sm text-text-secondary">Escolha o título primeiro: a capa leva o título aprovado.</p>
      ) : (
        <>
          {fichaVazia && <p className="mb-3 rounded-md border border-border bg-surface-2 p-3 text-xs text-text-secondary">A ficha da Capa 1 está vazia: vou usar um padrão neutro. Preencha em Configurações › Ficha de arte (ou peça no assistente) para a capa seguir o visual da sua loja.</p>}
          {plataforma.capaFundoBranco && <p className="mb-3 text-xs text-text-secondary">{plataforma.nome} costuma exigir fundo branco na primeira imagem: a cena será gerada com fundo branco.</p>}

          <FormField label="Texto da faixa inferior (opcional)" dica="Desenhado por código, sem erro de ortografia. A faixa só aparece se a ficha pedir ou se você escrever aqui.">
            <input className={inputClass} value={textoFaixa} maxLength={60} onChange={(e) => setTextoFaixa(e.target.value)} placeholder="Ex.: Produtos selecionados com cuidado" />
          </FormField>

          <div className="flex flex-wrap gap-2 mb-3">
            <Button variant="secondary" onClick={verPrompt} loading={pending && !previa} disabled={pending}>
              <Copy size={14} aria-hidden /> Ver o prompt (sem custo)
            </Button>
            <Button variant="primary" onClick={() => setConfirmando(true)} loading={gerando} disabled={pending || !iaDisponivel || semVeredito || geradas >= 6 || cheio} title={semVeredito ? "Dê um veredito à capa anterior primeiro" : undefined}>
              <ImageIcon size={14} aria-hidden /> {gerando ? "Gerando a cena…" : "Gerar a capa aqui"}
            </Button>
          </div>
          {gerando && <p className="text-xs text-text-secondary mb-3" aria-live="polite">A cena leva alguns segundos. Não feche a página: a imagem já está reservada na sua cota.</p>}
          {falhaDesenho && (
            <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-negative/40 p-3 text-sm">
              <span className="text-negative min-w-0">A cena foi gerada, mas o desenho do texto falhou: {falhaDesenho.mensagem}</span>
              <Button size="sm" variant="secondary" onClick={() => reabrir(falhaDesenho.indice, falhaDesenho.cenaPath)} loading={pending} disabled={pending}>
                Desenhar de novo (sem custo)
              </Button>
            </div>
          )}
          {semVeredito && !previa && <p className="text-xs text-text-tertiary mb-3">Há uma capa sem veredito. Abra-a abaixo e diga se aprova, quer ajustar ou rejeita: assim a ficha melhora antes de gastar outra imagem.</p>}

          {prompts && (
            <div className="mb-4 space-y-3">
              {prompts.violacoes.length > 0 && (
                <p className="text-xs text-negative" role="alert">
                  Textos da capa com algo a rever: {prompts.violacoes.map((v) => `“${v.trecho}” (${v.motivo.toLowerCase()})`).join("; ")}.
                </p>
              )}
              {[
                { rotulo: "Para o gerador de imagens do Painel (só a cena)", texto: prompts.cena },
                { rotulo: "Para outro gerador (com título, selos, faixa e logo)", texto: prompts.completo },
              ].map((p) => (
                <div key={p.rotulo}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-text-secondary">{p.rotulo}</span>
                    <BotaoCopiar texto={p.texto} rotulo="prompt" />
                  </div>
                  <textarea readOnly className={`${inputClass} h-40 py-2 font-mono text-xs`} value={p.texto} aria-label={p.rotulo} />
                </div>
              ))}
            </div>
          )}

          {previa && (
            <div className="mb-4 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <ImagemStorage src={previa.url} alt="Prévia da capa" className="w-[300px] max-w-full rounded-md border border-border" prioridade />
                  <p className="text-xs text-text-tertiary mt-1">300 px: o tamanho de uma miniatura na busca</p>
                  <AcoesImagem url={previa.url} nomeArquivo="capa-1.png" rotulo="capa" />
                </div>
                <div>
                  <ImagemStorage src={previa.url} alt="Prévia reduzida da capa" className="w-[110px] rounded-md border border-border" />
                  <p className="text-xs text-text-tertiary mt-1">110 px: dá para ler o produto e o nome?</p>
                </div>
              </div>
              <div className="mt-3">
                <FormField label="O que mudar, se não for aprovar? (opcional)">
                  <input className={inputClass} value={motivo} maxLength={240} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: produto pequeno demais, fundo escuro" />
                </FormField>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" onClick={() => decidir("aprovada")} loading={pending} disabled={pending}>
                    <ThumbsUp size={14} aria-hidden /> Aprovar
                  </Button>
                  <Button variant="secondary" onClick={() => decidir("ajustar")} disabled={pending}>
                    <Wrench size={14} aria-hidden /> Ajustar
                  </Button>
                  <Button variant="ghost" onClick={() => decidir("rejeitada")} disabled={pending}>
                    <ThumbsDown size={14} aria-hidden /> Rejeitar
                  </Button>
                </div>
                <p className="text-xs text-text-tertiary mt-2">Ajustar ou rejeitar leva o seu motivo para a conversa, onde a IA propõe a mudança na ficha. Você aprova antes de valer.</p>
              </div>
            </div>
          )}

        </>
      )}

      <div className="mt-4 rounded-md border border-border p-3">
        <p className="text-sm font-medium text-text-primary">Já tem a imagem pronta?</p>
        <p className="text-xs text-text-secondary mb-2">Envie a capa ou uma foto que você fez em outro gerador. Ela entra aprovada no anúncio, sem usar a cota de imagens. JPG, PNG ou WebP, até 5 MB.</p>
        <CampoArquivo rotulo={pending ? "Enviando…" : "Enviar minha imagem"} aceita="image/jpeg,image/png,image/webp" disabled={pending || cheio} onArquivo={enviarPropria} />
        {cheio && <p className="text-xs text-text-tertiary mt-1">O anúncio já tem 12 imagens: remova uma enviada antes.</p>}
      </div>

      {capas.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-medium uppercase tracking-wide text-text-tertiary mb-2">
            Imagens deste anúncio ({capas.length}) · geradas com IA: {geradas}/6{imagensUsadas != null && ` · imagens geradas no mês: ${usadas?.usadas ?? imagensUsadas}${usadas?.limite ? ` de ${usadas.limite}` : ""}`}
          </h4>
          <ul className="flex flex-wrap gap-3">
            {capas.map((c, i) => (
              <li key={c.cenaPath} className="w-[120px]">
                <ImagemStorage src={urlPublicaImagem(c.finalPath ?? c.cenaPath)} alt={`Imagem ${i + 1}`} className="w-[120px] h-[120px] rounded-md border border-border object-cover bg-surface-2" />
                <p className="text-xs mt-1 text-text-secondary">{c.propria ? "Enviada por você" : c.veredito ? ROTULO_VEREDITO[c.veredito] : "Sem veredito"}</p>
                {c.finalPath && <AcoesImagem url={urlPublicaImagem(c.finalPath)} nomeArquivo={`capa-${i + 1}.png`} rotulo={`capa ${i + 1}`} />}
                {c.motivo && <p className="text-xs text-text-tertiary break-words">{c.motivo}</p>}
                {c.propria && (
                  <Button size="sm" variant="ghost" onClick={() => remover(i)} disabled={pending || !!previa} aria-label={`Remover a imagem ${i + 1}`}>
                    <Trash2 size={12} aria-hidden /> Remover
                  </Button>
                )}
                {!c.veredito && titulo && (
                  <Button size="sm" variant="ghost" onClick={() => reabrir(i, c.cenaPath)} disabled={pending}>
                    Revisar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal open={confirmando} onClose={() => setConfirmando(false)} title="Gerar a cena da capa?" width="max-w-lg">
        <div className="space-y-3 text-sm text-text-secondary">
          <p>
            Vou gerar <strong className="text-text-primary">só a cena e o produto</strong> (sem nenhum texto). O título, os selos, a faixa e a logo são desenhados depois, sem custo e sem erro de ortografia.
          </p>
          <p>
            Isto usa <strong className="text-text-primary">1 imagem da sua cota do mês</strong>
            {imagensUsadas != null ? ` (já usadas: ${usadas?.usadas ?? imagensUsadas})` : ""}. Você pode gerar uma capa por vez e dar o veredito antes da próxima.
          </p>
          <div>
            <span className="block text-xs font-medium text-text-secondary mb-1">Título que vai na capa</span>
            <p className="rounded-md bg-surface-2 p-2 text-text-primary">{titulo}</p>
          </div>
          <div>
            <span className="block text-xs font-medium text-text-secondary mb-1">Padrão visual que será seguido</span>
            <pre className="whitespace-pre-wrap rounded-md bg-surface-2 p-2 text-xs text-text-primary">{resumoDaFicha(ficha) || "Padrão neutro (a ficha da Capa 1 está vazia)."}</pre>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button variant="primary" className="flex-1" onClick={gerar}>
              Gerar (usa 1 imagem)
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

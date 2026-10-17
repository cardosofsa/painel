"use client";

import { Package } from "lucide-react";
import { AcoesImagem, BotaoCopiar } from "@/components/ui/BotaoCopiar";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { formatBRL } from "@/lib/format";
import { textoHashtags, textoPacoteAnuncio, textoPalavrasChave, textoPreco } from "@/lib/copiar";
import { urlPublicaImagem } from "@/lib/marca/tipos";
import type { RascunhoAberto } from "@/app/(painel)/produtos/estudio/actions";

function Linha({ rotulo, texto, children, vazio }: { rotulo: string; texto: string; children?: React.ReactNode; vazio: string }) {
  return (
    <li className="flex items-start justify-between gap-2 border-b border-border py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <span className="block text-xs font-medium uppercase tracking-wide text-text-tertiary">{rotulo}</span>
        {texto ? <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-text-primary">{texto}</p> : <p className="mt-0.5 text-sm text-text-tertiary">{vazio}</p>}
        {children}
      </div>
      <BotaoCopiar texto={texto} rotulo={rotulo.toLowerCase()} />
    </li>
  );
}

/**
 * Pacote do anúncio: tudo que o Seller Centre pede, pronto para colar, cada campo com o seu
 * botão de copiar e um "Copiar tudo" na ordem em que a Shopee pergunta. O preço é o do cadastro
 * do produto; quem calcula preço por margem e comissão é a Precificação.
 */
export function PainelPacote({ rascunho, palavrasChave }: { rascunho: RascunhoAberto; palavrasChave: string[] }) {
  const aprovadas = (rascunho.estado.capas ?? []).filter((c) => c.veredito === "aprovada" && c.finalPath);
  const pacote = {
    titulo: rascunho.titulo,
    descricao: rascunho.descricao,
    palavrasChave,
    preco: rascunho.produto.precoVenda,
    numeroImagens: rascunho.estado.numeroImagens ?? null,
  };
  const tudo = textoPacoteAnuncio(pacote);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>5. Pacote do anúncio</CardTitle>
          <CardSubtitle>Tudo pronto para colar no Seller Centre, na ordem em que ele pede.</CardSubtitle>
        </div>
        <span className="flex items-center gap-1 text-xs text-text-secondary">
          Copiar tudo <BotaoCopiar texto={tudo} rotulo="o pacote inteiro" />
        </span>
      </CardHeader>

      <ul>
        <Linha rotulo="Título" texto={rascunho.titulo ?? ""} vazio="Escolha o título no passo 1." />
        <Linha rotulo="Descrição" texto={rascunho.descricao ?? ""} vazio="Salve a descrição no passo 3." />
        <Linha rotulo="Palavras-chave" texto={textoPalavrasChave(palavrasChave)} vazio="Gere os títulos para receber sugestões." />
        <Linha rotulo="Hashtags" texto={textoHashtags(palavrasChave)} vazio="Saem das palavras-chave." />
        <Linha rotulo="Preço" texto={textoPreco(rascunho.produto.precoVenda)} vazio="O produto está sem preço de venda.">
          {rascunho.produto.precoVenda ? <span className="text-xs text-text-tertiary">{formatBRL(rascunho.produto.precoVenda)} (preço de venda do cadastro)</span> : null}
        </Linha>
        <Linha rotulo="Imagens" texto={rascunho.estado.numeroImagens ? String(rascunho.estado.numeroImagens) : ""} vazio="Diga ao assistente quantas imagens quer.">
          {aprovadas.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-3">
              {aprovadas.map((c, i) => (
                <li key={c.finalPath}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlPublicaImagem(c.finalPath!)} alt={`Capa aprovada ${i + 1}`} width={96} height={96} className="h-24 w-24 rounded-md border border-border object-cover bg-surface-2" loading="lazy" />
                  <AcoesImagem url={urlPublicaImagem(c.finalPath!)} nomeArquivo={`capa-${i + 1}.png`} rotulo={`capa aprovada ${i + 1}`} />
                </li>
              ))}
            </ul>
          )}
        </Linha>
      </ul>
      {!tudo && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-text-tertiary">
          <Package size={12} aria-hidden /> Os campos aparecem aqui conforme você avança.
        </p>
      )}
    </Card>
  );
}

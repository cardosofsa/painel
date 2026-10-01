"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { executar } from "@/lib/acao";
import { analisarAnuncio, type InvestimentoAnuncio, type TipoInvestimentoAnuncio } from "@/lib/pricing-anuncio";
import { precoPsicologico } from "@/lib/vixe/preco";
import type { AnaliseCompetitiva, ResultadoPrecificacao, ZonaMorta } from "@/lib/pricing";
import type { DiagnosticoPreco } from "@/lib/ia/prompts-preco";
import type { PrecificacaoHist } from "@/lib/precificacao-tipos";
import { pedirDiagnosticoPreco } from "@/app/(painel)/vixe/actions";

export type ObjetivoEstrategia = "margem" | "volume";

interface RespostaEstrategia {
  diagnostico: DiagnosticoPreco;
  doCache: boolean;
  rodape: string;
  /** Custo, imposto, objetivo e anúncio da consulta: se mudarem, a resposta fica velha. */
  chave: string;
  /** Preço consultado. Testar o preço sugerido não deixa a resposta velha. */
  preco: number;
}

/**
 * O que a Fase 8.8 acrescentou à Precificação Individual: anúncio pago (ROAS), foto própria
 * e a estratégia da Vixe sem sair da tela. Fica fora de `precificacao-estado.ts` para o hook
 * principal não crescer; ele chama este e espalha o retorno.
 */
export function useExtrasPrecificacao(ctx: {
  resultado: ResultadoPrecificacao;
  nomeProduto: string;
  canal: string | null;
  /** Fração. */
  comissaoPct: number;
  tarifa: number;
  /** Fração. */
  impostoPct: number;
  precoMinimoViavel: number | null;
  zonaMorta: ZonaMorta | null;
  analiseConcorrencia: AnaliseCompetitiva | null;
  qtdConcorrentes: number;
}) {
  const { resultado } = ctx;

  // Anúncio pago
  const [anuncioTipo, setAnuncioTipo] = useState<TipoInvestimentoAnuncio>("percentual");
  const [anuncioValor, setAnuncioValor] = useState<number | "">("");
  const [margemAlvoAnuncio, setMargemAlvoAnuncio] = useState<number>(10);
  const investimento = useMemo<InvestimentoAnuncio | null>(
    () => (anuncioValor !== "" && anuncioValor > 0 ? { tipo: anuncioTipo, valor: anuncioValor } : null),
    [anuncioTipo, anuncioValor],
  );
  const analiseAnuncio = useMemo(
    () => analisarAnuncio(resultado, { investimento, margemAlvoPct: margemAlvoAnuncio / 100 }),
    [resultado, investimento, margemAlvoAnuncio],
  );

  // Foto própria da precificação (sem ela, a imagem usa a do produto vinculado)
  const [imagemPropria, setImagemPropria] = useState<string | null>(null);

  // Estratégia da Vixe
  const [objetivo, setObjetivo] = useState<ObjetivoEstrategia>("margem");
  const [instrucao, setInstrucao] = useState("");
  const [estrategia, setEstrategia] = useState<RespostaEstrategia | null>(null);
  const [pedindoEstrategia, startEstrategia] = useTransition();
  // Sem a comissão: com faixas ela muda junto com o preço, e testar o sugerido trocaria a faixa.
  const chaveDe = (obj: ObjetivoEstrategia) => `${resultado.custoTotal.toFixed(2)}|${ctx.impostoPct}|${obj}|${anuncioTipo}:${anuncioValor}`;
  const precoAtual = Math.round(resultado.precoVenda * 100) / 100;
  const estrategiaVelha =
    !!estrategia &&
    (estrategia.chave !== chaveDe(objetivo) || (precoAtual !== estrategia.preco && precoAtual !== estrategia.diagnostico.precoSugerido));

  function pedirEstrategia(objetivoForcado?: ObjetivoEstrategia) {
    const obj = objetivoForcado ?? objetivo;
    if (objetivoForcado) setObjetivo(objetivoForcado);
    if (!ctx.nomeProduto.trim() || !resultado.viavel || resultado.precoVenda <= 0) {
      toast.error("Informe o produto e chegue a um preço viável antes de pedir a estratégia.");
      return;
    }
    const chave = chaveDe(obj);
    const c = ctx.analiseConcorrencia;
    startEstrategia(async () => {
      try {
        const res = await executar(
          pedirDiagnosticoPreco({
            produtoNome: ctx.nomeProduto.trim(),
            canal: ctx.canal,
            objetivo: obj,
            custo: resultado.custoTotal,
            preco: resultado.precoVenda,
            lucro: resultado.lucroLiquido,
            margemPct: resultado.margemEfetivaPct,
            comissaoPct: Math.round(ctx.comissaoPct * 10000) / 100,
            tarifa: ctx.tarifa,
            impostoPct: ctx.impostoPct,
            precoMinimoViavel: ctx.precoMinimoViavel,
            zonaMorta: ctx.zonaMorta,
            concorrencia:
              c && ctx.qtdConcorrentes > 0
                ? {
                    min: c.precoMinConcorrentes,
                    max: c.precoMaxConcorrentes,
                    media: c.precoMedioConcorrentes,
                    diferencaPct: c.diferencaPct,
                    quantidade: ctx.qtdConcorrentes,
                  }
                : null,
            precoPsicologico: precoPsicologico(resultado.precoVenda),
            instrucaoExtra: instrucao.trim() || null,
            anuncio:
              analiseAnuncio && analiseAnuncio.gastoPorVenda > 0
                ? {
                    gastoPorVenda: analiseAnuncio.gastoPorVenda,
                    roasEmpate: analiseAnuncio.roasEmpate,
                    roasAtual: analiseAnuncio.roasAtual,
                    lucroDepois: analiseAnuncio.lucroDepois,
                  }
                : null,
          }),
        );
        const rodape =
          res.origem === "propria" ? `Sua IA · ${res.provedorRotulo ?? ""}` : res.limite > 0 ? `${res.usadas}/${res.limite} do teste grátis` : "IA do sistema";
        setEstrategia({ diagnostico: res.diagnostico, doCache: res.doCache, rodape, chave, preco: precoAtual });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível falar com a Vixe agora.");
      }
    });
  }

  /** O que vai junto ao salvar (colunas da 0045). */
  function extrasParaSalvar() {
    return {
      anuncio: investimento ? { tipo: investimento.tipo, valor: investimento.valor, margem_alvo_pct: margemAlvoAnuncio / 100 } : null,
      estrategia: estrategia && !estrategiaVelha ? estrategia.diagnostico : null,
      imagem_url: imagemPropria,
    };
  }

  /** "Duplicar" do histórico: traz anúncio e foto de volta; a estratégia antiga não (os números mudam). */
  function carregarExtras(h: PrecificacaoHist) {
    setAnuncioTipo(h.anuncio?.tipo ?? "percentual");
    setAnuncioValor(h.anuncio ? h.anuncio.valor : "");
    setMargemAlvoAnuncio(h.anuncio?.margem_alvo_pct != null ? Math.round(h.anuncio.margem_alvo_pct * 1000) / 10 : 10);
    setImagemPropria(h.imagem_url ?? null);
    setEstrategia(null);
  }

  return {
    anuncioTipo,
    setAnuncioTipo,
    anuncioValor,
    setAnuncioValor,
    margemAlvoAnuncio,
    setMargemAlvoAnuncio,
    analiseAnuncio,
    imagemPropria,
    setImagemPropria,
    objetivoEstrategia: objetivo,
    setObjetivoEstrategia: setObjetivo,
    instrucaoEstrategia: instrucao,
    setInstrucaoEstrategia: setInstrucao,
    estrategia,
    estrategiaVelha,
    pedindoEstrategia,
    pedirEstrategia,
    extrasParaSalvar,
    carregarExtras,
  };
}

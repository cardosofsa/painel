"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { executar } from "@/lib/acao";
import { estaSujo } from "@/lib/saida";

export { lerId, lerLista, lerNumero, lerTexto } from "@/lib/rascunho-leitura";
import { descartarRascunhoPrecificacao, salvarRascunhoPrecificacao } from "@/app/(painel)/precificacao/actions";

export type VisaoRascunho = "individual" | "variacoes" | "kits" | "massa";

export interface RascunhoPendente {
  id: string;
  /** A aba dona (a lista da página traz as quatro juntas). */
  visao?: string;
  titulo: string;
  atualizado_em: string;
  dados: Record<string, unknown>;
}

/** Intervalo do salvamento automático: só grava se algo mudou desde a última gravação. */
const INTERVALO_MS = 5000;

/**
 * Rascunho da Precificação (0100): "Salvar rascunho", salvamento automático e o "sujo" que a
 * proteção de saída usa. A tela passa o instantâneo do estado; aqui só se decide quando gravar.
 * Sem a migração o salvamento automático para em silêncio (e o botão avisa uma vez).
 */
export function useRascunhoPrecificacao({
  visao = "individual",
  instantaneo,
  temConteudo,
  titulo,
  produtoId,
}: {
  /** A aba dona do rascunho (cada aba guarda o seu). */
  visao?: VisaoRascunho;
  instantaneo: Record<string, unknown>;
  temConteudo: boolean;
  titulo: string;
  produtoId: string | null;
}) {
  const [id, setId] = useState<string | null>(null);
  const [referencia, setReferencia] = useState<string | null>(null);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [semMigracao, setSemMigracao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const sujo = estaSujo(instantaneo, referencia, temConteudo);

  // O intervalo lê sempre o estado mais novo sem reiniciar a cada tecla.
  const atual = useRef({ visao, instantaneo, titulo, produtoId, id, sujo, semMigracao, salvando });
  useEffect(() => {
    atual.current = { visao, instantaneo, titulo, produtoId, id, sujo, semMigracao, salvando };
  });

  // Trava síncrona: o automático e o botão no mesmo instante criavam dois rascunhos (o `salvando`
  // do estado só chega ao ref depois do próximo render).
  const emAndamento = useRef(false);
  const salvar = useCallback(async (silencioso: boolean): Promise<boolean> => {
    const a = atual.current;
    if (emAndamento.current) return false;
    emAndamento.current = true;
    setSalvando(true);
    const json = JSON.stringify(a.instantaneo);
    try {
      const r = await executar(salvarRascunhoPrecificacao({ id: a.id, visao: a.visao, produto_id: a.produtoId, titulo: a.titulo.slice(0, 200), dados: a.instantaneo }));
      if (r.semMigracao) {
        setSemMigracao(true);
        if (!silencioso) toast.error("O rascunho precisa da migração 0100 no banco. Por enquanto ele não fica guardado.");
        return false;
      }
      setId(r.id);
      atual.current.id = r.id;
      setReferencia(json);
      setSalvoEm(r.salvoEm);
      if (!silencioso) toast.success("Rascunho salvo");
      return true;
    } catch (e) {
      if (!silencioso) toast.error(e instanceof Error ? e.message : "Não foi possível salvar o rascunho.");
      return false;
    } finally {
      emAndamento.current = false;
      setSalvando(false);
    }
  }, []);

  const salvarRascunho = useCallback(() => salvar(false), [salvar]);

  useEffect(() => {
    const t = window.setInterval(() => {
      const a = atual.current;
      if (a.sujo && !a.semMigracao && !a.salvando) void salvar(true);
    }, INTERVALO_MS);
    return () => window.clearInterval(t);
  }, [salvar]);

  return {
    rascunhoId: id,
    sujo,
    salvando,
    salvoEm,
    semMigracao,
    salvarRascunho,
    /** Continuar um rascunho guardado: ele vira o atual e a tela fica "limpa". */
    adotar: (r: RascunhoPendente) => {
      setId(r.id);
      setReferencia(null);
      setSalvoEm(r.atualizado_em);
    },
    /** Depois de aplicar o instantâneo adotado, marca esse estado como já salvo. */
    marcarLimpo: (json: string) => setReferencia(json),
    /** A precificação foi salva de verdade (o servidor já apagou o rascunho). */
    aoSalvarPrecificacao: () => {
      setId(null);
      setReferencia(JSON.stringify(atual.current.instantaneo));
      setSalvoEm(null);
    },
    /**
     * Para as abas cuja action de salvar não conhece o rascunho (Variações, Em Massa): apaga o
     * rascunho em uso depois que o trabalho foi salvo de verdade. Falha aqui não importa ao
     * dono (o pior caso é um "Continuar rascunho" a mais), então é silenciosa.
     */
    descartarAposSalvar: async () => {
      const idAtual = atual.current.id;
      setId(null);
      setReferencia(JSON.stringify(atual.current.instantaneo));
      setSalvoEm(null);
      if (idAtual) await descartarRascunhoPrecificacao(idAtual).catch(() => null);
    },
  };
}

/** "há 3 s", "há 2 min", "há 2 h". */
export function haQuanto(iso: string, agora = Date.now()): string {
  const s = Math.max(0, Math.round((agora - Date.parse(iso)) / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

/** Quem está sujo e como salvar: cada aba conta à tela, que protege a saída de todas juntas. */
export type RelatarRascunho = (visao: VisaoRascunho, sujo: boolean, salvar: (() => Promise<boolean>) | undefined) => void;

/**
 * Rascunho de uma aba (Variações, Kits, Em Massa): o salvamento automático, o aviso
 * "Continuar rascunho" e o relato para a proteção de saída da tela.
 */
export function useRascunhoDaAba({
  visao,
  instantaneo,
  temConteudo,
  titulo,
  produtoId = null,
  pendenteInicial,
  aplicar,
  relatar,
  confirm,
}: {
  visao: VisaoRascunho;
  instantaneo: Record<string, unknown>;
  temConteudo: boolean;
  titulo: string;
  produtoId?: string | null;
  pendenteInicial: RascunhoPendente | null;
  /** Põe os dados do rascunho na tela. */
  aplicar: (dados: Record<string, unknown>) => void;
  relatar?: RelatarRascunho;
  confirm: (o: { title: string; message: string; confirmLabel?: string }) => Promise<boolean>;
}) {
  const rasc = useRascunhoPrecificacao({ visao, instantaneo, temConteudo, titulo, produtoId });
  const [pendente, setPendente] = useState<RascunhoPendente | null>(pendenteInicial);
  const { sujo, semMigracao, salvarRascunho } = rasc;

  useEffect(() => {
    relatar?.(visao, sujo, semMigracao ? undefined : salvarRascunho);
  }, [relatar, visao, sujo, semMigracao, salvarRascunho]);

  function continuar() {
    if (!pendente) return;
    aplicar(pendente.dados);
    rasc.adotar(pendente);
    setPendente(null);
  }

  async function descartar() {
    if (!pendente) return;
    const ok = await confirm({ title: "Descartar o rascunho?", message: `“${pendente.titulo || "Sem nome"}” será apagado. Não dá para desfazer.`, confirmLabel: "Descartar" });
    if (!ok) return;
    try {
      await executar(descartarRascunhoPrecificacao(pendente.id));
      setPendente(null);
      toast.success("Rascunho descartado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível descartar.");
    }
  }

  return { rasc, pendente, continuar, descartar };
}

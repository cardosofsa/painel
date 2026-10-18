"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { executar } from "@/lib/acao";
import { estaSujo } from "@/lib/saida";
import { salvarRascunhoPrecificacao } from "@/app/(painel)/precificacao/actions";

export interface RascunhoPendente {
  id: string;
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
  instantaneo,
  temConteudo,
  titulo,
  produtoId,
}: {
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
  const atual = useRef({ instantaneo, titulo, produtoId, id, sujo, semMigracao, salvando });
  useEffect(() => {
    atual.current = { instantaneo, titulo, produtoId, id, sujo, semMigracao, salvando };
  });

  const salvar = useCallback(async (silencioso: boolean): Promise<boolean> => {
    const a = atual.current;
    if (a.salvando) return false;
    setSalvando(true);
    const json = JSON.stringify(a.instantaneo);
    try {
      const r = await executar(salvarRascunhoPrecificacao({ id: a.id, visao: "individual", produto_id: a.produtoId, titulo: a.titulo.slice(0, 200), dados: a.instantaneo }));
      if (r.semMigracao) {
        setSemMigracao(true);
        if (!silencioso) toast.error("O rascunho precisa da migração 0100 no banco. Por enquanto ele não fica guardado.");
        return false;
      }
      setId(r.id);
      setReferencia(json);
      setSalvoEm(r.salvoEm);
      if (!silencioso) toast.success("Rascunho salvo");
      return true;
    } catch (e) {
      if (!silencioso) toast.error(e instanceof Error ? e.message : "Não foi possível salvar o rascunho.");
      return false;
    } finally {
      setSalvando(false);
    }
  }, []);

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
    salvarRascunho: () => salvar(false),
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

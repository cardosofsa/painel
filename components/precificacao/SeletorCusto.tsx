"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Receipt, Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { Modal, inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import { custoDaQuantidade, unidadeCusto, type CustoAvulso } from "@/lib/custos-avulsos";
import { listarCustosAvulsos } from "@/app/(painel)/produtos/custos/actions";

/**
 * Botão "Custo" (cor própria, ao lado do rótulo Produto): abre o pop-up com os custos
 * registrados em Produtos › Registrar custo, que não são produto cadastrado.
 */
export function BotaoCusto({ onClick, rotulo = "Custo", compacto = false }: { onClick: () => void; rotulo?: string; /** Ao lado de um rótulo de campo: não aumenta a altura da linha. */ compacto?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full bg-marca-sol font-semibold text-marca-fundo shadow-elev-1 hover:brightness-95 transition-[filter] duration-[--duracao-rapida] ${compacto ? "-my-1 h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs"}`}
    >
      <Receipt size={12} aria-hidden /> {rotulo}
    </button>
  );
}

export interface CustoEscolhido {
  custo: CustoAvulso;
  /** Na unidade do custo (0,1 = 100 g de um custo por kg). Sempre 1 sem `comQuantidade`. */
  quantidade: number;
}

/**
 * Pop-up com busca e a lista dos custos ativos. `multiplo` (Kits) marca vários e adiciona
 * todos; sem ele (Individual, Variações) escolhe um. `comQuantidade` pede quanto do item vai
 * e mostra o custo dessa quantidade antes de usar.
 */
export function SeletorCusto({ multiplo = false, comQuantidade = false, onFechar, onEscolher }: { multiplo?: boolean; comQuantidade?: boolean; onFechar: () => void; onEscolher: (itens: CustoEscolhido[]) => void }) {
  const [custos, setCustos] = useState<CustoAvulso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [quantidade, setQuantidade] = useState(1);

  useEffect(() => {
    let vivo = true;
    void executarComToast(listarCustosAvulsos(), { erro: "Não foi possível carregar os custos." }).then((r) => {
      if (!vivo) return;
      if (r.ok) setCustos(r.dado);
      else setErro(r.erro);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const termo = busca.trim().toLowerCase();
  const filtrados = useMemo(() => (custos ?? []).filter((c) => !termo || c.nome.toLowerCase().includes(termo) || (c.grupo ?? "").toLowerCase().includes(termo)), [custos, termo]);
  const escolhido = !multiplo && marcados.size === 1 ? (custos ?? []).find((c) => marcados.has(c.id)) ?? null : null;

  function alternar(id: string) {
    setMarcados((atual) => {
      if (!multiplo) return atual.has(id) ? new Set() : new Set([id]);
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function usar() {
    const itens = (custos ?? []).filter((c) => marcados.has(c.id)).map((custo) => ({ custo, quantidade: comQuantidade ? quantidade : 1 }));
    if (itens.length) onEscolher(itens);
  }

  return (
    <Modal open onClose={onFechar} title={multiplo ? "Adicionar custos ao kit" : "Usar um custo registrado"} width="max-w-lg">
      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Buscar custo</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden />
          <input className={`${inputClass} pl-8`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pelo nome ou grupo…" autoFocus />
        </label>

        {erro ? (
          <p role="alert" className="text-sm text-negative">
            {erro}
          </p>
        ) : custos === null ? (
          <p className="text-sm text-text-secondary" role="status">
            Carregando…
          </p>
        ) : custos.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Nenhum custo registrado ainda.{" "}
            <Link href="/produtos/custos" className="text-accent underline">
              Registrar custo
            </Link>
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto rounded-md border border-border divide-y divide-border" role={multiplo ? "group" : "radiogroup"} aria-label="Custos registrados">
            {filtrados.length === 0 && (
              <li role="none" className="px-3 py-2 text-sm text-text-secondary">
                Nada encontrado.
              </li>
            )}
            {filtrados.map((c) => {
              const marcado = marcados.has(c.id);
              return (
                <li key={c.id} role="none">
                  <button
                    type="button"
                    role={multiplo ? "checkbox" : "radio"}
                    aria-checked={marcado}
                    onClick={() => alternar(c.id)}
                    onDoubleClick={() => {
                      if (!multiplo && !comQuantidade) onEscolher([{ custo: c, quantidade: 1 }]);
                    }}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors duration-[--duracao-rapida] ${marcado ? "bg-accent-soft" : "hover:bg-surface-2"}`}
                  >
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${marcado ? "border-accent bg-accent text-accent-on" : "border-border-forte"}`} aria-hidden>
                      {marcado && <Check size={12} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-primary">{c.nome}</span>
                      {(c.grupo || c.observacao) && <span className="block truncate text-xs text-text-tertiary">{[c.grupo, c.observacao].filter(Boolean).join(" · ")}</span>}
                    </span>
                    <span className="shrink-0 font-mono text-sm text-text-primary">
                      {formatBRL(c.custo)}
                      <span className="text-xs text-text-tertiary">/{unidadeCusto(c.unidade).curto}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {comQuantidade && escolhido && (
          <div className="flex flex-wrap items-end gap-3 rounded-md bg-surface-2 p-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-text-secondary">Quanto vai ({unidadeCusto(escolhido.unidade).curto})</span>
              <CampoNumero value={quantidade} onChange={setQuantidade} min={0.001} casas={3} className={`${inputClass} w-32 text-right`} aria-label={`Quantidade em ${unidadeCusto(escolhido.unidade).curto}`} />
            </label>
            <p className="pb-2 text-sm text-text-primary">
              = <span className="font-mono font-semibold">{formatBRL(custoDaQuantidade(escolhido.custo, quantidade))}</span>
              {escolhido.unidade === "kg" && <span className="text-xs text-text-tertiary"> (0,1 = 100 g)</span>}
              {escolhido.unidade === "l" && <span className="text-xs text-text-tertiary"> (0,5 = 500 ml)</span>}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <Link href="/produtos/custos" className="text-xs text-accent hover:underline">
            Gerenciar custos
          </Link>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onFechar}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={usar} disabled={marcados.size === 0 || (comQuantidade && quantidade <= 0)}>
              {multiplo ? `Adicionar ${marcados.size || ""}`.trim() : "Usar"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

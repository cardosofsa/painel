"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { Button } from "@/components/ui/Button";
import { IconeMarca } from "@/components/ui/IconeMarca";
import type { LojaIn } from "@/lib/pedidos-central";

/**
 * "Canais de venda": todos, ou canal e loja(s) marcados. Valores: "pdv", "catalogo" e
 * "loja:<id>". Marcar o canal marca todas as lojas dele.
 */
export function FiltroCanais({ valor, onChange, lojas, catalogos = [] }: { valor: string[]; onChange: (v: string[]) => void; lojas: LojaIn[]; catalogos?: string[] }) {
  const porCanal = new Map<string, LojaIn[]>();
  for (const l of lojas) porCanal.set(l.canalNome || "Outros", [...(porCanal.get(l.canalNome || "Outros") ?? []), l]);
  const rotulo =
    valor.length === 0
      ? "Todos os canais"
      : valor.length === 1
        ? valor[0] === "pdv"
          ? "PDV"
          : valor[0] === "catalogo"
            ? "Catálogo"
            : valor[0].startsWith("catalogo:")
              ? valor[0].slice("catalogo:".length)
            : (lojas.find((l) => `loja:${l.id}` === valor[0])?.nome ?? "1 loja")
        : `${valor.length} selecionados`;

  return (
    <Popover
      ativo={valor.length > 0}
      largura="w-72"
      rotulo={
        <>
          {rotulo} <ChevronDown size={13} />
        </>
      }
    >
      {(fechar) => <Painel inicial={valor} porCanal={porCanal} catalogos={catalogos} onAplicar={(v) => (onChange(v), fechar())} />}
    </Popover>
  );
}

function Painel({ inicial, porCanal, catalogos, onAplicar }: { inicial: string[]; porCanal: Map<string, LojaIn[]>; catalogos: string[]; onAplicar: (v: string[]) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set(inicial));
  const alternar = (k: string, on: boolean) =>
    setSel((s) => {
      const n = new Set(s);
      if (on) n.add(k);
      else n.delete(k);
      return n;
    });

  return (
    <div>
      <div className="max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain space-y-2 pr-1">
        <Item rotulo="PDV (balcão)" marcado={sel.has("pdv")} onChange={(v) => alternar("pdv", v)} />
        <Item rotulo="Catálogo (todos)" marcado={sel.has("catalogo")} onChange={(v) => alternar("catalogo", v)} />
        {catalogos.length > 1 && (
          <div className="pl-6 space-y-0.5">
            {catalogos.map((c) => (
              <Item key={c} rotulo={c} marcado={sel.has(`catalogo:${c}`)} onChange={(v) => alternar(`catalogo:${c}`, v)} />
            ))}
          </div>
        )}
        {[...porCanal.entries()].map(([canal, ls]) => {
          const todas = ls.every((l) => sel.has(`loja:${l.id}`));
          return (
            <div key={canal} className="pt-1 border-t border-border">
              <label className="flex items-center gap-2 py-1 text-sm font-medium text-text-primary cursor-pointer">
                <input
                  type="checkbox"
                  checked={todas}
                  onChange={(e) =>
                    setSel((s) => {
                      const n = new Set(s);
                      for (const l of ls) {
                        if (e.target.checked) n.add(`loja:${l.id}`);
                        else n.delete(`loja:${l.id}`);
                      }
                      return n;
                    })
                  }
                />
                <IconeMarca nome={canal} tamanho={16} /> {canal}
              </label>
              <div className="pl-6 space-y-0.5">
                {ls.map((l) => (
                  <Item key={l.id} rotulo={l.nome} marcado={sel.has(`loja:${l.id}`)} onChange={(v) => alternar(`loja:${l.id}`, v)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between gap-2 mt-3 pt-3 border-t border-border">
        <Button size="sm" variant="ghost" onClick={() => onAplicar([])}>
          Todos
        </Button>
        <Button size="sm" variant="primary" onClick={() => onAplicar([...sel])}>
          Aplicar
        </Button>
      </div>
    </div>
  );
}

function Item({ rotulo, marcado, onChange }: { rotulo: string; marcado: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-0.5 text-sm text-text-secondary cursor-pointer hover:text-text-primary">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} />
      <span className="truncate">{rotulo}</span>
    </label>
  );
}

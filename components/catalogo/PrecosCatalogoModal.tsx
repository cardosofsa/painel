"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal, campoBase } from "@/components/ui/Modal";
import { formatBRL } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import { useFormularioSujo } from "@/lib/hooks/useFormularioSujo";
import { listarPrecosCatalogo, salvarPrecosCatalogo, type ProdutoPrecoCatalogo } from "@/app/(painel)/catalogo/actions";

interface CatalogoBasico {
  id: string;
  nome: string;
  tipo_preco: "varejo" | "atacado";
}

/** Texto digitado → número ≥ 0, ou null se vazio/inválido. */
function paraNumero(texto: string | undefined): number | null {
  if (texto === undefined || texto.trim() === "") return null;
  const n = Number(texto.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Preços de um catálogo. Regra, em uma frase: **vazio = usa o preço base do tipo do
 * catálogo; 0 = "Consultar"** (o produto aparece, mas o cliente pergunta pelo WhatsApp).
 * Produto de atacado sem preço de atacado também cai em "Consultar".
 */
export function PrecosCatalogoModal({ catalogo, onClose }: { catalogo: CatalogoBasico | null; onClose: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [itens, setItens] = useState<ProdutoPrecoCatalogo[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [originais, setOriginais] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [percentual, setPercentual] = useState("");
  const sujo = useFormularioSujo(overrides, originais);

  useEffect(() => {
    if (!catalogo) return;
    // O toast de erro sai de dentro de `executarComToast`, com a mensagem traduzida que o
    // servidor devolveu (por exemplo, conta suspensa).
    executarComToast(listarPrecosCatalogo(catalogo.id), { erro: "Erro ao carregar produtos" })
      .then((r) => {
        if (!r.ok) return;
        setItens(r.dado);
        const carregados = Object.fromEntries(
          r.dado.filter((d) => d.preco_override !== null).map((d) => [d.produto_id, String(d.preco_override)]),
        );
        setOverrides(carregados);
        setOriginais(carregados);
      })
      .finally(() => setCarregando(false));
  }, [catalogo]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return termo ? itens.filter((i) => i.produto_nome.toLowerCase().includes(termo)) : itens;
  }, [itens, busca]);

  function aplicarPercentual() {
    const pct = paraNumero(percentual.replace("-", ""));
    if (pct === null) return;
    const sinal = percentual.trim().startsWith("-") ? -1 : 1;
    setOverrides((prev) => {
      const novo = { ...prev };
      for (const item of visiveis) {
        if (!item.preco_base) continue;
        novo[item.produto_id] = (Math.round(item.preco_base * (1 + (sinal * pct) / 100) * 100) / 100).toFixed(2);
      }
      return novo;
    });
  }

  function limparVisiveis() {
    setOverrides((prev) => {
      const novo = { ...prev };
      for (const item of visiveis) delete novo[item.produto_id];
      return novo;
    });
  }

  async function salvar() {
    if (!catalogo) return;
    setSalvando(true);
    const payload = itens.map((item) => ({ produto_id: item.produto_id, preco: paraNumero(overrides[item.produto_id]) }));
    const r = await executarComToast(salvarPrecosCatalogo(catalogo.id, payload), {
      sucesso: "Preços salvos",
      erro: "Erro ao salvar preços",
    });
    setSalvando(false);
    if (r.ok) onClose();
  }

  const rotuloBase = catalogo?.tipo_preco === "atacado" ? "Atacado" : "Varejo";

  return (
    <Modal
      open={!!catalogo}
      onClose={onClose}
      title={catalogo ? `Preços — ${catalogo.nome}` : ""}
      width="max-w-2xl"
      sujo={sujo}
    >
      <div className="text-sm text-text-secondary mb-3 space-y-1">
        <p>
          Este catálogo usa o preço de <strong className="text-text-primary">{rotuloBase.toLowerCase()}</strong> de cada produto.
          Digite um valor só para ajustar um produto aqui.
        </p>
        <p className="text-xs text-text-tertiary">
          Campo vazio = usa o preço de {rotuloBase.toLowerCase()} · <strong>0</strong> = aparece como “Consultar” (sem venda
          pelo carrinho).
        </p>
      </div>

      {carregando ? (
        <p className="text-sm text-text-tertiary py-6 text-center">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="text-sm text-text-tertiary py-6 text-center">Nenhum produto ativo com estoque no momento.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar produto…"
                aria-label="Buscar produto"
                className={`${campoBase} w-full pl-9`}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <input
                value={percentual}
                onChange={(e) => setPercentual(e.target.value)}
                inputMode="decimal"
                placeholder="% (ex: 10 ou -5)"
                aria-label="Ajuste em percentual"
                className={`${campoBase} w-36`}
              />
              <Button variant="secondary" size="sm" onClick={aplicarPercentual} disabled={paraNumero(percentual.replace("-", "")) === null}>
                Aplicar
              </Button>
              <Button variant="ghost" size="sm" onClick={limparVisiveis}>
                Limpar
              </Button>
            </div>
          </div>

          <div className="border border-border rounded-md divide-y divide-border max-h-96 overflow-y-auto mb-4">
            <div className="grid grid-cols-[1fr_7rem_7rem] gap-3 px-3 py-2 text-[11px] uppercase tracking-wide text-text-tertiary bg-surface-2 sticky top-0">
              <span>Produto</span>
              <span className="text-right">{rotuloBase}</span>
              <span className="text-right">Neste catálogo</span>
            </div>
            {visiveis.map((item) => {
              const valor = overrides[item.produto_id] ?? "";
              const efetivo = paraNumero(valor) ?? item.preco_base;
              const consultar = !efetivo;
              return (
                <div key={item.produto_id} className="grid grid-cols-[1fr_7rem_7rem] items-center gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-text-primary truncate">{item.produto_nome}</div>
                    {consultar && <div className="text-[11px] text-text-tertiary">Vai aparecer como “Consultar”</div>}
                  </div>
                  <div className="text-right font-mono text-sm text-text-secondary">
                    {item.preco_base ? formatBRL(item.preco_base) : <span className="font-sans text-xs">A consultar</span>}
                  </div>
                  <input
                    inputMode="decimal"
                    placeholder={item.preco_base ? item.preco_base.toFixed(2) : "—"}
                    aria-label={`Preço de ${item.produto_nome} neste catálogo`}
                    className={`${campoBase} w-full text-right`}
                    value={valor}
                    onChange={(e) => setOverrides((prev) => ({ ...prev, [item.produto_id]: e.target.value }))}
                  />
                </div>
              );
            })}
            {visiveis.length === 0 && <p className="text-sm text-text-tertiary text-center py-6">Nenhum produto encontrado.</p>}
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando} disabled={carregando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

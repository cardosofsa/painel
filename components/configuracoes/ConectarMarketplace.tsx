"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { IconeMarca } from "@/components/ui/IconeMarca";
import { executarComToast } from "@/lib/acao-cliente";
import { marcaDoNome } from "@/lib/marcas";
import { PLATAFORMAS, type Plataforma } from "@/lib/marketplace/plataformas";
import { prepararLojaMarketplace } from "@/app/(painel)/configuracoes/marketplace-actions";
import type { Canal, Loja } from "@/app/(painel)/configuracoes/ConfiguracoesClient";

type Passo = "plataforma" | "canal" | "loja";

/**
 * Assistente "Conectar marketplace": plataforma → canal (existente ou novo, com as faixas
 * padrão) → loja (existente ou nova) → autorização na plataforma (OAuth). Volta para
 * Canais de venda com a loja conectada.
 */
export function ConectarMarketplace({
  onClose,
  canais,
  lojas,
  faltando: faltandoPorPlataforma,
}: {
  onClose: () => void;
  canais: Canal[];
  lojas: Loja[];
  /** Variáveis da API que faltam no servidor, por plataforma (só nomes). */
  faltando: Record<string, string[]>;
}) {
  const [pending, startTransition] = useTransition();
  const [passo, setPasso] = useState<Passo>("plataforma");
  const [plataforma, setPlataforma] = useState<Plataforma | null>(null);
  const [canalId, setCanalId] = useState<string | "novo">("novo");
  const [lojaId, setLojaId] = useState<string | "nova">("nova");
  const [nomeLoja, setNomeLoja] = useState("");

  const faltando = faltandoPorPlataforma[plataforma?.id ?? "shopee"] ?? [];
  const canaisDaPlataforma = plataforma ? canais.filter((c) => marcaDoNome(c.nome) === plataforma.id) : [];
  const lojasDoCanal = canalId === "novo" ? [] : lojas.filter((l) => l.canal_id === canalId);

  function escolherPlataforma(p: Plataforma) {
    setPlataforma(p);
    const existentes = canais.filter((c) => marcaDoNome(c.nome) === p.id);
    setCanalId(existentes[0]?.id ?? "novo");
    setLojaId("nova");
    setPasso("canal");
  }

  function conectar() {
    if (!plataforma) return;
    startTransition(async () => {
      const r = await executarComToast(
        prepararLojaMarketplace({
          plataforma: plataforma.id,
          canal_id: canalId === "novo" ? null : canalId,
          loja_id: lojaId === "nova" ? null : lojaId,
          nome_loja: lojaId === "nova" ? nomeLoja.trim() : null,
        }),
        { erro: "Erro ao preparar a loja" },
      );
      // Segue para a autorização na plataforma; ela volta para Configurações.
      // Navegação completa: é rota de API que redireciona para fora (até a Shopee), não página.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      if (r.ok) window.location.assign(`${window.location.origin}/api/${plataforma.id === "mercadolivre" ? "mercadolivre" : "shopee"}/conectar?loja=${r.dado.lojaId}&volta=configuracoes`);
    });
  }

  return (
    <Modal open onClose={onClose} title="Conectar marketplace" width="max-w-lg">
      {passo !== "plataforma" && (
        <button type="button" className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary mb-3" onClick={() => setPasso(passo === "loja" ? "canal" : "plataforma")}>
          <ArrowLeft size={13} /> Voltar
        </button>
      )}

      {passo === "plataforma" && (
        <>
          <p className="text-sm text-text-secondary mb-3">Escolha a plataforma. Os pedidos dela passam a entrar sozinhos em Vendas, com a margem real de cada um.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PLATAFORMAS.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!p.disponivel}
                onClick={() => escolherPlataforma(p)}
                className="relative flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-sm hover:border-accent hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-transparent"
              >
                <IconeMarca marca={p.id} tamanho={32} />
                <span className="font-medium text-text-primary">{p.nome}</span>
                {!p.disponivel && <span className="text-xs text-text-tertiary">em breve</span>}
              </button>
            ))}
          </div>
          {faltandoPorPlataforma.shopee?.length > 0 && faltandoPorPlataforma.mercadolivre?.length > 0 && (
            <p className="text-xs text-negative mt-3">
              As APIs estão desligadas neste servidor (falta: <span className="font-mono">{[...new Set([...faltandoPorPlataforma.shopee, ...faltandoPorPlataforma.mercadolivre])].join(", ")}</span>). Dá para preparar o canal e a loja agora, mas a conexão só funciona depois de configurar e fazer o Redeploy.
            </p>
          )}
        </>
      )}

      {passo === "canal" && plataforma && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <IconeMarca marca={plataforma.id} tamanho={22} />
            <span className="font-medium text-text-primary">{plataforma.nome}: em qual canal de venda?</span>
          </div>
          <div className="space-y-2">
            {canaisDaPlataforma.map((c) => (
              <Opcao key={c.id} ativa={canalId === c.id} onClick={() => setCanalId(c.id)} titulo={c.nome} detalhe={`${lojas.filter((l) => l.canal_id === c.id).length} loja(s) · taxas atuais mantidas`} />
            ))}
            <Opcao ativa={canalId === "novo"} onClick={() => setCanalId("novo")} titulo={`Criar canal "${plataforma.canal.nome}"`} detalhe={plataforma.faixas.length ? `Com as ${plataforma.faixas.length} faixas de comissão atuais (editáveis depois)` : "Taxas editáveis depois"} />
          </div>
          <Button variant="primary" className="w-full mt-4" onClick={() => setPasso("loja")}>
            Continuar
          </Button>
        </>
      )}

      {passo === "loja" && plataforma && (
        <>
          <p className="font-medium text-text-primary mb-3">Qual loja vai conectar?</p>
          <div className="space-y-2">
            {lojasDoCanal.map((l) => (
              <Opcao key={l.id} ativa={lojaId === l.id} onClick={() => setLojaId(l.id)} titulo={l.nome} detalhe="Loja já cadastrada" />
            ))}
            <Opcao ativa={lojaId === "nova"} onClick={() => setLojaId("nova")} titulo="Nova loja" detalhe="Cadastra a loja e já conecta" />
          </div>
          {lojaId === "nova" && (
            <FormField label="Nome da loja" dica="Como você reconhece a loja (ex.: o nome dela na plataforma).">
              <input className={inputClass} maxLength={120} value={nomeLoja} onChange={(e) => setNomeLoja(e.target.value)} placeholder="Ex: cardosoeshop" autoFocus />
            </FormField>
          )}
          <p className="text-xs text-text-tertiary mt-3">
            Ao continuar, você entra com o login DESTA loja na {plataforma.nome} e autoriza o Sertão a ler pedidos e atualizar estoque. Depois volta para cá.
          </p>
          {faltando.length > 0 && (
            <p className="text-xs text-negative mt-2">
              A API da {plataforma.nome} está desligada neste servidor (falta: <span className="font-mono">{faltando.join(", ")}</span>). A loja fica pronta, e a conexão funciona depois de configurar e fazer o Redeploy.
            </p>
          )}
          <Button variant="primary" className="w-full mt-3" loading={pending} disabled={lojaId === "nova" && nomeLoja.trim().length < 2} onClick={conectar}>
            Conectar com a {plataforma.nome}
          </Button>
        </>
      )}
    </Modal>
  );
}

function Opcao({ ativa, onClick, titulo, detalhe }: { ativa: boolean; onClick: () => void; titulo: string; detalhe: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left ${ativa ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"}`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text-primary truncate">{titulo}</span>
        <span className="block text-xs text-text-tertiary">{detalhe}</span>
      </span>
      {ativa && <Check size={16} className="text-accent shrink-0" />}
    </button>
  );
}

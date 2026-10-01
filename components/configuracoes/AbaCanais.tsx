"use client";

import { useState, useTransition } from "react";
import { Store } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { RowMenu } from "@/components/ui/RowMenu";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { IconeMarca } from "@/components/ui/IconeMarca";
import { formatBRL } from "@/lib/format";
import { executarComToast } from "@/lib/acao-cliente";
import {
  criarLoja,
  atualizarLoja,
  removerLoja,
  atualizarFaixasCanal,
  atualizarLimitesCanal,
  criarCanal,
  removerCanal,
  restaurarCanaisPadrao,
  type LojaInput,
  type FaixaComissaoInput,
  type CanalInput,
  type LimitesCanalInput,
} from "@/app/(painel)/configuracoes/actions";
import { ICONES_CANAL, type Canal, type Loja } from "@/app/(painel)/configuracoes/ConfiguracoesClient";
import { FaixasModal, CanalModal, LojaModal, LimitesTextoModal } from "@/components/configuracoes/ModaisCanal";

function textoLimites(c: Canal): string {
  const t = c.limite_titulo != null ? `título até ${c.limite_titulo}` : "título sem limite próprio";
  const d =
    c.limite_descricao != null ? `descrição até ${c.limite_descricao.toLocaleString("pt-BR")}` : "descrição sem limite próprio";
  return `Textos da IA: ${t} · ${d}`;
}

/**
 * Aba "Canais de Venda": canais, lojas, faixas de comissão e limites de texto. Saiu de
 * `ConfiguracoesClient` (582 linhas) com o próprio estado e os próprios modais.
 */
export function AbaCanais({ canais, lojas }: { canais: Canal[]; lojas: Loja[] }) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [modalLoja, setModalLoja] = useState<{ loja: Loja | null; canal: Canal } | null>(null);
  const [modalFaixas, setModalFaixas] = useState<Canal | null>(null);
  const [modalLimites, setModalLimites] = useState<Canal | null>(null);
  const [modalCanal, setModalCanal] = useState(false);

  function salvarLojaHandler(dados: LojaInput) {
    startTransition(async () => {
      const r = modalLoja?.loja
        ? await executarComToast(atualizarLoja(modalLoja.loja.id, dados), {
            sucesso: "Loja atualizada",
            erro: "Erro ao salvar loja",
          })
        : await executarComToast(criarLoja(dados), { sucesso: "Loja adicionada", erro: "Erro ao salvar loja" });
      if (r.ok) setModalLoja(null);
    });
  }

  async function removerLojaHandler(l: Loja) {
    const ok = await confirm({ title: "Remover loja?", message: `"${l.nome}" será removida definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerLoja(l.id), { sucesso: "Loja removida", erro: "Erro ao remover loja" });
    });
  }

  function salvarFaixasHandler(canalId: string, faixas: FaixaComissaoInput[]) {
    startTransition(async () => {
      const r = await executarComToast(atualizarFaixasCanal(canalId, faixas), { sucesso: "Faixas de comissão atualizadas", erro: "Erro ao salvar faixas" });
      if (r.ok) {
        setModalFaixas(null);
      }
    });
  }

  function salvarCanalHandler(dados: CanalInput) {
    startTransition(async () => {
      const r = await executarComToast(criarCanal(dados), { sucesso: "Canal adicionado", erro: "Erro ao adicionar canal" });
      if (r.ok) {
        setModalCanal(false);
      }
    });
  }

  async function removerCanalHandler(c: Canal) {
    const lojasDoCanal = lojas.filter((l) => l.canal_id === c.id);
    const trechoLojas =
      lojasDoCanal.length > 0
        ? ` junto com ${lojasDoCanal.length === 1 ? "a loja" : `as ${lojasDoCanal.length} lojas`} dele e as faixas de comissão cadastradas`
        : " junto com as faixas de comissão cadastradas";
    const ok = await confirm({
      title: "Remover canal?",
      message:
        `"${c.nome}" será removido${trechoLojas}. ` +
        "Precificações e anúncios já salvos são preservados, mas ficam sem loja vinculada.",
    });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerCanal(c.id), { sucesso: "Canal removido", erro: "Erro ao remover canal" });
    });
  }

  async function restaurarCanaisPadraoHandler() {
    const ok = await confirm({
      title: "Restaurar canais padrão?",
      message:
        "Shopee, Mercado Livre, Loja Física e Facebook serão recriados apenas se estiverem faltando — nada existente é alterado. " +
        "As faixas de comissão da Shopee não são restauradas: você precisa cadastrá-las de novo em Editar Faixas de Comissão.",
      confirmLabel: "Restaurar",
    });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(restaurarCanaisPadrao(), { sucesso: "Canais padrão restaurados", erro: "Erro ao restaurar canais" });
    });
  }

  function salvarLimitesHandler(canalId: string, dados: LimitesCanalInput) {
    startTransition(async () => {
      const r = await executarComToast(atualizarLimitesCanal(canalId, dados), {
        sucesso: "Limites de texto atualizados",
        erro: "Erro ao salvar limites",
      });
      if (r.ok) setModalLimites(null);
    });
  }

  return (
    <>
      <div className="space-y-4">
        {canais.map((c) => {
          const Icone = ICONES_CANAL[c.icone] ?? Store;
          const lojasDoCanal = lojas.filter((l) => l.canal_id === c.id);
          return (
            <Card key={c.id}>
              {/* `flex-wrap` + `min-w-0`: sem os dois, os dois links e o RowMenu eram
                  empurrados para fora da tela no celular e a página inteira ganhava
                  rolagem horizontal — o único vazamento que sobrou nas 8 telas. */}
              <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <IconeMarca
                    nome={c.nome}
                    tamanho={36}
                    fallback={
                      <div className="w-9 h-9 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.cor}1a`, color: c.cor }}>
                        <Icone size={18} />
                      </div>
                    }
                  />
                  <div className="min-w-0">
                    <div className="font-medium text-text-primary text-sm">{c.nome}</div>
                    {c.tipo_taxa === "faixas" && (
                      <div className="text-xs text-text-tertiary">Comissão por faixa de preço (tabela editável)</div>
                    )}
                    <div className="text-xs text-text-tertiary">{textoLimites(c)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => setModalLimites(c)} className="text-sm text-accent hover:underline">
                    Limites de texto
                  </button>
                  {c.tipo_taxa === "faixas" && (
                    <button onClick={() => setModalFaixas(c)} className="text-sm text-accent hover:underline">
                      Editar Faixas
                    </button>
                  )}
                  <button onClick={() => setModalLoja({ loja: null, canal: c })} className="text-sm text-accent hover:underline">
                    + Adicionar Loja
                  </button>
                  <RowMenu actions={[{ label: "Remover canal", onClick: () => removerCanalHandler(c), destructive: true }]} />
                </div>
              </div>
              <div className="space-y-2">
                {lojasDoCanal.map((l) => {
                  const comissaoEfetiva = l.comissao_pct ?? c.comissao_pct_padrao;
                  const taxaFixaEfetiva = l.taxa_fixa ?? c.taxa_fixa_padrao;
                  return (
                    <div key={l.id} className="flex items-center justify-between border border-border rounded-md p-3">
                      <div className="flex items-center gap-3">
                        {l.logo_url ? (
                          <ImagemStorage src={l.logo_url} alt={l.nome} className="w-8 h-8 rounded-md object-cover border border-border" />
                        ) : (
                          <IconeMarca
                            nome={c.nome}
                            tamanho={32}
                            fallback={
                              <div className="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${c.cor}1a`, color: c.cor }}>
                                <Icone size={14} />
                              </div>
                            }
                          />
                        )}
                        <div>
                          <div className="text-sm font-medium text-text-primary">
                            {l.nome}
                            {l.link && (
                              <a
                                href={l.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-accent hover:underline ml-2"
                              >
                                visitar
                              </a>
                            )}
                          </div>
                          <div className="text-xs text-text-tertiary">
                            {c.tipo_taxa === "faixas"
                              ? `Faixas automáticas (${c.faixas.length} cadastradas)`
                              : `Comissão: ${comissaoEfetiva}% · Taxa fixa: ${formatBRL(taxaFixaEfetiva)}`}
                            {l.taxa_extra_valor != null && l.taxa_extra_tipo && (
                              <>
                                {" · Extra: "}
                                {l.taxa_extra_tipo === "percentual" ? `${l.taxa_extra_valor}%` : formatBRL(l.taxa_extra_valor)}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <RowMenu
                        actions={[
                          { label: "Editar", onClick: () => setModalLoja({ loja: l, canal: c }) },
                          { label: "Remover", onClick: () => removerLojaHandler(l), destructive: true },
                        ]}
                      />
                    </div>
                  );
                })}
                {lojasDoCanal.length === 0 && (
                  <p className="text-sm text-text-tertiary">Nenhuma loja cadastrada neste canal ainda.</p>
                )}
              </div>
            </Card>
          );
        })}
        <Card className="border-dashed">
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => setModalCanal(true)} className="text-sm text-accent hover:underline">
              + Adicionar Canal
            </button>
            <span className="text-border">|</span>
            <button onClick={restaurarCanaisPadraoHandler} className="text-sm text-accent hover:underline" disabled={pending}>
              Restaurar Canais Padrão
            </button>
          </div>
        </Card>
      </div>

      <LojaModal
        key={`loja-${modalLoja?.loja?.id ?? modalLoja?.canal.id ?? "fechado"}`}
        modalLoja={modalLoja}
        onClose={() => setModalLoja(null)}
        onSave={salvarLojaHandler}
        salvando={pending}
      />
      <FaixasModal
        key={`faixas-${modalFaixas?.id ?? "fechado"}`}
        canal={modalFaixas}
        onClose={() => setModalFaixas(null)}
        onSave={salvarFaixasHandler}
        salvando={pending}
      />
      <LimitesTextoModal
        key={`limites-${modalLimites?.id ?? "fechado"}`}
        canal={modalLimites}
        onClose={() => setModalLimites(null)}
        onSave={salvarLimitesHandler}
        salvando={pending}
      />
      <CanalModal open={modalCanal} onClose={() => setModalCanal(false)} onSave={salvarCanalHandler} salvando={pending} />
      {ConfirmDialog}
    </>
  );
}

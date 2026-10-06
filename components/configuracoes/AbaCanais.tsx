"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { PlugZap, Store, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConectarMarketplace } from "@/components/configuracoes/ConectarMarketplace";
import { ConexaoLoja } from "@/components/configuracoes/ConexaoLoja";
import { marcaDoNome } from "@/lib/marcas";
import type { ConexaoResumo } from "@/lib/marketplace/pedidos-servidor";
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
export interface DadosMarketplaceCanais {
  conexoes: ConexaoResumo[];
  /** Variáveis da API que faltam no servidor (só nomes). */
  faltando: string[];
  /** Idem, Mercado Livre (10.8). */
  faltandoML: string[];
  ambiente: "teste" | "producao";
  /** `?shopee=` da volta da autorização. */
  aviso: string | null;
}

const AVISO_SHOPEE: Record<string, [string, "ok" | "erro"]> = {
  conectada: ["Loja conectada à Shopee. Os pedidos passam a sincronizar sozinhos; use Sincronizar para puxar agora.", "ok"],
  erro: ["Não foi possível conectar a loja à Shopee. Tente de novo.", "erro"],
  desligada: ["A integração com a API da Shopee não está ligada neste servidor.", "erro"],
  ml_conectada: ["Conta conectada ao Mercado Livre. Os pedidos passam a sincronizar sozinhos; use Sincronizar para puxar agora.", "ok"],
  ml_erro: ["Não foi possível conectar ao Mercado Livre. Tente de novo.", "erro"],
  ml_desligada: ["A integração com o Mercado Livre não está ligada neste servidor (faltam ML_CLIENT_ID e ML_CLIENT_SECRET).", "erro"],
};

export function AbaCanais({ canais, lojas, marketplace }: { canais: Canal[]; lojas: Loja[]; marketplace: DadosMarketplaceCanais }) {
  const [pending, startTransition] = useTransition();
  const [conectando, setConectando] = useState(false);
  const apiLigada = marketplace.faltando.length === 0;

  useEffect(() => {
    const a = marketplace.aviso ? AVISO_SHOPEE[marketplace.aviso] : null;
    if (a) (a[1] === "ok" ? toast.success : toast.error)(a[0]);
  }, [marketplace.aviso]);
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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-text-secondary max-w-xl">
          Canais, lojas e taxas de cada plataforma. As taxas mudam com frequência: edite aqui sempre que a plataforma mudar a tabela.
        </p>
        <Button variant="primary" onClick={() => setConectando(true)}>
          <PlugZap size={14} /> Conectar marketplace
        </Button>
      </div>
      {!apiLigada && canais.some((c) => marcaDoNome(c.nome) === "shopee") && (
        <p className="text-xs text-text-tertiary mb-4 rounded-md border border-border bg-surface-1 px-3 py-2">
          API da Shopee desligada neste servidor: falta <span className="font-mono">{marketplace.faltando.join(", ")}</span> na Vercel (e um Redeploy depois). A importação por planilha continua valendo.
        </p>
      )}
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
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Button variant="ghost" size="sm" onClick={() => setModalLimites(c)}>
                    Limites de texto
                  </Button>
                  {c.tipo_taxa === "faixas" && (
                    <Button variant="ghost" size="sm" onClick={() => setModalFaixas(c)}>
                      Editar faixas
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" onClick={() => setModalLoja({ loja: null, canal: c })}>
                    <Plus size={14} /> Loja
                  </Button>
                  <RowMenu actions={[{ label: "Remover canal", onClick: () => removerCanalHandler(c), destructive: true }]} />
                </div>
              </div>
              <div className="space-y-2">
                {marcaDoNome(c.nome) === "shopee" && apiLigada && marketplace.ambiente === "teste" && (
                  <div className="text-xs text-text-tertiary">API em modo Sandbox (teste)</div>
                )}
                {lojasDoCanal.map((l) => {
                  const comissaoEfetiva = l.comissao_pct ?? c.comissao_pct_padrao;
                  const taxaFixaEfetiva = l.taxa_fixa ?? c.taxa_fixa_padrao;
                  return (
                    <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 border border-border rounded-md p-3">
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
                      <div className="flex flex-wrap items-center gap-2 justify-end">
                        {marcaDoNome(c.nome) === "shopee" && (
                          <ConexaoLoja lojaId={l.id} nomeLoja={l.nome} conexao={marketplace.conexoes.find((x) => x.loja_id === l.id)} apiLigada={apiLigada} />
                        )}
                        {marcaDoNome(c.nome) === "mercadolivre" && (
                          <ConexaoLoja
                            lojaId={l.id}
                            nomeLoja={l.nome}
                            conexao={marketplace.conexoes.find((x) => x.loja_id === l.id)}
                            apiLigada={marketplace.faltandoML.length === 0}
                            plataforma="mercadolivre"
                          />
                        )}
                        <Button variant="ghost" size="sm" onClick={() => (c.tipo_taxa === "faixas" ? setModalFaixas(c) : setModalLoja({ loja: l, canal: c }))}>
                          Editar taxas
                        </Button>
                        <RowMenu
                          actions={[
                            { label: "Editar", onClick: () => setModalLoja({ loja: l, canal: c }) },
                            { label: "Remover", onClick: () => removerLojaHandler(l), destructive: true },
                          ]}
                        />
                      </div>
                    </div>
                  );
                })}
                {lojasDoCanal.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setModalLoja({ loja: null, canal: c })}
                    className="w-full rounded-md border border-dashed border-border px-3 py-3 text-sm text-text-tertiary hover:bg-surface-2 hover:text-text-primary"
                  >
                    Nenhuma loja neste canal. Clique para cadastrar a primeira.
                  </button>
                )}
              </div>
            </Card>
          );
        })}
        <Card className="border-dashed">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setModalCanal(true)}>
              <Plus size={14} /> Adicionar canal
            </Button>
            <Button variant="ghost" size="sm" onClick={restaurarCanaisPadraoHandler} disabled={pending}>
              Restaurar canais padrão
            </Button>
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
      {conectando && <ConectarMarketplace onClose={() => setConectando(false)} canais={canais} lojas={lojas} faltando={{ shopee: marketplace.faltando, mercadolivre: marketplace.faltandoML }} />}
      {ConfirmDialog}
    </>
  );
}

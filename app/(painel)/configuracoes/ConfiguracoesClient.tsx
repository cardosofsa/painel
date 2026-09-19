"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ShoppingBag, ShoppingCart, Store, Users, Warehouse, CreditCard, Tag, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/mock-data";
import { formatarFaixaLabel } from "@/lib/pricing";
import {
  criarCategoria,
  removerCategoria,
  criarLoja,
  atualizarLoja,
  removerLoja,
  atualizarFaixasCanal,
  criarCanal,
  removerCanal,
  restaurarCanaisPadrao,
  criarConta,
  atualizarConta,
  removerConta,
  criarArmazem,
  atualizarArmazem,
  removerArmazem,
  criarFormaPagamento,
  atualizarFormaPagamento,
  removerFormaPagamento,
  salvarPerfilNegocio,
  type LojaInput,
  type FaixaComissaoInput,
  type CanalInput,
  type ContaInput,
  type ArmazemInput,
  type FormaPagamentoInput,
  type PerfilNegocioInput,
} from "./actions";

export interface Categoria {
  id: string;
  nome: string;
  skus: number;
}
export interface Canal {
  id: string;
  nome: string;
  tipo_taxa: "faixas" | "fixo";
  icone: string;
  cor: string;
  comissao_pct_padrao: number;
  taxa_fixa_padrao: number;
  taxa_extra_valor_padrao: number | null;
  taxa_extra_tipo_padrao: "percentual" | "fixo" | null;
  faixas: { id: string; preco_min: number; preco_max: number | null; comissao_pct: number; tarifa_fixa: number }[];
}
export interface Loja extends LojaInput {
  id: string;
  logo_url: string | null;
}
export interface Conta extends ContaInput {
  id: string;
}
export interface Armazem extends ArmazemInput {
  id: string;
}
export interface FormaPagamento extends FormaPagamentoInput {
  id: string;
}
export interface PerfilNegocio {
  nome_negocio: string;
  cnpj: string;
  regime_tributario: string;
  aliquota_das: number;
}

const ICONES_CANAL: Record<string, LucideIcon> = {
  ShoppingBag,
  ShoppingCart,
  Store,
  Facebook: Users,
};

const ABAS = ["Canais de Venda", "Categorias", "Armazéns", "Transações", "Conta"] as const;

export function ConfiguracoesClient({
  categorias,
  canais,
  lojas,
  contas,
  armazens,
  formasPagamento,
  perfil,
  email,
}: {
  categorias: Categoria[];
  canais: Canal[];
  lojas: Loja[];
  contas: Conta[];
  armazens: Armazem[];
  formasPagamento: FormaPagamento[];
  perfil: PerfilNegocio;
  email: string;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [aba, setAba] = useState<(typeof ABAS)[number]>("Canais de Venda");

  const [modalLoja, setModalLoja] = useState<{ loja: Loja | null; canal: Canal } | null>(null);
  const [modalFaixas, setModalFaixas] = useState<Canal | null>(null);
  const [modalCanal, setModalCanal] = useState(false);
  const [modalConta, setModalConta] = useState<Conta | "novo" | null>(null);
  const [modalArmazem, setModalArmazem] = useState<Armazem | "novo" | null>(null);
  const [modalFormaPagamento, setModalFormaPagamento] = useState<FormaPagamento | "novo" | null>(null);
  const [novaCategoria, setNovaCategoria] = useState("");

  const [nomeNegocio, setNomeNegocio] = useState(perfil.nome_negocio);
  const [cnpj, setCnpj] = useState(perfil.cnpj);
  const [regimeTributario, setRegimeTributario] = useState(perfil.regime_tributario);
  const [aliquotaDas, setAliquotaDas] = useState(perfil.aliquota_das);

  const [notificacoes, setNotificacoes] = useState({
    estoqueBaixo: true,
    vencimentos: true,
    pedidosRecebidos: true,
    resumoSemanal: false,
  });

  function salvarLojaHandler(dados: LojaInput) {
    startTransition(async () => {
      try {
        if (modalLoja?.loja) {
          await atualizarLoja(modalLoja.loja.id, dados);
          toast.success("Loja atualizada");
        } else {
          await criarLoja(dados);
          toast.success("Loja adicionada");
        }
        setModalLoja(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar loja");
      }
    });
  }

  async function removerLojaHandler(l: Loja) {
    const ok = await confirm({ title: "Remover loja?", message: `"${l.nome}" será removida definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      try {
        await removerLoja(l.id);
        toast("Loja removida");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover loja");
      }
    });
  }

  function salvarFaixasHandler(canalId: string, faixas: FaixaComissaoInput[]) {
    startTransition(async () => {
      try {
        await atualizarFaixasCanal(canalId, faixas);
        toast.success("Faixas de comissão atualizadas");
        setModalFaixas(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar faixas");
      }
    });
  }

  function salvarCanalHandler(dados: CanalInput) {
    startTransition(async () => {
      try {
        await criarCanal(dados);
        toast.success("Canal adicionado");
        setModalCanal(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao adicionar canal");
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
      try {
        await removerCanal(c.id);
        toast("Canal removido");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover canal");
      }
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
      try {
        await restaurarCanaisPadrao();
        toast.success("Canais padrão restaurados");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao restaurar canais");
      }
    });
  }

  function adicionarCategoriaHandler() {
    if (!novaCategoria.trim()) return;
    const nome = novaCategoria.trim();
    setNovaCategoria("");
    startTransition(async () => {
      try {
        await criarCategoria(nome);
        toast.success("Categoria adicionada");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao adicionar categoria");
      }
    });
  }

  async function removerCategoriaHandler(c: Categoria) {
    const ok = await confirm({ title: "Remover categoria?", message: `"${c.nome}" será removida definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      try {
        await removerCategoria(c.id);
        toast("Categoria removida");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover categoria");
      }
    });
  }

  function salvarContaHandler(dados: ContaInput) {
    startTransition(async () => {
      try {
        if (modalConta === "novo") {
          await criarConta(dados);
          toast.success("Conta adicionada");
        } else if (modalConta) {
          await atualizarConta(modalConta.id, dados);
          toast.success("Conta atualizada");
        }
        setModalConta(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar conta");
      }
    });
  }

  async function removerContaHandler(c: Conta) {
    const ok = await confirm({ title: "Remover conta?", message: `"${c.nome}" será removida definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      try {
        await removerConta(c.id);
        toast("Conta removida");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover conta");
      }
    });
  }

  function salvarFormaPagamentoHandler(dados: FormaPagamentoInput) {
    startTransition(async () => {
      try {
        if (modalFormaPagamento === "novo") {
          await criarFormaPagamento(dados);
          toast.success("Forma de pagamento adicionada");
        } else if (modalFormaPagamento) {
          await atualizarFormaPagamento(modalFormaPagamento.id, dados);
          toast.success("Forma de pagamento atualizada");
        }
        setModalFormaPagamento(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar forma de pagamento");
      }
    });
  }

  async function removerFormaPagamentoHandler(f: FormaPagamento) {
    const ok = await confirm({ title: "Remover forma de pagamento?", message: `"${f.nome}" será removida definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      try {
        await removerFormaPagamento(f.id);
        toast("Forma de pagamento removida");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover forma de pagamento");
      }
    });
  }

  function salvarArmazemHandler(dados: ArmazemInput) {
    startTransition(async () => {
      try {
        if (modalArmazem === "novo") {
          await criarArmazem(dados);
          toast.success("Armazém adicionado");
        } else if (modalArmazem) {
          await atualizarArmazem(modalArmazem.id, dados);
          toast.success("Armazém atualizado");
        }
        setModalArmazem(null);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar armazém");
      }
    });
  }

  async function removerArmazemHandler(a: Armazem) {
    const ok = await confirm({ title: "Remover armazém?", message: `"${a.nome}" será removido definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      try {
        await removerArmazem(a.id);
        toast("Armazém removido");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao remover armazém");
      }
    });
  }

  function salvarPerfil() {
    const dados: PerfilNegocioInput = { nome_negocio: nomeNegocio, cnpj, regime_tributario: regimeTributario, aliquota_das: aliquotaDas };
    startTransition(async () => {
      try {
        await salvarPerfilNegocio(dados);
        toast.success("Perfil do negócio salvo");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar perfil");
      }
    });
  }

  function exportarDados() {
    const snapshot = { categorias, canais, contas, armazens };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "painel-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup exportado");
  }

  return (
    <>
      <PageHeader title="Configurações do Negócio" />

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto overflow-y-hidden">
        {ABAS.map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              aba === a ? "border-accent text-accent font-medium" : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {aba === "Canais de Venda" && (
        <div className="space-y-4">
          {canais.map((c) => {
            const Icone = ICONES_CANAL[c.icone] ?? Store;
            const lojasDoCanal = lojas.filter((l) => l.canal_id === c.id);
            return (
              <Card key={c.id}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${c.cor}1a`, color: c.cor }}
                    >
                      <Icone size={18} />
                    </div>
                    <div>
                      <div className="font-medium text-text-primary text-sm">{c.nome}</div>
                      {c.tipo_taxa === "faixas" && (
                        <div className="text-xs text-text-tertiary">Comissão por faixa de preço (tabela editável)</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {c.tipo_taxa === "faixas" && (
                      <button onClick={() => setModalFaixas(c)} className="text-sm text-accent hover:underline">
                        Editar Faixas de Comissão
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
                            // eslint-disable-next-line @next/next/no-img-element -- logo vem de URL do Storage
                            <img src={l.logo_url} alt={l.nome} className="w-8 h-8 rounded-md object-cover border border-border" />
                          ) : (
                            <div
                              className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${c.cor}1a`, color: c.cor }}
                            >
                              <Icone size={14} />
                            </div>
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
      )}

      {aba === "Categorias" && (
        <Card>
          <h3 className="font-semibold text-text-primary mb-4">Categorias de Produto</h3>
          <div className="flex gap-2 mb-3">
            <input
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionarCategoriaHandler()}
              placeholder="Nova categoria…"
              className={inputClass}
            />
            <Button variant="secondary" onClick={adicionarCategoriaHandler}>
              Adicionar
            </Button>
          </div>
          <div className="space-y-2">
            {categorias.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-surface-2 rounded-md px-3 py-2">
                <span className="text-sm text-text-primary">{c.nome}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-text-secondary">{c.skus} SKUs</span>
                  <button onClick={() => removerCategoriaHandler(c)} className="text-text-tertiary hover:text-negative text-sm">
                    ×
                  </button>
                </div>
              </div>
            ))}
            {categorias.length === 0 && (
              <EmptyState icon={Tag} title="Nenhuma categoria cadastrada" description="Organize seus produtos criando categorias." />
            )}
          </div>
        </Card>
      )}

      {aba === "Armazéns" && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-text-primary">Armazéns</h3>
              <p className="text-sm text-text-secondary">Onde o estoque físico fica e quais lojas cada um abastece.</p>
            </div>
            <button onClick={() => setModalArmazem("novo")} className="text-sm text-accent hover:underline shrink-0">
              + Adicionar Armazém
            </button>
          </div>
          <div className="space-y-3">
            {armazens.map((a) => (
              <div key={a.id} className="border border-border rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-medium text-text-primary text-sm">{a.nome}</div>
                    <div className="text-xs text-text-tertiary">{a.endereco}</div>
                  </div>
                  <RowMenu
                    actions={[
                      { label: "Editar", onClick: () => setModalArmazem(a) },
                      { label: "Remover", onClick: () => removerArmazemHandler(a), destructive: true },
                    ]}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {a.lojas_abastecidas.map((loja) => (
                    <span key={loja} className="text-xs bg-surface-2 text-text-secondary rounded-full px-2 py-0.5">
                      {loja}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {armazens.length === 0 && (
              <EmptyState icon={Warehouse} title="Nenhum armazém cadastrado" description="Cadastre onde seu estoque físico fica." />
            )}
          </div>
        </Card>
      )}

      {aba === "Transações" && (
        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-primary">Formas de Recebimento</h3>
              <button onClick={() => setModalConta("novo")} className="text-sm text-accent hover:underline">
                + Adicionar Conta
              </button>
            </div>
            <div className="space-y-3">
              {contas.map((c) => (
                <div key={c.id} className="flex items-center justify-between border border-border rounded-md p-3">
                  <div>
                    <div className="text-sm font-medium text-text-primary">{c.nome}</div>
                    <div className="text-xs text-text-tertiary">{c.detalhe}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-text-primary">{formatBRL(c.saldo)}</span>
                    <RowMenu
                      actions={[
                        { label: "Editar", onClick: () => setModalConta(c) },
                        { label: "Remover", onClick: () => removerContaHandler(c), destructive: true },
                      ]}
                    />
                  </div>
                </div>
              ))}
              {contas.length === 0 && (
                <EmptyState icon={CreditCard} title="Nenhuma conta cadastrada" description="Cadastre suas contas e formas de recebimento." />
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-primary">Formas de Pagamento</h3>
              <button onClick={() => setModalFormaPagamento("novo")} className="text-sm text-accent hover:underline">
                + Adicionar Forma de Pagamento
              </button>
            </div>
            <div className="space-y-3">
              {formasPagamento.map((f) => (
                <div key={f.id} className="flex items-center justify-between border border-border rounded-md p-3">
                  <div className="text-sm font-medium text-text-primary">{f.nome}</div>
                  <RowMenu
                    actions={[
                      { label: "Editar", onClick: () => setModalFormaPagamento(f) },
                      { label: "Remover", onClick: () => removerFormaPagamentoHandler(f), destructive: true },
                    ]}
                  />
                </div>
              ))}
              {formasPagamento.length === 0 && (
                <EmptyState
                  icon={CreditCard}
                  title="Nenhuma forma de pagamento cadastrada"
                  description="Cadastre as formas de pagamento que você usa nas compras (Pix, dinheiro, cartão, etc.)."
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {aba === "Conta" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
          <ContaCard email={email} />

          <Card className="h-full flex flex-col">
            <h3 className="font-semibold text-text-primary mb-4">Alertas</h3>
            <div className="space-y-1">
              {[
                { key: "estoqueBaixo" as const, label: "Estoque no mínimo ou abaixo" },
                { key: "vencimentos" as const, label: "Contas a pagar/receber vencendo" },
                { key: "pedidosRecebidos" as const, label: "Pedidos de compra recebidos" },
                { key: "resumoSemanal" as const, label: "Resumo semanal do negócio" },
              ].map((item) => (
                <label key={item.key} className="flex items-center justify-between py-2.5 border-b border-border last:border-0 cursor-pointer">
                  <span className="text-sm text-text-primary">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={notificacoes[item.key]}
                    onChange={(e) => setNotificacoes((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                    className="w-4 h-4 accent-accent"
                  />
                </label>
              ))}
            </div>
          </Card>

          <Card className="h-full flex flex-col">
            <h3 className="font-semibold text-text-primary mb-4">Perfil do Negócio</h3>
            <FormField label="Nome do Negócio">
              <input className={inputClass} value={nomeNegocio} onChange={(e) => setNomeNegocio(e.target.value)} />
            </FormField>
            <FormField label="CNPJ">
              <input className={inputClass} value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
            </FormField>
            <div className="mt-auto pt-2">
              <Button variant="primary" onClick={salvarPerfil} loading={pending}>
                Salvar Perfil
              </Button>
            </div>
          </Card>

          <Card className="h-full flex flex-col">
            <h3 className="font-semibold text-text-primary mb-4">Regime Tributário</h3>
            <FormField label="Regime">
              <input className={inputClass} value={regimeTributario} onChange={(e) => setRegimeTributario(e.target.value)} />
            </FormField>
            <FormField label="Alíquota Efetiva do DAS (%)">
              <input
                type="number"
                step="0.1"
                className={inputClass}
                value={aliquotaDas}
                onChange={(e) => setAliquotaDas(Number(e.target.value) || 0)}
              />
            </FormField>
            <p className="text-xs text-text-tertiary mb-4">
              Usada como valor padrão do campo Imposto/DAS na calculadora de Precificação.
            </p>
            <div className="mt-auto pt-2">
              <Button variant="primary" onClick={salvarPerfil} loading={pending}>
                Salvar Regime
              </Button>
            </div>
          </Card>

          <Card className="lg:col-span-2">
            <h3 className="font-semibold text-text-primary mb-2">Backup & Exportação</h3>
            <p className="text-sm text-text-secondary mb-4">
              Baixe uma cópia dos seus dados (lojas, categorias, armazéns e contas) em JSON.
            </p>
            <Button variant="secondary" onClick={exportarDados}>
              Exportar Backup
            </Button>
          </Card>
        </div>
      )}

      <LojaModal key={`loja-${modalLoja?.loja?.id ?? modalLoja?.canal.id ?? "fechado"}`} modalLoja={modalLoja} onClose={() => setModalLoja(null)} onSave={salvarLojaHandler} salvando={pending} />
      <FaixasModal key={`faixas-${modalFaixas?.id ?? "fechado"}`} canal={modalFaixas} onClose={() => setModalFaixas(null)} onSave={salvarFaixasHandler} salvando={pending} />
      <ContaModal key={`conta-${modalConta === "novo" ? "novo" : modalConta?.id ?? "fechado"}`} conta={modalConta} onClose={() => setModalConta(null)} onSave={salvarContaHandler} salvando={pending} />
      <ArmazemModal key={`armazem-${modalArmazem === "novo" ? "novo" : modalArmazem?.id ?? "fechado"}`} armazem={modalArmazem} onClose={() => setModalArmazem(null)} onSave={salvarArmazemHandler} salvando={pending} />
      <FormaPagamentoModal
        key={`forma-pagamento-${modalFormaPagamento === "novo" ? "novo" : modalFormaPagamento?.id ?? "fechado"}`}
        formaPagamento={modalFormaPagamento}
        onClose={() => setModalFormaPagamento(null)}
        onSave={salvarFormaPagamentoHandler}
        salvando={pending}
      />
      <CanalModal open={modalCanal} onClose={() => setModalCanal(false)} onSave={salvarCanalHandler} salvando={pending} />
      {ConfirmDialog}
    </>
  );
}

function ContaCard({ email }: { email: string }) {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function alterarSenha() {
    if (!senhaAtual) {
      toast.error("Informe a senha atual.");
      return;
    }
    if (novaSenha.length < 6) {
      toast.error("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmarSenha) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setSalvando(true);
    const supabase = createClient();

    const { error: erroReautenticacao } = await supabase.auth.signInWithPassword({ email, password: senhaAtual });
    if (erroReautenticacao) {
      setSalvando(false);
      toast.error("Senha atual incorreta.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmarSenha("");
    toast.success("Senha alterada com sucesso");
  }

  return (
    <Card className="h-full flex flex-col">
      <h3 className="font-semibold text-text-primary mb-4">Conta</h3>
      <FormField label="E-mail">
        <input className={inputClass} value={email} disabled />
      </FormField>
      <div className="border-t border-border pt-4 mb-4">
        <span className="text-sm font-medium text-text-primary">Alterar senha</span>
      </div>
      <FormField label="Senha atual">
        <input
          type="password"
          className={inputClass}
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
        />
      </FormField>
      <FormField label="Nova senha">
        <input
          type="password"
          minLength={6}
          className={inputClass}
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
        />
      </FormField>
      <FormField label="Confirmar nova senha">
        <input
          type="password"
          minLength={6}
          className={inputClass}
          value={confirmarSenha}
          onChange={(e) => setConfirmarSenha(e.target.value)}
        />
      </FormField>
      <div className="mt-auto pt-2">
        <Button variant="primary" onClick={alterarSenha} loading={salvando}>
          Alterar Senha
        </Button>
      </div>
    </Card>
  );
}

function FaixasModal({
  canal,
  onClose,
  onSave,
  salvando,
}: {
  canal: Canal | null;
  onClose: () => void;
  onSave: (canalId: string, faixas: FaixaComissaoInput[]) => void;
  salvando: boolean;
}) {
  const [faixas, setFaixas] = useState<FaixaComissaoInput[]>(
    () => canal?.faixas.map((f) => ({ preco_min: f.preco_min, preco_max: f.preco_max, comissao_pct: f.comissao_pct, tarifa_fixa: f.tarifa_fixa })) ?? [],
  );

  function atualizar(i: number, campo: keyof FaixaComissaoInput, valor: string) {
    setFaixas((prev) =>
      prev.map((f, idx) =>
        idx === i ? { ...f, [campo]: campo === "preco_max" && valor.trim() === "" ? null : Number(valor) || 0 } : f,
      ),
    );
  }

  function adicionar() {
    setFaixas((prev) => [...prev, { preco_min: 0, preco_max: null, comissao_pct: 0, tarifa_fixa: 0 }]);
  }

  function remover(i: number) {
    setFaixas((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <Modal open={!!canal} onClose={onClose} title={canal ? `Faixas de Comissão (${canal.nome})` : ""} width="max-w-xl">
      <p className="text-sm text-text-secondary mb-4">
        Vale para todas as lojas deste canal. Ajuste se a plataforma mudar a tabela oficial.
      </p>
      <div className="space-y-3 mb-4">
        {faixas.map((f, i) => {
          const ultima = i === faixas.length - 1;
          return (
            <div key={i} className="border border-border rounded-md p-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                {ultima ? (
                  <div className="col-span-2">
                    <label className="text-[10px] text-text-tertiary block mb-1">Faixa de Preço</label>
                    <div className="text-sm text-text-secondary bg-surface-2 rounded-md h-9 px-3 flex items-center whitespace-nowrap overflow-hidden text-ellipsis">
                      Acima de {formatBRL(f.preco_min)}
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-[10px] text-text-tertiary block mb-1">De (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={f.preco_min}
                        onChange={(e) => atualizar(i, "preco_min", e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-text-tertiary block mb-1">Até (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={f.preco_max ?? ""}
                        onChange={(e) => atualizar(i, "preco_max", e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-[10px] text-text-tertiary block mb-1">Comissão (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={f.comissao_pct}
                    onChange={(e) => atualizar(i, "comissao_pct", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-tertiary block mb-1">Tarifa Fixa (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={f.tarifa_fixa}
                    onChange={(e) => atualizar(i, "tarifa_fixa", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              <button onClick={() => remover(i)} className="text-xs text-negative hover:underline">
                Remover faixa
              </button>
            </div>
          );
        })}
      </div>
      <button onClick={adicionar} className="text-sm text-accent hover:underline mb-5">
        + Adicionar Faixa
      </button>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => canal && onSave(canal.id, faixas)} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

function CanalModal({
  open,
  onClose,
  onSave,
  salvando,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (dados: CanalInput) => void;
  salvando: boolean;
}) {
  const [nome, setNome] = useState("");
  const [tipoTaxa, setTipoTaxa] = useState<"fixo" | "faixas">("fixo");
  const [icone, setIcone] = useState("Store");
  const [cor, setCor] = useState("#64748b");

  function salvar() {
    if (!nome.trim()) return;
    onSave({ nome: nome.trim(), tipo_taxa: tipoTaxa, icone, cor });
    setNome("");
    setTipoTaxa("fixo");
    setIcone("Store");
    setCor("#64748b");
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar Canal" width="max-w-md">
      <FormField label="Nome do Canal">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: TikTok Shop" />
      </FormField>
      <FormField label="Tipo de Taxa">
        <select className={inputClass} value={tipoTaxa} onChange={(e) => setTipoTaxa(e.target.value as "fixo" | "faixas")}>
          <option value="fixo">Fixo (comissão % + taxa fixa)</option>
          <option value="faixas">Faixas por preço (ex: Shopee)</option>
        </select>
      </FormField>
      <FormField label="Ícone">
        <select className={inputClass} value={icone} onChange={(e) => setIcone(e.target.value)}>
          {Object.keys(ICONES_CANAL).map((key) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Cor">
        <input
          type="color"
          value={cor}
          onChange={(e) => setCor(e.target.value)}
          className="h-9 w-16 rounded-md border border-border bg-surface-1 cursor-pointer"
        />
      </FormField>
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

function LojaModal({
  modalLoja,
  onClose,
  onSave,
  salvando,
}: {
  modalLoja: { loja: Loja | null; canal: Canal } | null;
  onClose: () => void;
  onSave: (dados: LojaInput) => void;
  salvando: boolean;
}) {
  const loja = modalLoja?.loja ?? null;
  const canal = modalLoja?.canal;
  const [nome, setNome] = useState(loja?.nome ?? "");
  const [link, setLink] = useState(loja?.link ?? "");
  const [logoPath, setLogoPath] = useState<string | null>(loja?.logo_path ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(loja?.logo_url ?? null);
  const [comissaoPctStr, setComissaoPctStr] = useState(loja?.comissao_pct != null ? String(loja.comissao_pct) : "");
  const [taxaFixaStr, setTaxaFixaStr] = useState(loja?.taxa_fixa != null ? String(loja.taxa_fixa) : "");
  const [taxaExtraValorStr, setTaxaExtraValorStr] = useState(loja?.taxa_extra_valor != null ? String(loja.taxa_extra_valor) : "");
  const [taxaExtraTipo, setTaxaExtraTipo] = useState<"percentual" | "fixo">(loja?.taxa_extra_tipo ?? "percentual");
  const { enviar: enviarLogoArquivo, enviando: enviandoLogo } = useSupabaseUpload("canais-logos");

  async function enviarLogo(file: File) {
    const resultado = await enviarLogoArquivo(file, { maxSizeMb: 3, tiposAceitos: ["image/"], prefixo: "loja" });
    if (resultado) {
      setLogoPath(resultado.path);
      setLogoUrl(resultado.publicUrl);
    }
  }

  if (!canal) return null;

  return (
    <Modal open={!!modalLoja} onClose={onClose} title={loja ? `Editar Loja — ${canal.nome}` : `Adicionar Loja — ${canal.nome}`}>
      <FormField label="Nome da Loja">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Minha Loja Oficial" />
      </FormField>
      <FormField label="Logo (opcional)">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo vem de URL do Storage
            <img src={logoUrl} alt={nome} className="w-10 h-10 rounded-md object-cover border border-border" />
          ) : (
            <div className="w-10 h-10 rounded-md bg-surface-2 border border-border" />
          )}
          <input
            type="file"
            accept="image/*"
            disabled={enviandoLogo}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) enviarLogo(file);
              e.target.value = "";
            }}
            className="text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-surface-2 file:text-text-primary file:text-sm hover:file:bg-surface-3 disabled:opacity-50"
          />
        </div>
      </FormField>
      <FormField label="Link da Loja (opcional)">
        <input className={inputClass} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
      </FormField>

      {canal.tipo_taxa === "faixas" ? (
        <div className="mb-4">
          <label className="block text-xs font-medium text-text-secondary mb-1.5">
            Comissão por faixa de preço (compartilhada pelo canal)
          </label>
          <div className="border border-border rounded-md divide-y divide-border text-xs">
            {canal.faixas.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-3 py-1.5">
                <span className="text-text-secondary">{formatarFaixaLabel({ min: f.preco_min, max: f.preco_max, comissaoPct: f.comissao_pct, tarifaFixa: f.tarifa_fixa })}</span>
                <span className="text-text-primary">
                  {f.comissao_pct}% + {formatBRL(f.tarifa_fixa)}
                </span>
              </div>
            ))}
            {canal.faixas.length === 0 && <div className="px-3 py-2 text-text-tertiary">Nenhuma faixa cadastrada.</div>}
          </div>
          <p className="text-xs text-text-tertiary mt-1.5">
            Todas as lojas deste canal usam a mesma tabela — edite em &quot;Editar Faixas de Comissão&quot; no
            cabeçalho do canal.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <FormField label={`Comissão (%) — padrão ${canal.comissao_pct_padrao}%`}>
            <input
              type="number"
              step="0.1"
              className={inputClass}
              value={comissaoPctStr}
              onChange={(e) => setComissaoPctStr(e.target.value)}
              placeholder={String(canal.comissao_pct_padrao)}
            />
          </FormField>
          <FormField label={`Taxa Fixa (R$) — padrão ${formatBRL(canal.taxa_fixa_padrao)}`}>
            <input
              type="number"
              step="0.01"
              className={inputClass}
              value={taxaFixaStr}
              onChange={(e) => setTaxaFixaStr(e.target.value)}
              placeholder={String(canal.taxa_fixa_padrao)}
            />
          </FormField>
        </div>
      )}

      <FormField label="Taxa Extra (opcional)">
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={taxaExtraValorStr}
            onChange={(e) => setTaxaExtraValorStr(e.target.value)}
            placeholder="0"
          />
          <select
            value={taxaExtraTipo}
            onChange={(e) => setTaxaExtraTipo(e.target.value as "percentual" | "fixo")}
            className={`${inputClass} w-28`}
          >
            <option value="percentual">%</option>
            <option value="fixo">R$</option>
          </select>
        </div>
      </FormField>

      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() =>
            onSave({
              canal_id: canal.id,
              nome,
              logo_path: logoPath,
              link: link.trim() || null,
              comissao_pct: comissaoPctStr.trim() !== "" ? Number(comissaoPctStr) : null,
              taxa_fixa: taxaFixaStr.trim() !== "" ? Number(taxaFixaStr) : null,
              taxa_extra_valor: taxaExtraValorStr.trim() !== "" ? Number(taxaExtraValorStr) : null,
              taxa_extra_tipo: taxaExtraValorStr.trim() !== "" ? taxaExtraTipo : null,
            })
          }
          loading={salvando}
        >
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

function ContaModal({
  conta,
  onClose,
  onSave,
  salvando,
}: {
  conta: Conta | "novo" | null;
  onClose: () => void;
  onSave: (dados: ContaInput) => void;
  salvando: boolean;
}) {
  const base = conta && conta !== "novo" ? conta : { nome: "", saldo: 0, detalhe: "" };
  const [nome, setNome] = useState(base.nome);
  const [saldo, setSaldo] = useState(base.saldo);
  const [detalhe, setDetalhe] = useState(base.detalhe);

  return (
    <Modal open={!!conta} onClose={onClose} title={conta === "novo" ? "Adicionar Conta" : "Editar Conta"}>
      <FormField label="Nome da Conta">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} />
      </FormField>
      <FormField label="Saldo Atual (R$)">
        <input type="number" step="0.01" className={inputClass} value={saldo} onChange={(e) => setSaldo(Number(e.target.value) || 0)} />
      </FormField>
      <FormField label="Detalhe">
        <input className={inputClass} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Ex: Conta corrente PJ" />
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => onSave({ nome, saldo, detalhe })} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

function FormaPagamentoModal({
  formaPagamento,
  onClose,
  onSave,
  salvando,
}: {
  formaPagamento: FormaPagamento | "novo" | null;
  onClose: () => void;
  onSave: (dados: FormaPagamentoInput) => void;
  salvando: boolean;
}) {
  const base = formaPagamento && formaPagamento !== "novo" ? formaPagamento : { nome: "" };
  const [nome, setNome] = useState(base.nome);

  return (
    <Modal
      open={!!formaPagamento}
      onClose={onClose}
      title={formaPagamento === "novo" ? "Adicionar Forma de Pagamento" : "Editar Forma de Pagamento"}
    >
      <FormField label="Nome">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Pix, Cartão Nubank" />
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => onSave({ nome })} loading={salvando}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

function ArmazemModal({
  armazem,
  onClose,
  onSave,
  salvando,
}: {
  armazem: Armazem | "novo" | null;
  onClose: () => void;
  onSave: (dados: ArmazemInput) => void;
  salvando: boolean;
}) {
  const base = armazem && armazem !== "novo" ? armazem : { nome: "", endereco: "", lojas_abastecidas: [] as string[] };
  const [nome, setNome] = useState(base.nome);
  const [endereco, setEndereco] = useState(base.endereco);
  const [lojas, setLojas] = useState(base.lojas_abastecidas.join(", "));

  return (
    <Modal open={!!armazem} onClose={onClose} title={armazem === "novo" ? "Adicionar Armazém" : "Editar Armazém"}>
      <FormField label="Nome">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Galpão Central" />
      </FormField>
      <FormField label="Endereço">
        <input className={inputClass} value={endereco} onChange={(e) => setEndereco(e.target.value)} />
      </FormField>
      <FormField label="Lojas Abastecidas">
        <input
          className={inputClass}
          value={lojas}
          onChange={(e) => setLojas(e.target.value)}
          placeholder="Separe por vírgula: Perfumaria & Couro, Moto Parts"
        />
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={() =>
            onSave({
              nome,
              endereco,
              lojas_abastecidas: lojas
                .split(",")
                .map((l) => l.trim())
                .filter(Boolean),
            })
          }
          loading={salvando}
        >
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

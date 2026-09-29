"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ShoppingBag, ShoppingCart, Store, Users, Warehouse, CreditCard, Tag, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/Badge";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { formatBRL } from "@/lib/format";
import { ContaCard } from "./ContaCard";
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
  definirPinAdmin,
  type LojaInput,
  type FaixaComissaoInput,
  type CanalInput,
  type ContaInput,
  type ArmazemInput,
  type FormaPagamentoInput,
  type PerfilNegocioInput,
} from "./actions";
import { executarComToast } from "@/lib/acao-cliente";
import { FaixasModal, CanalModal, LojaModal } from "@/components/configuracoes/ModaisCanal";
import { ContaModal, FormaPagamentoModal, ArmazemModal, ROTULO_TIPO_FORMA } from "@/components/configuracoes/ModaisCadastro";
import { ImagemStorage } from "@/components/ui/ImagemStorage";

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
  whatsapp: string;
  /** Só diz SE existe PIN. O valor nunca sai do banco. */
  pin_configurado: boolean;
}

export const ICONES_CANAL: Record<string, LucideIcon> = {
  ShoppingBag,
  ShoppingCart,
  Store,
  Facebook: Users,
};

const ABAS = ["Canais de Venda", "Categorias", "Armazéns", "Transações", "Conta"] as const;
const ABAS_TABS = ABAS.map((a) => ({ value: a, label: a }));

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
  const [whatsapp, setWhatsapp] = useState(perfil.whatsapp);
  // Campo write-only: começa sempre vazio, mesmo quando já existe um PIN cadastrado.
  const [pinAdmin, setPinAdmin] = useState("");

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

  function adicionarCategoriaHandler() {
    if (!novaCategoria.trim()) return;
    const nome = novaCategoria.trim();
    startTransition(async () => {
      const r = await executarComToast(criarCategoria(nome), { erro: "Erro ao adicionar categoria" });
      if (r.ok) {
        // Limpa só depois do sucesso — se o nome já existir, o texto continua no campo
        // para o usuário corrigir em vez de ter que digitar tudo de novo.
        setNovaCategoria("");
        toast.success("Categoria adicionada");
      }
    });
  }

  async function removerCategoriaHandler(c: Categoria) {
    const ok = await confirm({ title: "Remover categoria?", message: `"${c.nome}" será removida definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerCategoria(c.id), { sucesso: "Categoria removida", erro: "Erro ao remover categoria" });
    });
  }

  function salvarContaHandler(dados: ContaInput) {
    startTransition(async () => {
      if (!modalConta) return;
      const r =
        modalConta === "novo"
          ? await executarComToast(criarConta(dados), { sucesso: "Conta adicionada", erro: "Erro ao salvar conta" })
          : await executarComToast(atualizarConta(modalConta.id, dados), {
              sucesso: "Conta atualizada",
              erro: "Erro ao salvar conta",
            });
      if (r.ok) setModalConta(null);
    });
  }

  async function removerContaHandler(c: Conta) {
    const ok = await confirm({ title: "Remover conta?", message: `"${c.nome}" será removida definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerConta(c.id), { sucesso: "Conta removida", erro: "Erro ao remover conta" });
    });
  }

  function salvarFormaPagamentoHandler(dados: FormaPagamentoInput) {
    startTransition(async () => {
      if (!modalFormaPagamento) return;
      const erro = "Erro ao salvar forma de pagamento";
      const r =
        modalFormaPagamento === "novo"
          ? await executarComToast(criarFormaPagamento(dados), { sucesso: "Forma de pagamento adicionada", erro })
          : await executarComToast(atualizarFormaPagamento(modalFormaPagamento.id, dados), {
              sucesso: "Forma de pagamento atualizada",
              erro,
            });
      if (r.ok) setModalFormaPagamento(null);
    });
  }

  async function removerFormaPagamentoHandler(f: FormaPagamento) {
    const ok = await confirm({ title: "Remover forma de pagamento?", message: `"${f.nome}" será removida definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerFormaPagamento(f.id), { sucesso: "Forma de pagamento removida", erro: "Erro ao remover forma de pagamento" });
    });
  }

  function salvarArmazemHandler(dados: ArmazemInput) {
    startTransition(async () => {
      if (!modalArmazem) return;
      const r =
        modalArmazem === "novo"
          ? await executarComToast(criarArmazem(dados), { sucesso: "Armazém adicionado", erro: "Erro ao salvar armazém" })
          : await executarComToast(atualizarArmazem(modalArmazem.id, dados), {
              sucesso: "Armazém atualizado",
              erro: "Erro ao salvar armazém",
            });
      if (r.ok) setModalArmazem(null);
    });
  }

  async function removerArmazemHandler(a: Armazem) {
    const ok = await confirm({ title: "Remover armazém?", message: `"${a.nome}" será removido definitivamente.` });
    if (!ok) return;
    startTransition(async () => {
      await executarComToast(removerArmazem(a.id), { sucesso: "Armazém removido", erro: "Erro ao remover armazém" });
    });
  }

  function salvarPerfil() {
    const dados: PerfilNegocioInput = {
      nome_negocio: nomeNegocio,
      cnpj,
      regime_tributario: regimeTributario,
      aliquota_das: aliquotaDas,
      whatsapp: whatsapp.trim() || null,
    };
    startTransition(async () => {
      await executarComToast(salvarPerfilNegocio(dados), { sucesso: "Perfil do negócio salvo", erro: "Erro ao salvar perfil" });
    });
  }

  function salvarPin() {
    const pin = pinAdmin.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) {
      toast.error("O PIN deve ter de 4 a 8 números.");
      return;
    }
    startTransition(async () => {
      const r = await executarComToast(definirPinAdmin(pin || null), { erro: "Erro ao salvar PIN" });
      if (r.ok) {
        setPinAdmin("");
        toast.success(pin ? "PIN atualizado" : "PIN removido — a edição de vendas fica bloqueada");
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

      <Tabs tabs={ABAS_TABS} value={aba} onChange={setAba} className="mb-6" />

      <TabPanel key={aba} tabValue={aba}>
      {aba === "Canais de Venda" && (
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
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${c.cor}1a`, color: c.cor }}
                    >
                      <Icone size={18} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-text-primary text-sm">{c.nome}</div>
                      {c.tipo_taxa === "faixas" && (
                        <div className="text-xs text-text-tertiary">Comissão por faixa de preço (tabela editável)</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
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
                  <div>
                    <div className="text-sm font-medium text-text-primary">{f.nome}</div>
                    <div className="text-xs text-text-tertiary">{ROTULO_TIPO_FORMA[f.tipo]}</div>
                  </div>
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
            <h3 className="font-semibold text-text-primary mb-4">Perfil do Negócio</h3>
            <FormField label="Nome do Negócio">
              <input className={inputClass} value={nomeNegocio} onChange={(e) => setNomeNegocio(e.target.value)} />
            </FormField>
            <FormField label="CNPJ">
              <input className={inputClass} value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
            </FormField>
            <FormField label="WhatsApp (para o botão Comprar Agora do Catálogo)">
              <input
                className={inputClass}
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="Ex: 11987654321"
              />
            </FormField>
            <div className="mt-auto pt-2">
              <Button variant="primary" onClick={salvarPerfil} loading={pending}>
                Salvar Perfil
              </Button>
            </div>
          </Card>

          <Card className="h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="font-semibold text-text-primary">PIN de Administração</h3>
              <StatusChip
                label={perfil.pin_configurado ? "Cadastrado" : "Não cadastrado"}
                tone={perfil.pin_configurado ? "positive" : "neutral"}
              />
            </div>
            <FormField label={perfil.pin_configurado ? "Novo PIN (4 a 8 números)" : "PIN (4 a 8 números)"}>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                className={inputClass}
                value={pinAdmin}
                onChange={(e) => setPinAdmin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder={perfil.pin_configurado ? "Digite para trocar" : "Ex: 1234"}
              />
            </FormField>
            <p className="text-xs text-text-tertiary mb-4">
              Pedido em Vendas antes de editar uma venda já finalizada. O PIN é guardado
              cifrado e nunca é exibido de volta — para trocar, digite um novo.
              {perfil.pin_configurado && " Salvar com o campo vazio remove o PIN e bloqueia a edição de vendas."}
            </p>
            <div className="mt-auto pt-2">
              <Button variant="primary" onClick={salvarPin} loading={pending}>
                {perfil.pin_configurado ? "Trocar PIN" : "Salvar PIN"}
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
      </TabPanel>

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

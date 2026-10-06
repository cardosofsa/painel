"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ShoppingBag, ShoppingCart, Store, Users, Warehouse, CreditCard, Tag, Plus, X, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, IconButton } from "@/components/ui/Button";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { campoBase, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { RowMenu } from "@/components/ui/RowMenu";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabPanel } from "@/components/ui/Tabs";
import { formatBRL } from "@/lib/format";
import {
  criarCategoria,
  removerCategoria,
  definirTipoCategoria,
  criarConta,
  atualizarConta,
  removerConta,
  criarArmazem,
  atualizarArmazem,
  removerArmazem,
  criarFormaPagamento,
  atualizarFormaPagamento,
  removerFormaPagamento,
  type LojaInput,
  type ContaInput,
  type ArmazemInput,
  type FormaPagamentoInput,
  type DadosEmpresaInput,
  type CrediarioConfig,
} from "./actions";
import { executarComToast } from "@/lib/acao-cliente";
import { AbaConta } from "@/components/configuracoes/AbaConta";
import { AbaIA, type IaCadastrada } from "@/components/configuracoes/AbaIA";
import type { EstadoTeste } from "@/lib/ia/teste";
import { AbaCanais, type DadosMarketplaceCanais } from "@/components/configuracoes/AbaCanais";
import { AbaDados } from "@/components/configuracoes/AbaDados";
import { AbaFrete, type FreteConfig } from "@/components/configuracoes/AbaFrete";
import { AbaPlano, type DadosPlano } from "@/components/configuracoes/AbaPlano";
import { AbaFiscal, type FiscalConfigTela } from "@/components/configuracoes/AbaFiscal";
import { AbaEquipe, type DadosEquipe } from "@/components/configuracoes/AbaEquipe";
import { ContaModal, FormaPagamentoModal, ArmazemModal, ROTULO_TIPO_FORMA } from "@/components/configuracoes/ModaisCadastro";

export interface Categoria {
  id: string;
  nome: string;
  skus: number;
  /** 0042. Ausente antes da migração. */
  tipo?: "produto" | "insumo" | "embalagem";
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
  limite_titulo: number | null;
  limite_descricao: number | null;
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
  empresa: DadosEmpresaInput;
}

export const ICONES_CANAL: Record<string, LucideIcon> = {
  ShoppingBag,
  ShoppingCart,
  Store,
  Facebook: Users,
};

const ABAS = ["Canais de Venda", "Categorias", "Armazéns", "Transações", "Frete", "Fiscal", "Equipe", "IA", "Dados", "Plano", "Conta"] as const;
type Aba = (typeof ABAS)[number];
/** As 11 telas em 5 grupos: menos abas na tela, e o que é parecido fica junto. */
const GRUPOS: { id: string; rotulo: string; abas: Aba[] }[] = [
  { id: "negocio", rotulo: "Negócio", abas: ["Conta", "Categorias", "Armazéns"] },
  { id: "vendas", rotulo: "Vendas", abas: ["Canais de Venda", "Transações", "Frete"] },
  { id: "fiscal-ia", rotulo: "Fiscal e IA", abas: ["Fiscal", "IA"] },
  { id: "equipe", rotulo: "Equipe e plano", abas: ["Equipe", "Plano"] },
  { id: "dados", rotulo: "Dados", abas: ["Dados"] },
];
const GRUPOS_TABS = GRUPOS.map((g) => ({ value: g.id, label: g.rotulo }));
const grupoDaAba = (a: Aba) => GRUPOS.find((g) => g.abas.includes(a)) ?? GRUPOS[0];
/** Rótulo de sub-aba quando o nome da tela não diz tudo. */
const ROTULO_SUBABA: Partial<Record<Aba, string>> = { Conta: "Conta e negócio", Transações: "Contas e pagamentos" };

/** "Canais de Venda" → "canais-de-venda": o mesmo formato que os links do sistema usam. */
const slugDaAba = (a: Aba) => a.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, "-");

/** `?aba=plano` (link do plano no topo) → "Plano". Sem parâmetro ou desconhecido: a primeira. */
function abaDaUrl(param: string | undefined): Aba {
  const alvo = (param ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return ABAS.find((a) => slugDaAba(a) === alvo) ?? "Conta";
}

export function ConfiguracoesClient({
  categorias,
  canais,
  lojas,
  contas,
  armazens,
  formasPagamento,
  perfil,
  email,
  ias,
  cofreOk,
  iaSistemaOk,
  teste,
  marketplace,
  frete,
  plano,
  fiscal,
  equipe,
  abaUrl,
  crediario = null,
}: {
  /** Pix e encargos do crediário (0065); null = migração ausente. */
  crediario?: CrediarioConfig | null;
  /** `?aba=` da URL: aba aberta ao entrar. */
  abaUrl?: string;
  /** 0063; null = migração ausente. */
  equipe: DadosEquipe | null;
  /** 0062; null = migração ausente. */
  fiscal: FiscalConfigTela | null;
  /** 0057; null = migração ausente. */
  plano: DadosPlano | null;
  /** 0055; null = migração ausente. */
  frete: FreteConfig | null;
  /** Conexões da API por loja e o estado da integração (Canais de venda). */
  marketplace: DadosMarketplaceCanais;
  categorias: Categoria[];
  canais: Canal[];
  lojas: Loja[];
  contas: Conta[];
  armazens: Armazem[];
  formasPagamento: FormaPagamento[];
  perfil: PerfilNegocio;
  email: string;
  ias: IaCadastrada[];
  cofreOk: boolean;
  iaSistemaOk: boolean;
  teste: EstadoTeste | null;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [aba, setAbaEstado] = useState<Aba>(() => abaDaUrl(abaUrl));
  // Última sub-aba vista em cada grupo: voltar ao grupo reabre onde a pessoa estava.
  const [ultimaDoGrupo, setUltimaDoGrupo] = useState<Record<string, Aba>>({});

  /**
   * Troca a aba e grava `?aba=` na URL, para recarregar, voltar ou mandar o link abrir no
   * mesmo lugar. `history.replaceState` em vez de `router.replace`: a página remonta por
   * `key={aba}` e buscaria tudo do servidor de novo a cada clique.
   */
  function setAba(nova: Aba) {
    setAbaEstado(nova);
    setUltimaDoGrupo((u) => ({ ...u, [grupoDaAba(nova).id]: nova }));
    const url = new URL(window.location.href);
    url.searchParams.set("aba", slugDaAba(nova));
    window.history.replaceState(window.history.state, "", url);
  }

  const [modalConta, setModalConta] = useState<Conta | "novo" | null>(null);
  const [modalArmazem, setModalArmazem] = useState<Armazem | "novo" | null>(null);
  const [modalFormaPagamento, setModalFormaPagamento] = useState<FormaPagamento | "novo" | null>(null);
  const [novaCategoria, setNovaCategoria] = useState("");


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

  return (
    <>
      <PageHeader title="Configurações" />

      <Tabs
        tabs={GRUPOS_TABS}
        value={grupoDaAba(aba).id}
        onChange={(id) => {
          const grupo = GRUPOS.find((g) => g.id === id);
          if (grupo) setAba(ultimaDoGrupo[grupo.id] ?? grupo.abas[0]);
        }}
        className="mb-4"
      />

      {/* O painel leva o id do GRUPO: é ele que a barra de abas controla (`aria-controls`). */}
      <TabPanel key={aba} tabValue={grupoDaAba(aba).id}>
      {grupoDaAba(aba).abas.length > 1 && (
        <ChipRow className="mb-5">
          {grupoDaAba(aba).abas.map((a) => (
            <Chip key={a} ativo={aba === a} onClick={() => setAba(a)}>
              {ROTULO_SUBABA[a] ?? a}
            </Chip>
          ))}
        </ChipRow>
      )}
      {aba === "Canais de Venda" && <AbaCanais canais={canais} lojas={lojas} marketplace={marketplace} />}

      {aba === "Categorias" && (
        <Card>
          <CardTitle>Categorias de produto</CardTitle>
          <CardSubtitle className="mb-4">O tipo separa o que você vende do que é insumo ou embalagem na precificação.</CardSubtitle>
          <div className="flex gap-2 mb-3">
            <input
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionarCategoriaHandler()}
              placeholder="Nova categoria…"
              className={inputClass}
            />
            <Button variant="secondary" onClick={adicionarCategoriaHandler} disabled={!novaCategoria.trim()}>
              <Plus size={14} /> Adicionar
            </Button>
          </div>
          <div className="space-y-2">
            {categorias.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-surface-2 rounded-md px-3 py-2">
                <span className="text-sm text-text-primary">{c.nome}</span>
                <div className="flex items-center gap-3">
                  <select
                    aria-label={`Tipo da categoria ${c.nome}`}
                    value={c.tipo ?? "produto"}
                    onChange={(e) => {
                      const tipo = e.target.value as "produto" | "insumo" | "embalagem";
                      startTransition(async () => {
                        await executarComToast(definirTipoCategoria(c.id, tipo), { sucesso: "Tipo atualizado", erro: "Erro ao mudar o tipo" });
                      });
                    }}
                    className={`${campoBase} h-8 text-xs`}
                  >
                    <option value="produto">Produto</option>
                    <option value="insumo">Insumo</option>
                    <option value="embalagem">Embalagem</option>
                  </select>
                  <span className="font-mono text-xs text-text-secondary">{c.skus} SKUs</span>
                  <IconButton aria-label={`Remover a categoria ${c.nome}`} onClick={() => removerCategoriaHandler(c)}>
                    <X size={14} />
                  </IconButton>
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
        <Card padding="nenhum">
          <CardHeader acoes={<BotaoAdicionar onClick={() => setModalArmazem("novo")}>Armazém</BotaoAdicionar>}>
            <CardTitle>Armazéns</CardTitle>
            <CardSubtitle>Onde o estoque físico fica e quais lojas cada um abastece.</CardSubtitle>
          </CardHeader>
          <div className="space-y-3 px-5 pb-5">
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
          <Card padding="nenhum">
            <CardHeader acoes={<BotaoAdicionar onClick={() => setModalConta("novo")}>Conta</BotaoAdicionar>}>
              <CardTitle>Contas (onde o dinheiro entra e sai)</CardTitle>
              <CardSubtitle>Caixa, banco, Pix ou carteira do marketplace. O saldo é atualizado pelo Financeiro.</CardSubtitle>
            </CardHeader>
            <div className="space-y-3 px-5 pb-5">
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

          <Card padding="nenhum">
            <CardHeader acoes={<BotaoAdicionar onClick={() => setModalFormaPagamento("novo")}>Forma</BotaoAdicionar>}>
              <CardTitle>Formas de pagamento</CardTitle>
              <CardSubtitle>As opções que aparecem no PDV e nas compras.</CardSubtitle>
            </CardHeader>
            <div className="space-y-3 px-5 pb-5">
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
      {aba === "Plano" && <AbaPlano dados={plano} />}
      {aba === "Fiscal" && <AbaFiscal fiscal={fiscal} cofreOk={cofreOk} />}
      {aba === "Equipe" && <AbaEquipe dados={equipe} />}
      {aba === "Frete" && <AbaFrete frete={frete} cofreOk={cofreOk} cepSugerido={perfil.empresa.cep ?? ""} />}
      {aba === "IA" && <AbaIA ias={ias} cofreOk={cofreOk} iaSistemaOk={iaSistemaOk} teste={teste} />}
      {aba === "Dados" && <AbaDados armazens={armazens.map((a) => ({ id: a.id, nome: a.nome }))} />}
      {aba === "Conta" && (
        <AbaConta perfil={perfil} email={email} crediario={crediario} />
      )}

      </TabPanel>

      <ContaModal key={`conta-${modalConta === "novo" ? "novo" : modalConta?.id ?? "fechado"}`} conta={modalConta} onClose={() => setModalConta(null)} onSave={salvarContaHandler} salvando={pending} />
      <ArmazemModal
        key={`armazem-${modalArmazem === "novo" ? "novo" : modalArmazem?.id ?? "fechado"}`}
        armazem={modalArmazem}
        lojas={lojas.map((l) => ({ id: l.id, nome: l.nome, canal: canais.find((c) => c.id === l.canal_id)?.nome ?? "" }))}
        onClose={() => setModalArmazem(null)}
        onSave={salvarArmazemHandler}
        salvando={pending}
      />
      <FormaPagamentoModal
        key={`forma-pagamento-${modalFormaPagamento === "novo" ? "novo" : modalFormaPagamento?.id ?? "fechado"}`}
        formaPagamento={modalFormaPagamento}
        onClose={() => setModalFormaPagamento(null)}
        onSave={salvarFormaPagamentoHandler}
        salvando={pending}
      />
      {ConfirmDialog}
    </>
  );
}

/** "+ Armazém", "+ Conta"…: o mesmo botão em todo cartão de cadastro (antes, metade era link solto). */
export function BotaoAdicionar({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="secondary" size="sm" onClick={onClick}>
      <Plus size={14} /> {children}
    </Button>
  );
}

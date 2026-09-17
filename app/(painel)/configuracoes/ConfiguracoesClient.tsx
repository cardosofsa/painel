"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ShoppingBag, ShoppingCart, Store, Users, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { createClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/mock-data";
import {
  criarCategoria,
  removerCategoria,
  criarLoja,
  atualizarLoja,
  removerLoja,
  criarConta,
  atualizarConta,
  removerConta,
  criarArmazem,
  atualizarArmazem,
  removerArmazem,
  salvarPerfilNegocio,
  type LojaInput,
  type ContaInput,
  type ArmazemInput,
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

const ABAS = ["Geral", "Canais de Venda", "Categorias", "Armazéns", "Contas", "Notificações", "Dados"] as const;

export function ConfiguracoesClient({
  categorias,
  canais,
  lojas,
  contas,
  armazens,
  perfil,
}: {
  categorias: Categoria[];
  canais: Canal[];
  lojas: Loja[];
  contas: Conta[];
  armazens: Armazem[];
  perfil: PerfilNegocio;
}) {
  const [, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [aba, setAba] = useState<(typeof ABAS)[number]>("Geral");

  const [modalLoja, setModalLoja] = useState<{ loja: Loja | null; canal: Canal } | null>(null);
  const [modalConta, setModalConta] = useState<Conta | "novo" | null>(null);
  const [modalArmazem, setModalArmazem] = useState<Armazem | "novo" | null>(null);
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
      <PageHeader eyebrow="Configurações" title="Configurações do Negócio" />

      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
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

      {aba === "Geral" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card>
            <h3 className="font-semibold text-text-primary mb-4">Perfil do Negócio</h3>
            <FormField label="Nome do Negócio">
              <input className={inputClass} value={nomeNegocio} onChange={(e) => setNomeNegocio(e.target.value)} />
            </FormField>
            <FormField label="CNPJ">
              <input className={inputClass} value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
            </FormField>
            <Button variant="primary" onClick={salvarPerfil}>
              Salvar Perfil
            </Button>
          </Card>

          <Card>
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
            <Button variant="primary" onClick={salvarPerfil}>
              Salvar Regime
            </Button>
          </Card>
        </div>
      )}

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
                        <div className="text-xs text-text-tertiary">Comissão por faixa de preço (tabela oficial)</div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setModalLoja({ loja: null, canal: c })}
                    className="text-sm text-accent hover:underline shrink-0"
                  >
                    + Adicionar Loja
                  </button>
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
                                ? "Faixas automáticas"
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
                        <div className="flex items-center gap-3 shrink-0">
                          <button
                            onClick={() => setModalLoja({ loja: l, canal: c })}
                            className="text-xs text-text-secondary hover:text-text-primary"
                          >
                            Editar
                          </button>
                          <button onClick={() => removerLojaHandler(l)} className="text-xs text-negative hover:underline">
                            Remover
                          </button>
                        </div>
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
            <p className="text-sm text-text-tertiary text-center">Breve mais canais disponíveis.</p>
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
            {categorias.length === 0 && <p className="text-sm text-text-tertiary">Nenhuma categoria cadastrada ainda.</p>}
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
                  <div className="flex items-center gap-3">
                    <button onClick={() => setModalArmazem(a)} className="text-xs text-text-secondary hover:text-text-primary">
                      Editar
                    </button>
                    <button onClick={() => removerArmazemHandler(a)} className="text-xs text-negative hover:underline">
                      Remover
                    </button>
                  </div>
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
            {armazens.length === 0 && <p className="text-sm text-text-tertiary">Nenhum armazém cadastrado ainda.</p>}
          </div>
        </Card>
      )}

      {aba === "Contas" && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-primary">Contas & Formas de Recebimento</h3>
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
                  <button onClick={() => setModalConta(c)} className="text-xs text-text-secondary hover:text-text-primary">
                    Editar
                  </button>
                  <button onClick={() => removerContaHandler(c)} className="text-xs text-negative hover:underline">
                    Remover
                  </button>
                </div>
              </div>
            ))}
            {contas.length === 0 && <p className="text-sm text-text-tertiary">Nenhuma conta cadastrada ainda.</p>}
          </div>
        </Card>
      )}

      {aba === "Notificações" && (
        <Card className="max-w-xl">
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
      )}

      {aba === "Dados" && (
        <Card className="max-w-xl">
          <h3 className="font-semibold text-text-primary mb-2">Backup & Exportação</h3>
          <p className="text-sm text-text-secondary mb-4">
            Baixe uma cópia dos seus dados (lojas, categorias, armazéns e contas) em JSON.
          </p>
          <Button variant="secondary" onClick={exportarDados}>
            Exportar Backup
          </Button>
        </Card>
      )}

      <LojaModal modalLoja={modalLoja} onClose={() => setModalLoja(null)} onSave={salvarLojaHandler} />
      <ContaModal conta={modalConta} onClose={() => setModalConta(null)} onSave={salvarContaHandler} />
      <ArmazemModal armazem={modalArmazem} onClose={() => setModalArmazem(null)} onSave={salvarArmazemHandler} />
      {ConfirmDialog}
    </>
  );
}

function LojaModal({
  modalLoja,
  onClose,
  onSave,
}: {
  modalLoja: { loja: Loja | null; canal: Canal } | null;
  onClose: () => void;
  onSave: (dados: LojaInput) => void;
}) {
  const loja = modalLoja?.loja ?? null;
  const canal = modalLoja?.canal;
  const [nome, setNome] = useState(loja?.nome ?? "");
  const [link, setLink] = useState(loja?.link ?? "");
  const [logoPath, setLogoPath] = useState<string | null>(loja?.logo_path ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(loja?.logo_url ?? null);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [comissaoPctStr, setComissaoPctStr] = useState(loja?.comissao_pct != null ? String(loja.comissao_pct) : "");
  const [taxaFixaStr, setTaxaFixaStr] = useState(loja?.taxa_fixa != null ? String(loja.taxa_fixa) : "");
  const [taxaExtraValorStr, setTaxaExtraValorStr] = useState(loja?.taxa_extra_valor != null ? String(loja.taxa_extra_valor) : "");
  const [taxaExtraTipo, setTaxaExtraTipo] = useState<"percentual" | "fixo">(loja?.taxa_extra_tipo ?? "percentual");

  async function enviarLogo(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Logo muito grande (máx. 3MB)");
      return;
    }
    setEnviandoLogo(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada, faça login novamente");
      const ext = file.name.split(".").pop() ?? "png";
      const caminho = `${user.id}/loja-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("canais-logos").upload(caminho, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data } = supabase.storage.from("canais-logos").getPublicUrl(caminho);
      setLogoPath(caminho);
      setLogoUrl(data.publicUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar logo");
    } finally {
      setEnviandoLogo(false);
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
        <p className="text-xs text-text-tertiary mb-4 bg-surface-2 rounded-md p-3">
          Comissão calculada automaticamente pela tabela oficial de faixas da Shopee, conforme o preço final do
          produto.
        </p>
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
}: {
  conta: Conta | "novo" | null;
  onClose: () => void;
  onSave: (dados: ContaInput) => void;
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
        <Button variant="primary" className="flex-1" onClick={() => onSave({ nome, saldo, detalhe })}>
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
}: {
  armazem: Armazem | "novo" | null;
  onClose: () => void;
  onSave: (dados: ArmazemInput) => void;
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
        >
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import {
  canaisVenda as canaisIniciais,
  categorias as categoriasIniciais,
  contas as contasIniciais,
  fornecedores,
  produtos,
  pedidosCompra,
  formatBRL,
} from "@/lib/mock-data";

type Canal = (typeof canaisIniciais)[number];
type Categoria = (typeof categoriasIniciais)[number];
type Conta = (typeof contasIniciais)[number];

const ABAS = ["Geral", "Lojas & Canais", "Categorias", "Contas", "Notificações", "Dados"] as const;

let nextCanalId = canaisIniciais.length + 1;
let nextCategoriaId = categoriasIniciais.length + 1;
let nextContaId = contasIniciais.length + 1;

export default function ConfiguracoesPage() {
  const [aba, setAba] = useState<(typeof ABAS)[number]>("Geral");

  const [canais, setCanais] = useState<Canal[]>(canaisIniciais);
  const [categorias, setCategorias] = useState<Categoria[]>(categoriasIniciais);
  const [contas, setContas] = useState<Conta[]>(contasIniciais);

  const [modalCanal, setModalCanal] = useState<Canal | "novo" | null>(null);
  const [modalConta, setModalConta] = useState<Conta | "novo" | null>(null);
  const [novaCategoria, setNovaCategoria] = useState("");

  const [nomeNegocio, setNomeNegocio] = useState("Perfumaria & Couro / Moto Parts");
  const [cnpj, setCnpj] = useState("00.000.000/0001-00");
  const [regimeTributario, setRegimeTributario] = useState("Simples Nacional — Anexo I");
  const [aliquotaDas, setAliquotaDas] = useState(6);

  const [notificacoes, setNotificacoes] = useState({
    estoqueBaixo: true,
    vencimentos: true,
    pedidosRecebidos: true,
    resumoSemanal: false,
  });

  function salvarCanal(dados: Omit<Canal, "id">) {
    if (modalCanal === "novo") {
      nextCanalId += 1;
      setCanais((prev) => [...prev, { id: `canal${nextCanalId}`, ...dados }]);
      toast.success("Loja adicionada");
    } else if (modalCanal) {
      setCanais((prev) => prev.map((c) => (c.id === modalCanal.id ? { ...c, ...dados } : c)));
      toast.success("Loja atualizada");
    }
    setModalCanal(null);
  }

  function removerCanal(id: string) {
    setCanais((prev) => prev.filter((c) => c.id !== id));
    toast("Loja removida");
  }

  function adicionarCategoria() {
    if (!novaCategoria.trim()) return;
    nextCategoriaId += 1;
    setCategorias((prev) => [...prev, { id: `cat${nextCategoriaId}`, nome: novaCategoria.trim(), skus: 0 }]);
    setNovaCategoria("");
    toast.success("Categoria adicionada");
  }

  function removerCategoria(id: string) {
    setCategorias((prev) => prev.filter((c) => c.id !== id));
    toast("Categoria removida");
  }

  function salvarConta(dados: Omit<Conta, "id">) {
    if (modalConta === "novo") {
      nextContaId += 1;
      setContas((prev) => [...prev, { id: `cta${nextContaId}`, ...dados }]);
      toast.success("Conta adicionada");
    } else if (modalConta) {
      setContas((prev) => prev.map((c) => (c.id === modalConta.id ? { ...c, ...dados } : c)));
      toast.success("Conta atualizada");
    }
    setModalConta(null);
  }

  function removerConta(id: string) {
    setContas((prev) => prev.filter((c) => c.id !== id));
    toast("Conta removida");
  }

  function salvarPerfil() {
    toast.success("Perfil do negócio salvo");
  }

  function exportarDados() {
    const snapshot = { fornecedores, produtos, pedidosCompra, canais, categorias, contas };
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

      {aba === "Lojas & Canais" && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-text-primary">Lojas / Canais de Venda</h3>
              <p className="text-sm text-text-secondary">Cada loja tem suas próprias taxas para a precificação.</p>
            </div>
            <button onClick={() => setModalCanal("novo")} className="text-sm text-accent hover:underline shrink-0">
              + Adicionar Loja
            </button>
          </div>
          <div className="space-y-3">
            {canais.map((c) => (
              <div key={c.id} className="border border-border rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-medium text-text-primary text-sm">{c.nome}</div>
                    <div className="text-xs text-text-tertiary">{c.plataforma}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setModalCanal(c)} className="text-xs text-text-secondary hover:text-text-primary">
                      Editar
                    </button>
                    <button onClick={() => removerCanal(c.id)} className="text-xs text-negative hover:underline">
                      Remover
                    </button>
                  </div>
                </div>
                <div className="flex gap-4 text-xs text-text-secondary">
                  <span>Comissão: {c.comissaoPct}%</span>
                  <span>Taxa fixa: {formatBRL(c.taxaFixa)}</span>
                  <span>{c.ciclo}</span>
                </div>
              </div>
            ))}
            {canais.length === 0 && <p className="text-sm text-text-tertiary">Nenhuma loja cadastrada ainda.</p>}
          </div>
        </Card>
      )}

      {aba === "Categorias" && (
        <Card>
          <h3 className="font-semibold text-text-primary mb-4">Categorias de Produto</h3>
          <div className="flex gap-2 mb-3">
            <input
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && adicionarCategoria()}
              placeholder="Nova categoria…"
              className={inputClass}
            />
            <Button variant="secondary" onClick={adicionarCategoria}>
              Adicionar
            </Button>
          </div>
          <div className="space-y-2">
            {categorias.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-surface-2 rounded-md px-3 py-2">
                <span className="text-sm text-text-primary">{c.nome}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-text-secondary">{c.skus} SKUs</span>
                  <button onClick={() => removerCategoria(c.id)} className="text-text-tertiary hover:text-negative text-sm">
                    ×
                  </button>
                </div>
              </div>
            ))}
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
                  <button onClick={() => removerConta(c.id)} className="text-xs text-negative hover:underline">
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
            Baixe uma cópia dos seus dados (produtos, fornecedores, pedidos, lojas, categorias e contas) em JSON.
          </p>
          <Button variant="secondary" onClick={exportarDados}>
            Exportar Backup
          </Button>
        </Card>
      )}

      <CanalModal canal={modalCanal} onClose={() => setModalCanal(null)} onSave={salvarCanal} />
      <ContaModal conta={modalConta} onClose={() => setModalConta(null)} onSave={salvarConta} />
    </>
  );
}

function CanalModal({
  canal,
  onClose,
  onSave,
}: {
  canal: Canal | "novo" | null;
  onClose: () => void;
  onSave: (dados: Omit<Canal, "id">) => void;
}) {
  const base = canal && canal !== "novo" ? canal : { nome: "", plataforma: "Shopee", comissaoPct: 0, taxaFixa: 0, ciclo: "" };
  const [nome, setNome] = useState(base.nome);
  const [plataforma, setPlataforma] = useState(base.plataforma);
  const [comissaoPct, setComissaoPct] = useState(base.comissaoPct);
  const [taxaFixa, setTaxaFixa] = useState(base.taxaFixa);
  const [ciclo, setCiclo] = useState(base.ciclo);

  return (
    <Modal open={!!canal} onClose={onClose} title={canal === "novo" ? "Adicionar Loja" : "Editar Loja"}>
      <FormField label="Nome da Loja">
        <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} />
      </FormField>
      <FormField label="Plataforma">
        <input className={inputClass} value={plataforma} onChange={(e) => setPlataforma(e.target.value)} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Comissão (%)">
          <input type="number" step="0.1" className={inputClass} value={comissaoPct} onChange={(e) => setComissaoPct(Number(e.target.value) || 0)} />
        </FormField>
        <FormField label="Taxa Fixa (R$)">
          <input type="number" step="0.01" className={inputClass} value={taxaFixa} onChange={(e) => setTaxaFixa(Number(e.target.value) || 0)} />
        </FormField>
      </div>
      <FormField label="Ciclo de Liquidação">
        <input className={inputClass} value={ciclo} onChange={(e) => setCiclo(e.target.value)} placeholder="Ex: D+3 após entrega" />
      </FormField>
      <div className="flex gap-2 mt-5">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => onSave({ nome, plataforma, comissaoPct, taxaFixa, ciclo })}>
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
  onSave: (dados: Omit<Conta, "id">) => void;
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

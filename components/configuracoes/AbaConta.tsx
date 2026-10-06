"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/Badge";
import { executarComToast } from "@/lib/acao-cliente";
import { ContaCard } from "@/app/(painel)/configuracoes/ContaCard";
import { DadosEmpresaCard } from "@/components/configuracoes/DadosEmpresaCard";
import { CrediarioCard } from "@/components/configuracoes/CrediarioCard";
import {
  salvarPerfilNegocio,
  definirPinAdmin,
  type PerfilNegocioInput,
  type CrediarioConfig,
} from "@/app/(painel)/configuracoes/actions";
import type { PerfilNegocio } from "@/app/(painel)/configuracoes/ConfiguracoesClient";

/** Aba "Conta": perfil do negócio, dados da empresa, PIN, regime tributário e backup. */
export function AbaConta({
  perfil,
  email,
  backup,
  crediario = null,
}: {
  /** 0065; null = migração ausente. */
  crediario?: CrediarioConfig | null;
  perfil: PerfilNegocio;
  email: string;
  /** O que o botão "Exportar Backup" grava no JSON. */
  backup: unknown;
}) {
  const [pending, startTransition] = useTransition();
  const [nomeNegocio, setNomeNegocio] = useState(perfil.nome_negocio);
  const [cnpj, setCnpj] = useState(perfil.cnpj);
  const [regimeTributario, setRegimeTributario] = useState(perfil.regime_tributario);
  const [aliquotaDas, setAliquotaDas] = useState(perfil.aliquota_das);
  const [whatsapp, setWhatsapp] = useState(perfil.whatsapp);
  // Campo write-only: começa sempre vazio, mesmo quando já existe um PIN cadastrado.
  const [pinAdmin, setPinAdmin] = useState("");

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
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "painel-backup.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup exportado");
  }

  return (
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

    <DadosEmpresaCard inicial={perfil.empresa} />

    <CrediarioCard inicial={crediario} nomePadrao={perfil.nome_negocio} cidadePadrao={perfil.empresa.cidade ?? ""} />

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
  );
}

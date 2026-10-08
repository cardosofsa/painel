"use client";
import { CampoNumero } from "@/components/ui/CampoNumero";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/Badge";
import { executarComToast } from "@/lib/acao-cliente";
import { ContaCard } from "@/app/(painel)/configuracoes/ContaCard";
import { DadosEmpresaCard } from "@/components/configuracoes/DadosEmpresaCard";
import { CrediarioCard } from "@/components/configuracoes/CrediarioCard";
import { DuasEtapasCard } from "@/components/configuracoes/DuasEtapasCard";
import {
  salvarPerfilNegocio,
  definirPinAdmin,
  type PerfilNegocioInput,
  type CrediarioConfig,
} from "@/app/(painel)/configuracoes/actions";
import type { PerfilNegocio } from "@/app/(painel)/configuracoes/ConfiguracoesClient";

/** O campo era texto livre; a lista cobre o que um pequeno negócio usa. Valor antigo fora dela continua aparecendo. */
const REGIMES = ["MEI", "Simples Nacional", "Lucro Presumido", "Lucro Real"];

/**
 * Aba "Conta e negócio": acesso (e-mail e senha), PIN, verificação em duas etapas, dados do
 * negócio, dados da empresa e Pix/crediário.
 *
 * Antes eram dois cartões ("Perfil" e "Regime") com dois botões que salvavam os MESMOS
 * cinco campos, e um `pending` só fazia os botões de Perfil, PIN e Regime girarem juntos.
 * O "Exportar Backup" daqui gravava só 4 tabelas: o backup completo mora na aba Dados.
 */
export function AbaConta({
  perfil,
  email,
  crediario = null,
}: {
  /** 0065; null = migração ausente. */
  crediario?: CrediarioConfig | null;
  perfil: PerfilNegocio;
  email: string;
}) {
  const [salvandoPerfil, startPerfil] = useTransition();
  const [salvandoPin, startPin] = useTransition();
  const [nomeNegocio, setNomeNegocio] = useState(perfil.nome_negocio);
  const [cnpj, setCnpj] = useState(perfil.cnpj);
  const [regimeTributario, setRegimeTributario] = useState(perfil.regime_tributario);
  const [aliquotaDas, setAliquotaDas] = useState(perfil.aliquota_das);
  const [whatsapp, setWhatsapp] = useState(perfil.whatsapp);
  // Campo write-only: começa sempre vazio, mesmo quando já existe um PIN cadastrado.
  const [pinAdmin, setPinAdmin] = useState("");
  const [pinAtual, setPinAtual] = useState("");
  const regimes = regimeTributario && !REGIMES.includes(regimeTributario) ? [regimeTributario, ...REGIMES] : REGIMES;

  function salvarPerfil() {
    const dados: PerfilNegocioInput = {
      nome_negocio: nomeNegocio,
      cnpj,
      regime_tributario: regimeTributario,
      aliquota_das: aliquotaDas,
      whatsapp: whatsapp.trim() || null,
    };
    startPerfil(async () => {
      await executarComToast(salvarPerfilNegocio(dados), { sucesso: "Dados do negócio salvos", erro: "Erro ao salvar" });
    });
  }

  function salvarPin() {
    const pin = pinAdmin.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) {
      toast.error("O PIN deve ter de 4 a 8 números.");
      return;
    }
    startPin(async () => {
      const r = await executarComToast(definirPinAdmin(pin || null, pinAtual.trim() || null), { erro: "Erro ao salvar PIN" });
      if (r.ok) {
        setPinAdmin("");
        setPinAtual("");
        toast.success(pin ? "PIN atualizado" : "PIN removido — a edição de vendas fica bloqueada");
      }
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-stretch">
      <Card className="lg:col-span-2">
        <CardTitle>Dados do negócio</CardTitle>
        <CardSubtitle className="mb-4">Nome, documento e imposto usados no PDV, no catálogo e na precificação.</CardSubtitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <FormField label="Nome do negócio">
            <input className={inputClass} value={nomeNegocio} onChange={(e) => setNomeNegocio(e.target.value)} />
          </FormField>
          <FormField label="CNPJ">
            <input className={inputClass} value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="00.000.000/0000-00" />
          </FormField>
          <FormField label="WhatsApp do negócio" dica="Recebe os pedidos do botão Comprar do catálogo.">
            <input className={inputClass} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="Ex: 11987654321" />
          </FormField>
          <FormField label="Regime tributário">
            <select className={inputClass} value={regimeTributario} onChange={(e) => setRegimeTributario(e.target.value)}>
              <option value="">Selecione…</option>
              {regimes.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Alíquota efetiva do imposto (%)" dica="Valor padrão do campo Imposto/DAS na Precificação.">
            <CampoNumero className={inputClass} value={aliquotaDas} onChange={(n) => setAliquotaDas(n)} />
          </FormField>
        </div>
        <Button variant="primary" onClick={salvarPerfil} loading={salvandoPerfil}>
          Salvar dados do negócio
        </Button>
      </Card>

      <DadosEmpresaCard inicial={perfil.empresa} />

      <ContaCard email={email} />

      <Card className="h-full flex flex-col">
        <div className="flex items-center gap-2">
          <CardTitle>PIN de administração</CardTitle>
          <StatusChip label={perfil.pin_configurado ? "Cadastrado" : "Não cadastrado"} tone={perfil.pin_configurado ? "positive" : "neutral"} />
        </div>
        <CardSubtitle className="mb-4">Pedido antes de editar uma venda já finalizada e para liberar operadores.</CardSubtitle>
        {perfil.pin_configurado && (
          <FormField label="PIN atual" dica="Esqueceu? Saia e entre de novo com a senha: nos 10 minutos seguintes a troca não pede o PIN atual.">
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              className={inputClass}
              value={pinAtual}
              onChange={(e) => setPinAtual(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
          </FormField>
        )}
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
          O PIN é guardado cifrado e nunca é exibido de volta — para trocar, digite um novo.
          {perfil.pin_configurado && " Salvar com o campo vazio remove o PIN e bloqueia a edição de vendas."}
        </p>
        <div className="mt-auto pt-2">
          <Button variant="primary" onClick={salvarPin} loading={salvandoPin}>
            {perfil.pin_configurado ? "Trocar PIN" : "Salvar PIN"}
          </Button>
        </div>
      </Card>

      <DuasEtapasCard />

      <div className="lg:col-span-2">
        <CrediarioCard inicial={crediario} nomePadrao={perfil.nome_negocio} cidadePadrao={perfil.empresa.cidade ?? ""} />
      </div>
    </div>
  );
}

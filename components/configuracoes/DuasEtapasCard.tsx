"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/Badge";
import { executarComToast } from "@/lib/acao-cliente";
import { formatarData } from "@/lib/format";
import { DIGITOS_CODIGO, codigoCompleto, limparCodigo, segredoEmGrupos, type StatusMfa } from "@/lib/mfa";
import {
  cancelarDuasEtapas,
  confirmarDuasEtapas,
  desativarDuasEtapas,
  iniciarDuasEtapas,
  statusDuasEtapas,
  type InicioDuasEtapas,
} from "@/app/(painel)/configuracoes/mfa-actions";

/**
 * Cartão "Verificação em duas etapas" (MFA TOTP do Supabase Auth).
 *
 * O status vem do Auth, não do banco, e é buscado aqui na montagem em vez de no `page.tsx`:
 * a lista de fatores exige uma ida à GoTrue (`getUser`), e só faz sentido pagá-la quando a
 * aba da conta é aberta — não a cada visita a qualquer aba de Configurações.
 */
export function DuasEtapasCard() {
  const [status, setStatus] = useState<StatusMfa | null>(null);
  const [erroStatus, setErroStatus] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [inicio, setInicio] = useState<InicioDuasEtapas | null>(null);
  const [desativando, setDesativando] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [ocupado, startOcupado] = useTransition();

  useEffect(() => {
    let vivo = true;
    void executarComToast(statusDuasEtapas(), { erro: "Não foi possível ver o status da verificação em duas etapas." }).then((r) => {
      if (!vivo) return;
      if (r.ok) setStatus(r.dado);
      else setErroStatus(r.erro);
    });
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  function ativar() {
    startOcupado(async () => {
      const r = await executarComToast(iniciarDuasEtapas(), { erro: "Não foi possível começar a ativação. Tente de novo." });
      if (r.ok) {
        setInicio(r.dado);
        setCodigo("");
      }
    });
  }

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!inicio) return;
    if (!codigoCompleto(codigo)) {
      toast.error("Digite os 6 números que aparecem no app autenticador.");
      return;
    }
    startOcupado(async () => {
      const r = await executarComToast(confirmarDuasEtapas(inicio.fatorId, codigo), {
        sucesso: "Verificação em duas etapas ativada.",
        erro: "Não foi possível confirmar o código. Tente de novo.",
      });
      setCodigo("");
      if (r.ok) {
        setStatus(r.dado);
        setInicio(null);
      }
    });
  }

  function cancelarAtivacao() {
    const fatorId = inicio?.fatorId;
    setInicio(null);
    setCodigo("");
    // O fator pela metade expira sozinho no Supabase; apagar agora só evita o resto.
    if (!fatorId) return;
    startOcupado(async () => {
      await executarComToast(cancelarDuasEtapas(fatorId), { erro: "Não foi possível cancelar a ativação." });
    });
  }

  function desativar(e: React.FormEvent) {
    e.preventDefault();
    if (!codigoCompleto(codigo)) {
      toast.error("Digite os 6 números que aparecem no app autenticador.");
      return;
    }
    startOcupado(async () => {
      const r = await executarComToast(desativarDuasEtapas(codigo), {
        sucesso: "Verificação em duas etapas desativada.",
        erro: "Não foi possível desativar. Tente de novo.",
      });
      setCodigo("");
      if (r.ok) {
        setStatus(r.dado);
        setDesativando(false);
      }
    });
  }

  async function copiarSegredo() {
    if (!inicio) return;
    try {
      await navigator.clipboard.writeText(inicio.segredo);
      toast.success("Código copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie o código à mão.");
    }
  }

  const ativo = !!status?.ativo;

  const campoCodigo = (
    <FormField label="Código de 6 números do app">
      <input
        className={`${inputClass} font-mono tracking-[0.3em]`}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={DIGITOS_CODIGO + 2}
        placeholder="000000"
        value={codigo}
        onChange={(e) => setCodigo(limparCodigo(e.target.value))}
        autoFocus
      />
    </FormField>
  );

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center gap-2 flex-wrap">
        <CardTitle>Verificação em duas etapas</CardTitle>
        {status && <StatusChip label={ativo ? "Ativada" : "Desativada"} tone={ativo ? "positive" : "neutral"} />}
      </div>
      <CardSubtitle className="mb-4">
        Além da senha, a entrada pede o código de 6 números do app autenticador do celular (Google Authenticator, Microsoft Authenticator, 1Password…).
      </CardSubtitle>

      {!status && !erroStatus && <p className="text-sm text-text-tertiary">Carregando…</p>}

      {erroStatus && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-negative">
            {erroStatus}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setErroStatus(null);
              setTentativa((t) => t + 1);
            }}
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {status && ativo && !desativando && (
        <div className="mt-auto flex flex-col gap-4">
          <p className="flex items-start gap-2 text-sm text-text-secondary">
            <ShieldCheck size={18} className="text-positive shrink-0 mt-0.5" aria-hidden />
            <span>
              Ativada{status.desde ? ` desde ${formatarData(status.desde)}` : ""}. Toda entrada nesta conta pede o código do app.
            </span>
          </p>
          <div>
            <Button variant="destructive" onClick={() => setDesativando(true)}>
              Desativar
            </Button>
          </div>
        </div>
      )}

      {status && ativo && desativando && (
        <form onSubmit={desativar} className="mt-auto">
          <p className="text-sm text-text-secondary mb-4">Para desativar, confirme com o código que está aparecendo agora no app.</p>
          {campoCodigo}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="destructive" loading={ocupado}>
              Confirmar desativação
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDesativando(false);
                setCodigo("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {status && !ativo && !inicio && (
        <div className="mt-auto">
          <Button variant="primary" onClick={ativar} loading={ocupado}>
            Ativar
          </Button>
        </div>
      )}

      {status && !ativo && inicio && (
        <form onSubmit={confirmar} className="flex flex-col">
          <ol className="text-sm text-text-secondary space-y-1 mb-4 list-decimal pl-5">
            <li>No app autenticador, toque em adicionar conta e leia o QR Code.</li>
            <li>Digite abaixo o código de 6 números que o app mostrar.</li>
          </ol>
          <div className="grid grid-cols-1 sm:grid-cols-[auto_minmax(0,1fr)] gap-4 items-start mb-4">
            {inicio.qr && (
              // QR em data URI (SVG): o `next/image` não otimiza data URI e só atrapalharia.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={inicio.qr} alt="QR Code para cadastrar a conta no app autenticador" width={176} height={176} className="rounded-md bg-marca-texto p-2 w-44 h-44" />
            )}
            <div className="min-w-0">
              <span className="block text-xs font-medium text-text-secondary mb-1.5">Sem câmera? Digite este código no app</span>
              <div className="flex items-center gap-2">
                <code className="font-mono text-sm text-text-primary bg-surface-2 rounded-md px-2 py-1.5 break-all select-all">{segredoEmGrupos(inicio.segredo)}</code>
                <Button type="button" variant="ghost" size="sm" onClick={copiarSegredo} aria-label="Copiar código">
                  <Copy size={16} aria-hidden />
                </Button>
              </div>
              {/* No celular não dá para ler o QR da própria tela: o link abre o app direto. */}
              <a href={inicio.uri} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline mt-3 sm:hidden">
                <Smartphone size={16} aria-hidden /> Abrir no app autenticador
              </a>
            </div>
          </div>
          {campoCodigo}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" loading={ocupado}>
              Confirmar e ativar
            </Button>
            <Button type="button" variant="ghost" onClick={cancelarAtivacao} disabled={ocupado}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

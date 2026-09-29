"use client";

import { useState, useTransition } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/Modal";
import { CampoArquivo } from "@/components/ui/CampoArquivo";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { CamposEndereco } from "@/components/clientes/CamposEndereco";
import { useSupabaseUpload } from "@/lib/hooks/useSupabaseUpload";
import { executarComToast } from "@/lib/acao-cliente";
import { salvarDadosEmpresa, type DadosEmpresaInput } from "@/app/(painel)/configuracoes/actions";

/**
 * Logo, contato e endereço da empresa — o cabeçalho de todo comprovante. O nome e o CNPJ
 * continuam no card "Perfil do Negócio"; aqui só o que é novo (migração 0032).
 *
 * O logo vai para o bucket `produtos`, o mesmo do logo da vitrine (`AparenciaModal`), que já
 * tem leitura pública e escrita restrita à pasta do próprio usuário.
 */
export function DadosEmpresaCard({ inicial }: { inicial: DadosEmpresaInput }) {
  const [pending, startTransition] = useTransition();
  const [dados, setDados] = useState<DadosEmpresaInput>(inicial);
  const { enviar, enviando } = useSupabaseUpload("produtos");

  async function enviarLogo(file: File) {
    const r = await enviar(file, { maxSizeMb: 3, tiposAceitos: ["image/"], prefixo: "logo-empresa" });
    if (r) setDados((prev) => ({ ...prev, logo_url: r.publicUrl }));
  }

  function salvar() {
    startTransition(async () => {
      await executarComToast(salvarDadosEmpresa(dados), {
        sucesso: "Dados da empresa salvos",
        erro: "Erro ao salvar dados da empresa",
      });
    });
  }

  return (
    <Card className="lg:col-span-2">
      <h3 className="font-semibold text-text-primary mb-1">Dados da Empresa</h3>
      <p className="text-xs text-text-tertiary mb-4">Aparecem no cabeçalho do comprovante de venda.</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
        <div>
          <FormField label="Logo">
            <div className="flex flex-wrap items-center gap-3">
              {dados.logo_url ? (
                <ImagemStorage
                  src={dados.logo_url}
                  alt="Logo da empresa"
                  className="w-14 h-14 rounded-md object-contain border border-border bg-surface-2"
                />
              ) : (
                <div className="w-14 h-14 rounded-md border border-border bg-surface-2 flex items-center justify-center text-text-tertiary">
                  <Building2 size={20} />
                </div>
              )}
              <CampoArquivo onArquivo={enviarLogo} disabled={enviando} />
              {dados.logo_url && !enviando && (
                <button
                  type="button"
                  onClick={() => setDados((prev) => ({ ...prev, logo_url: null }))}
                  className="text-xs text-negative hover:underline"
                >
                  Remover
                </button>
              )}
            </div>
          </FormField>
          <FormField label="Telefone">
            <input
              className={inputClass}
              value={dados.telefone ?? ""}
              onChange={(e) => setDados({ ...dados, telefone: e.target.value || null })}
              placeholder="(11) 3333-4444"
            />
          </FormField>
          <FormField label="E-mail">
            <input
              className={inputClass}
              value={dados.email ?? ""}
              onChange={(e) => setDados({ ...dados, email: e.target.value || null })}
            />
          </FormField>
          <FormField label="Instagram">
            <input
              className={inputClass}
              value={dados.instagram ?? ""}
              onChange={(e) => setDados({ ...dados, instagram: e.target.value || null })}
              placeholder="@minhaloja"
            />
          </FormField>
        </div>

        <div>
          <CamposEndereco valor={dados} comComplemento={false} onChange={(patch) => setDados((prev) => ({ ...prev, ...patch }))} />
        </div>
      </div>

      <Button variant="primary" onClick={salvar} loading={pending} disabled={enviando}>
        Salvar Dados da Empresa
      </Button>
    </Card>
  );
}

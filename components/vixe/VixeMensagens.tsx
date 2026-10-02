"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, MessageCircle, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { linkWhatsapp, textoResumoDia, ROTULO_ASSUNTO, type AssuntoMensagem } from "@/lib/whatsapp";
import type { DadosMensagens } from "@/lib/vixe/mensagens-servidor";
import { marcarMensagemEnviada } from "@/app/(painel)/vixe/mensagens/actions";

const TOM: Record<AssuntoMensagem, string> = {
  pedido: "bg-surface-2 text-text-secondary",
  pago: "bg-positive-soft text-positive",
  enviado: "bg-accent-soft text-accent",
  fiado: "bg-negative-soft text-negative",
};

/**
 * Vixe → Mensagens (11.6): avisos prontos para cada cliente e o resumo do dia. Um clique
 * abre o WhatsApp com o texto; a mensagem sai da lista (fica registrada como enviada).
 */
export function VixeMensagens({ dados }: { dados: DadosMensagens }) {
  const [, startTransition] = useTransition();
  const [feitas, setFeitas] = useState<Set<string>>(new Set());
  const lista = dados.mensagens.filter((m) => !feitas.has(m.chave));
  const resumo = textoResumoDia(dados.resumo, dados.loja);

  function marcar(chave: string) {
    setFeitas((s) => new Set(s).add(chave));
    startTransition(async () => {
      const r = await marcarMensagemEnviada(chave);
      if (!r.ok) toast.error(r.erro);
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
      <div className="space-y-3">
        {!dados.registroOk && <p className="text-xs text-negative">Sem a migração 0061 o SERTÃO não lembra o que já foi enviado: a lista volta ao recarregar.</p>}
        {lista.length === 0 ? (
          <Card>
            <EmptyState icon={MessageCircle} title="Nenhum aviso pendente" description="Quando um pedido chegar, sair para entrega ou um fiado estiver vencendo, a mensagem pronta aparece aqui." />
          </Card>
        ) : (
          lista.map((m) => (
            <Card key={m.chave} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${TOM[m.assunto]}`}>{ROTULO_ASSUNTO[m.assunto]}</span>
                  <span className="font-medium text-text-primary truncate">{m.cliente || "Cliente"}</span>
                  <span className="text-xs font-mono text-text-tertiary">{m.referencia}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" className="text-xs text-text-tertiary hover:text-text-primary px-2" onClick={() => marcar(m.chave)}>
                    Pular
                  </button>
                  <a href={linkWhatsapp(m.whatsapp, m.texto)} target="_blank" rel="noopener noreferrer" onClick={() => marcar(m.chave)}>
                    <Button size="sm" variant="primary">
                      <Send size={13} /> Enviar no WhatsApp
                    </Button>
                  </a>
                </div>
              </div>
              <p className="text-sm text-text-secondary whitespace-pre-wrap">{m.texto}</p>
            </Card>
          ))
        )}
      </div>

      <Card className="space-y-3">
        <h3 className="text-sm font-medium text-text-primary">Resumo do dia</h3>
        <pre className="text-xs text-text-secondary whitespace-pre-wrap font-sans bg-surface-2 rounded-md p-3">{resumo}</pre>
        <div className="flex gap-2">
          <a href={linkWhatsapp(dados.whatsappDono, resumo)} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="primary" className="w-full">
              <Send size={14} /> Mandar para mim
            </Button>
          </a>
          <Button
            variant="secondary"
            onClick={() =>
              navigator.clipboard
                .writeText(resumo)
                .then(() => toast.success("Resumo copiado."))
                .catch(() => toast.error("Não deu para copiar."))
            }
          >
            <Copy size={14} />
          </Button>
        </div>
        {!dados.whatsappDono && <p className="text-[11px] text-text-tertiary">Cadastre o WhatsApp da loja em Configurações → Conta para o botão já abrir na sua conversa.</p>}
      </Card>
    </div>
  );
}

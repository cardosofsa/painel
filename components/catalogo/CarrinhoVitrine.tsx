"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, ShoppingCart, Trash2, MessageCircle } from "lucide-react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatBRL } from "@/lib/format";
import {
  MAX_QTD,
  MAX_OBSERVACAO,
  totalCarrinho,
  quantidadeTotal,
  textoPedidoVitrine,
  linkPedidoWhatsapp,
  type ItemCarrinhoVitrine,
} from "@/lib/vitrine-pedido";

/**
 * Barra fixa no rodapé da vitrine, que abre o carrinho.
 *
 * Só aparece com item dentro: numa vitrine sendo só olhada, uma barra permanente rouba
 * espaço de tela justo no celular, que é de onde quase todo mundo abre o link.
 */
export function BarraCarrinho({ itens, onAbrir }: { itens: ItemCarrinhoVitrine[]; onAbrir: () => void }) {
  if (itens.length === 0) return null;
  const pecas = quantidadeTotal(itens);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 p-3 bg-surface-1/95 backdrop-blur-sm border-t border-border print:hidden">
      <div className="max-w-5xl mx-auto">
        <Button variant="primary" className="w-full h-11" onClick={onAbrir}>
          <ShoppingCart size={16} />
          Ver carrinho · {pecas} {pecas === 1 ? "item" : "itens"} · {formatBRL(totalCarrinho(itens))}
        </Button>
      </div>
    </div>
  );
}

type Etapa = "carrinho" | "dados";

export function CarrinhoVitrine({
  aberto,
  onFechar,
  itens,
  slug,
  nomeCatalogo,
  negocioWhatsapp,
  onMudarQuantidade,
  onRemover,
  onEnviado,
}: {
  aberto: boolean;
  onFechar: () => void;
  itens: ItemCarrinhoVitrine[];
  slug: string;
  nomeCatalogo: string;
  negocioWhatsapp: string | null;
  onMudarQuantidade: (produtoId: string, quantidade: number) => void;
  onRemover: (produtoId: string) => void;
  onEnviado: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>("carrinho");
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  /**
   * Gerada uma vez por tentativa de checkout, não por clique: é o que faz duplo-toque em
   * "Enviar" e retry de rede devolverem o mesmo pedido em vez de criarem dois.
   */
  const [idempotencia, setIdempotencia] = useState(() => crypto.randomUUID());
  /**
   * Instantâneo do pedido enviado. Guarda os ITENS junto de propósito: quem chama limpa o
   * carrinho no `onEnviado`, e a mensagem do WhatsApp é montada depois disso — lendo a
   * lista viva, ela sairia vazia.
   */
  const [enviado, setEnviado] = useState<{ numero: string; total: number; itens: ItemCarrinhoVitrine[] } | null>(null);

  const total = totalCarrinho(itens);

  async function enviar() {
    setEnviando(true);
    try {
      const resposta = await fetch("/api/vitrine/pedido", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          nome,
          whatsapp,
          observacao: observacao.trim() || null,
          idempotencia,
          itens: itens.map((i) => ({ produto_id: i.produto_id, quantidade: i.quantidade })),
        }),
      });
      const corpo = await resposta.json().catch(() => ({}));

      if (!resposta.ok) {
        toast.error(corpo?.erro ?? "Não foi possível enviar o pedido.");
        // Chave nova: a anterior pode ter sido consumida por uma tentativa que passou pela
        // metade, e reusá-la devolveria o pedido errado.
        setIdempotencia(crypto.randomUUID());
        return;
      }

      setEnviado({ numero: corpo.numero, total: corpo.total, itens });
      onEnviado();
    } catch {
      toast.error("Sem conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  // O pedido já está gravado; a mensagem é o aviso, e carrega o número para o dono achar
  // a lista completa no painel mesmo que o cliente não envie nada depois.
  const linkWhatsapp = enviado
    ? linkPedidoWhatsapp(
        textoPedidoVitrine({
          numero: enviado.numero,
          nomeCatalogo,
          itens: enviado.itens,
          total: enviado.total,
          nomeCliente: nome,
          observacao: observacao.trim() || null,
        }),
        negocioWhatsapp,
      )
    : "#";

  return (
    <Modal
      open={aberto}
      onClose={onFechar}
      title={enviado ? "Pedido registrado" : etapa === "carrinho" ? "Seu carrinho" : "Seus dados"}
      width="max-w-lg"
    >
      {enviado ? (
        <div className="text-center">
          <div className="font-mono text-2xl font-semibold text-accent mb-1">{enviado.numero}</div>
          <p className="text-sm text-text-secondary mb-1">
            Total de {formatBRL(enviado.total)}. Já avisamos a loja.
          </p>
          <p className="text-xs text-text-tertiary mb-5">
            Mande a mensagem abaixo para combinar pagamento e entrega.
          </p>
          <a href={linkWhatsapp} target="_blank" rel="noopener noreferrer" className="block">
            <Button variant="primary" className="w-full h-11">
              <MessageCircle size={16} />
              Enviar no WhatsApp
            </Button>
          </a>
        </div>
      ) : etapa === "carrinho" ? (
        <>
          {itens.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Seu carrinho está vazio" description="Toque num produto para adicionar." />
          ) : (
            <>
              <div className="space-y-2 mb-4 max-h-80 overflow-y-auto">
                {itens.map((i) => (
                  <div key={i.produto_id} className="flex items-center gap-3 border border-border rounded-md p-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-text-primary truncate">{i.nome}</div>
                      <div className="text-xs text-text-tertiary font-mono">{formatBRL(i.preco)} cada</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <IconButton
                        onClick={() => onMudarQuantidade(i.produto_id, i.quantidade - 1)}
                        disabled={i.quantidade <= 1}
                        aria-label={`Diminuir ${i.nome}`}
                      >
                        <Minus size={14} />
                      </IconButton>
                      <span className="font-mono text-sm w-7 text-center tabular">{i.quantidade}</span>
                      <IconButton
                        onClick={() => onMudarQuantidade(i.produto_id, i.quantidade + 1)}
                        disabled={i.quantidade >= MAX_QTD}
                        aria-label={`Aumentar ${i.nome}`}
                      >
                        <Plus size={14} />
                      </IconButton>
                      <IconButton onClick={() => onRemover(i.produto_id)} aria-label={`Remover ${i.nome}`}>
                        <Trash2 size={14} className="text-negative" />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border mb-4">
                <span className="text-sm text-text-secondary">Total</span>
                <span className="font-mono text-lg font-semibold text-text-primary">{formatBRL(total)}</span>
              </div>

              <Button variant="primary" className="w-full h-11" onClick={() => setEtapa("dados")}>
                Continuar
              </Button>
            </>
          )}
        </>
      ) : (
        <>
          <FormField label="Seu nome">
            <input className={inputClass} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como devemos te chamar" />
          </FormField>
          <FormField label="Seu WhatsApp" dica="Com DDD. É por aqui que a loja vai te responder.">
            <input
              className={inputClass}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              inputMode="tel"
              placeholder="(11) 99999-8888"
            />
          </FormField>
          <FormField label="Observação (opcional)">
            <textarea
              className={`${inputClass} h-20 py-2 resize-none`}
              value={observacao}
              maxLength={MAX_OBSERVACAO}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ponto de referência, cor preferida, prazo…"
            />
          </FormField>

          <div className="flex items-center justify-between py-3 border-t border-border mb-3">
            <span className="text-sm text-text-secondary">Total</span>
            <span className="font-mono text-lg font-semibold text-text-primary">{formatBRL(total)}</span>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setEtapa("carrinho")} disabled={enviando}>
              Voltar
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={enviar}
              loading={enviando}
              disabled={!nome.trim() || whatsapp.replace(/\D/g, "").length < 10}
            >
              Enviar pedido
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

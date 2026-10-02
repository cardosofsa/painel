"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Minus, Plus, ShoppingCart, Trash2, MessageCircle, Save, Share2, RotateCcw } from "lucide-react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button, IconButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CamposEndereco, type EnderecoForm } from "@/components/clientes/CamposEndereco";
import { formatBRL } from "@/lib/format";
import { buscarCepPublico } from "@/lib/cep-publico";
import { enderecoEmLinha } from "@/lib/comprovante";
import { FreteVitrine, type OpcaoFrete } from "./FreteVitrine";
import {
  MAX_QTD,
  MAX_OBSERVACAO,
  totalCarrinho,
  textoPedidoVitrine,
  linkPedidoWhatsapp,
  type ItemCarrinhoVitrine,
} from "@/lib/vitrine-pedido";

type Etapa = "carrinho" | "dados";

const ENDERECO_VAZIO: EnderecoForm = { cep: null, endereco: null, numero: null, bairro: null, cidade: null, uf: null };

export function CarrinhoVitrine({
  aberto,
  onFechar,
  itens,
  slug,
  nomeCatalogo,
  negocioWhatsapp,
  onMudarQuantidade,
  onTrocarVariante,
  onRemover,
  onEnviado,
  onSalvar,
  onCompartilhar,
  salvoQuantidade,
  onRestaurar,
  formasPagamento = [],
  freteAtivo = false,
}: {
  /** O catálogo cota frete no checkout (0055). */
  freteAtivo?: boolean;
  /** Formas que o catálogo aceita (0051). Vazio = não pergunta. */
  formasPagamento?: string[];
  aberto: boolean;
  onFechar: () => void;
  itens: ItemCarrinhoVitrine[];
  slug: string;
  nomeCatalogo: string;
  negocioWhatsapp: string | null;
  onMudarQuantidade: (produtoId: string, quantidade: number) => void;
  onTrocarVariante: (produtoId: string, novoProdutoId: string) => void;
  onRemover: (produtoId: string) => void;
  onEnviado: () => void;
  onSalvar: () => void;
  onCompartilhar: () => void;
  /** Quantos itens há no carrinho salvo do navegador (0 = nenhum). */
  salvoQuantidade: number;
  onRestaurar: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>("carrinho");
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [endereco, setEndereco] = useState<EnderecoForm>(ENDERECO_VAZIO);
  const [observacao, setObservacao] = useState("");
  const [formaPagamento, setFormaPagamento] = useState<string | null>(null);
  const [frete, setFrete] = useState<OpcaoFrete | null>(null);
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
  const [enviado, setEnviado] = useState<{ numero: string; total: number; itens: ItemCarrinhoVitrine[]; frete: { servico: string; valor: number; prazoDias: number | null } | null } | null>(null);

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
          email: email.trim(),
          cep: endereco.cep ?? "",
          logradouro: endereco.endereco,
          numero: endereco.numero,
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          uf: endereco.uf ?? "",
          observacao: observacao.trim() || null,
          idempotencia,
          forma_pagamento: formaPagamento,
          frete,
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

      setEnviado({ numero: corpo.numero, total: corpo.total, itens, frete: corpo.frete ?? null });
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
          frete: enviado.frete,
          nomeCliente: nome,
          observacao: observacao.trim() || null,
          pagamento: formaPagamento,
          entrega: enderecoEmLinha({ ...endereco }),
          linkPainel: `${window.location.origin}/vendas?pedido=${encodeURIComponent(enviado.numero)}`,
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
            Total de {formatBRL(enviado.total + (enviado.frete?.valor ?? 0))}{enviado.frete ? ` com frete (${enviado.frete.servico})` : ""}. Já avisamos a loja.
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
            <div>
              <EmptyState icon={ShoppingCart} title="Seu carrinho está vazio" description="Toque num produto para adicionar." />
              {salvoQuantidade > 0 && (
                <Button variant="secondary" className="w-full mt-2" onClick={onRestaurar}>
                  <RotateCcw size={14} />
                  Restaurar carrinho salvo ({salvoQuantidade} {salvoQuantidade === 1 ? "item" : "itens"})
                </Button>
              )}
              <Button variant="primary" className="w-full mt-2" onClick={onFechar}>
                Ver produtos
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-3 max-h-80 overflow-y-auto">
                {itens.map((i) => (
                  <div key={i.produto_id} className="border border-border rounded-md p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-text-primary">{i.nomeBase ?? i.nome}</div>
                        <div className="text-xs text-text-tertiary font-mono">{formatBRL(i.preco)} cada</div>
                      </div>
                      <IconButton onClick={() => onRemover(i.produto_id)} aria-label={`Remover ${i.nome}`}>
                        <Trash2 size={14} className="text-negative" />
                      </IconButton>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      {i.opcoes && i.opcoes.length > 1 ? (
                        <select
                          value={i.produto_id}
                          onChange={(e) => onTrocarVariante(i.produto_id, e.target.value)}
                          aria-label={`Opção de ${i.nomeBase ?? i.nome}`}
                          className={`${inputClass} !h-8 !w-auto max-w-[60%]`}
                        >
                          {i.opcoes.map((o) => (
                            <option key={o.produto_id} value={o.produto_id}>
                              {o.rotulo} — {formatBRL(o.preco)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span />
                      )}
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
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 mb-3">
                <Button variant="ghost" size="sm" onClick={onSalvar}>
                  <Save size={14} />
                  Salvar carrinho
                </Button>
                <Button variant="ghost" size="sm" onClick={onCompartilhar}>
                  <Share2 size={14} />
                  Compartilhar
                </Button>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-border mb-4">
                <span className="text-sm text-text-secondary">Total</span>
                <span className="font-mono text-lg font-semibold text-text-primary">{formatBRL(total)}</span>
              </div>

              <div className="flex flex-col-reverse sm:flex-row gap-2">
                <Button variant="secondary" className="flex-1 h-11" onClick={onFechar}>
                  Adicionar mais produtos
                </Button>
                <Button variant="primary" className="flex-1 h-11" onClick={() => setEtapa("dados")}>
                  Finalizar compra
                </Button>
              </div>
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
          <FormField label="E-mail (opcional)">
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@email.com"
            />
          </FormField>

          <div className="border-t border-border pt-3 mt-1">
            <div className="text-sm font-medium text-text-primary mb-0.5">Entrega (opcional)</div>
            <p className="text-xs text-text-tertiary mb-3">
              Ajuda a loja a calcular o frete. Digite o CEP e o endereço é preenchido sozinho.
            </p>
            <FormField label="País">
              <select className={inputClass} value="BR" disabled aria-label="País">
                <option value="BR">Brasil</option>
              </select>
            </FormField>
            <CamposEndereco
              valor={endereco}
              comComplemento={false}
              buscar={buscarCepPublico}
              onChange={(patch) => {
                setEndereco((prev) => ({ ...prev, ...patch }));
                // CEP trocado: a cotação anterior não vale mais (é assinada para aquele CEP).
                if ("cep" in patch) setFrete(null);
              }}
            />
            {freteAtivo && <FreteVitrine slug={slug} cep={endereco.cep} itens={itens} subtotal={total} escolhido={frete} onEscolher={setFrete} />}
          </div>

          {formasPagamento.length > 0 && (
            <FormField label="Como prefere pagar?" dica="A loja confirma o pagamento com você pelo WhatsApp antes de qualquer cobrança.">
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Forma de pagamento">
                {formasPagamento.map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={formaPagamento === f}
                    onClick={() => setFormaPagamento(f)}
                    className={`text-sm rounded-md border px-3 py-1.5 ${formaPagamento === f ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </FormField>
          )}

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
            <span className="text-sm text-text-secondary">Total{frete ? ` com frete (${frete.gratis ? "grátis" : formatBRL(frete.valor)})` : ""}</span>
            <span className="font-mono text-lg font-semibold text-text-primary">{formatBRL(total + (frete?.valor ?? 0))}</span>
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
              disabled={!nome.trim() || whatsapp.replace(/\D/g, "").length < 10 || (formasPagamento.length > 0 && !formaPagamento)}
            >
              Enviar pedido
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Banknote, ChevronLeft, CreditCard, Link2, MoreHorizontal, Smartphone, UserPlus, Wallet } from "lucide-react";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { formatBRL } from "@/lib/format";
import { criarClienteRapido } from "../clientes/actions";
import { obterFiadoEmUsoCliente } from "./actions";
import { dividirEmParcelas, calcularRestante, calcularTaxaMaquineta, calcularTroco } from "@/lib/pdv";
import type { ClientePdv, ContaPdv, FormaPagamentoPdv } from "./tipos";
import { executarComToast } from "@/lib/acao-cliente";
import { valorEmPix } from "@/lib/pdv-atalhos";
import { PixPagamento, type PixLoja } from "./PixPagamento";

/** Ícone por forma de pagamento conhecida; o resto cai no genérico. */
const ICONES: { padrao: RegExp; icone: typeof Banknote }[] = [
  { padrao: /dinheiro|espécie|especie/i, icone: Banknote },
  { padrao: /pix/i, icone: Smartphone },
  { padrao: /cart|débito|debito|crédito|credito/i, icone: CreditCard },
  { padrao: /link/i, icone: Link2 },
  { padrao: /saldo/i, icone: Wallet },
];

function iconeDaForma(nome: string) {
  return ICONES.find((i) => i.padrao.test(nome))?.icone ?? MoreHorizontal;
}

export interface DadosCheckout {
  status: "paga" | "fiado";
  cliente_id: string | null;
  conta_id: string | null;
  forma_pagamento: string | null;
  data_vencimento: string | null;
  entrada_valor: number;
  entrada_forma: "dinheiro" | "pix" | null;
  forma_pagamento_2: string | null;
  parcelas_cartao: number | null;
  taxa_maquineta_pct: number;
  parcelas_fiado: number;
  dias_entre_parcelas: number;
  /** 0083: dinheiro entregue pelo cliente (troco); null quando não há parte em dinheiro. */
  valor_recebido: number | null;
  /** 0083: troco calculado na tela, para o comprovante (o banco recalcula e grava). */
  troco: number;
}

export function CheckoutModal({
  aberto,
  onFechar,
  onVoltar,
  total,
  clientes,
  formasPagamento,
  contas,
  salvando,
  onConfirmar,
  formaInicial = null,
  pix,
  atalhoFinalizar = false,
  credito = 0,
}: {
  /**
   * Crédito de troca (0083): paga parte da venda como forma de pagamento — o total segue
   * cheio, e só o que sobra passa pelo caixa, pela entrada e pelo crediário.
   */
  credito?: number;
  /**
   * Pix da loja para o QR na tela. `undefined` = a tela não carregou a config (não mostra
   * nada); `null` = carregou e não há Pix (mostra o link para Configurações).
   */
  pix?: PixLoja | null;
  /** F4 finaliza a venda (paga) enquanto o modal está aberto — atalho do PDV. */
  atalhoFinalizar?: boolean;
  /** Forma já escolhida (ex.: no checkout do catálogo): vem marcada se existir aqui. */
  formaInicial?: string | null;
  aberto: boolean;
  onFechar: () => void;
  onVoltar: () => void;
  total: number;
  clientes: ClientePdv[];
  formasPagamento: FormaPagamentoPdv[];
  contas: ContaPdv[];
  salvando: boolean;
  onConfirmar: (dados: DadosCheckout) => void;
}) {
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [contaId, setContaId] = useState<string | null>(contas[0]?.id ?? null);
  const [vencimento, setVencimento] = useState("");
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoWhatsapp, setNovoWhatsapp] = useState("");
  const [novoFiado, setNovoFiado] = useState(false);
  const [criandoCliente, setCriandoCliente] = useState(false);
  const [clientesLocais, setClientesLocais] = useState<ClientePdv[]>(clientes);

  // Formas que não são "fiado": fiado é decidido pelo botão "Venda Fiado", não escolhido
  // aqui — "Fiado" na lista de formas de pagamento existe só pra classificar linhas antigas
  // (0030), não pra aparecer como opção de tender no grid.
  const formasTender = formasPagamento.filter((f) => f.tipo !== "fiado");
  const [formaPagamento, setFormaPagamento] = useState<string | null>(() => {
    const n = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const alvo = formaInicial ? n(formaInicial) : "";
    const achada = alvo ? formasTender.find((f) => n(f.nome) === alvo || n(f.nome).includes(alvo) || alvo.includes(n(f.nome))) : null;
    return achada?.nome ?? formasTender[0]?.nome ?? null;
  });
  const formaSelecionada = formasTender.find((f) => f.nome === formaPagamento) ?? null;

  const [entradaValor, setEntradaValor] = useState(0);
  const [entradaForma, setEntradaForma] = useState<"dinheiro" | "pix" | null>(null);
  const [parcelasCartao, setParcelasCartao] = useState(1);
  const [taxaMaquinetaPct, setTaxaMaquinetaPct] = useState(0);

  const [parcelarFiado, setParcelarFiado] = useState(false);
  const [parcelasFiado, setParcelasFiado] = useState(2);
  const [diasEntreParcelas, setDiasEntreParcelas] = useState(30);

  const [fiadoEmUso, setFiadoEmUso] = useState<number | null>(null);

  const cliente = clientesLocais.find((c) => c.id === clienteId) ?? null;
  const podeFiado = !!cliente?.permite_fiado;
  const creditoUsado = Math.min(Math.max(credito, 0), total);
  // O que o cliente ainda paga depois do crédito de troca.
  const aPagar = calcularRestante(total, creditoUsado);
  const restante = calcularRestante(aPagar, entradaValor);
  const [recebido, setRecebido] = useState(0);
  const trocoDe = (fiado: boolean) =>
    calcularTroco({
      total: aPagar,
      entradaValor,
      entradaDinheiro: entradaValor > 0 && entradaForma === "dinheiro",
      formaPrincipalDinheiro: formaSelecionada?.tipo === "dinheiro",
      fiado,
      recebido,
    });
  const troco = trocoDe(false);
  const taxaMaquinetaValor = calcularTaxaMaquineta(restante, taxaMaquinetaPct);

  // Só pra avisar antes de tentar — a trava de verdade é no banco (RPC registrar_venda).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reseta o aviso ao trocar de cliente, antes de buscar o novo valor
    setFiadoEmUso(null);
    if (!cliente?.permite_fiado) return;
    let cancelado = false;
    obterFiadoEmUsoCliente(cliente.id).then((r) => {
      if (!cancelado && r.ok) setFiadoEmUso(r.dado);
    });
    return () => {
      cancelado = true;
    };
  }, [cliente?.id, cliente?.permite_fiado]);

  const limiteDisponivel = cliente ? cliente.limite_fiado - (fiadoEmUso ?? 0) : null;
  const estouraLimite = podeFiado && limiteDisponivel !== null && restante > limiteDisponivel;

  async function cadastrarCliente() {
    if (!novoNome.trim()) return;
    setCriandoCliente(true);
    const r = await executarComToast(
      criarClienteRapido(novoNome.trim(), novoWhatsapp.trim() || null, novoFiado),
      { sucesso: "Cliente cadastrado", erro: "Erro ao cadastrar cliente" },
    );
    setCriandoCliente(false);
    if (r.ok) {
      setClientesLocais((prev) => [...prev, { ...r.dado, whatsapp: novoWhatsapp.trim() || null, limite_fiado: 0 }]);
      setClienteId(r.dado.id);
      setCadastroAberto(false);
      setNovoNome("");
      setNovoWhatsapp("");
      setNovoFiado(false);
    }
  }

  const pixValor = valorEmPix({
    total: aPagar,
    entradaValor,
    entradaPix: entradaForma === "pix",
    formaPrincipalPix: formaSelecionada?.tipo === "pix",
  });

  function montarDados(status: "paga" | "fiado"): DadosCheckout {
    // `forma_pagamento` é sempre a forma do "tender" principal — a RPC só usa
    // `forma_pagamento_2` pra compor o rótulo quando há entrada (ver 0030); mandar os dois
    // com o mesmo valor deixa a RPC decidir qual usar, sem o cliente precisar saber a regra.
    return {
      status,
      cliente_id: clienteId,
      conta_id: contaId,
      forma_pagamento: formaPagamento,
      data_vencimento: status === "fiado" ? vencimento || null : null,
      entrada_valor: entradaValor,
      entrada_forma: entradaValor > 0 ? entradaForma : null,
      forma_pagamento_2: entradaValor > 0 ? formaPagamento : null,
      parcelas_cartao: formaSelecionada?.tipo === "cartao_credito" && parcelasCartao > 1 ? parcelasCartao : null,
      taxa_maquineta_pct: formaSelecionada?.tipo === "cartao_credito" ? taxaMaquinetaPct : 0,
      parcelas_fiado: status === "fiado" && parcelarFiado ? parcelasFiado : 1,
      dias_entre_parcelas: diasEntreParcelas,
      valor_recebido: trocoDe(status === "fiado").emDinheiro > 0 && recebido > 0 ? recebido : null,
      troco: trocoDe(status === "fiado").troco,
    };
  }

  // F4 = "Finalizar Venda". A ref evita re-registrar o listener a cada tecla do formulário.
  // Travas do atalho: o mesmo F4 que abre o checkout não pode fechar a venda (ignora os primeiros
  // 800 ms), uma venda não sai duas vezes (inclusive offline, que não liga `salvando`), e com
  // Pix ou cadastro aberto o F4 não finaliza: o caixa tem que conferir o recebimento e clicar.
  const finalizarRef = useRef<() => void>(() => undefined);
  const abertoEmRef = useRef(0);
  const enviadoRef = useRef(false);
  useEffect(() => {
    finalizarRef.current = () => {
      if (salvando || enviadoRef.current || cadastroAberto || pixValor > 0 || troco.falta > 0) return;
      if (performance.now() - abertoEmRef.current < 800) return;
      enviadoRef.current = true;
      onConfirmar(montarDados("paga"));
    };
  });
  useEffect(() => {
    if (!aberto || !atalhoFinalizar) return;
    abertoEmRef.current = performance.now();
    enviadoRef.current = false;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "F4" || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      e.preventDefault();
      finalizarRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto, atalhoFinalizar]);

  return (
    <Modal open={aberto} onClose={onFechar} title="Pagamento" width="max-w-2xl">
      <button
        onClick={onVoltar}
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary -mt-1 mb-3"
      >
        <ChevronLeft size={16} />
        Voltar ao carrinho
      </button>

      <div className="text-center mb-5">
        <div className="font-mono text-4xl font-semibold text-text-primary">{formatBRL(total)}</div>
        {creditoUsado > 0 && (
          <p className="text-sm text-text-secondary mt-1">
            Crédito de troca: <span className="font-mono text-accent">−{formatBRL(creditoUsado)}</span> · A pagar:{" "}
            <span className="font-mono font-semibold text-text-primary">{formatBRL(aPagar)}</span>
          </p>
        )}
      </div>

      <FormField label="Cliente (opcional, obrigatório no crediário)">
        <div className="flex gap-2">
          <select
            className={inputClass}
            value={clienteId ?? ""}
            onChange={(e) => setClienteId(e.target.value || null)}
          >
            <option value="">Sem cliente identificado</option>
            {clientesLocais.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
                {c.permite_fiado ? " (crediário liberado)" : ""}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => setCadastroAberto((v) => !v)}>
            <UserPlus size={14} />
          </Button>
        </div>
      </FormField>

      {cadastroAberto && (
        <div className="border border-border rounded-md p-3 mb-4 space-y-2">
          <input
            className={inputClass}
            placeholder="Nome do cliente"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Celular / WhatsApp (opcional)"
            value={novoWhatsapp}
            onChange={(e) => setNovoWhatsapp(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-accent"
              checked={novoFiado}
              onChange={(e) => setNovoFiado(e.target.checked)}
            />
            Permitir crediário
          </label>
          <Button variant="secondary" className="w-full" onClick={cadastrarCliente} loading={criandoCliente}>
            Cadastrar e selecionar
          </Button>
        </div>
      )}

      <FormField label="Entrada (opcional)" dica="Dinheiro ou Pix recebido agora, abatido do total antes do restante.">
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            max={aPagar}
            value={entradaValor || ""}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0);
              setEntradaValor(v);
              if (v <= 0) setEntradaForma(null);
              else if (!entradaForma) setEntradaForma("dinheiro");
            }}
            placeholder="0,00"
            className={`${inputClass} flex-1`}
          />
          <div className="flex rounded-md border border-border overflow-hidden shrink-0">
            {(["dinheiro", "pix"] as const).map((f) => (
              <button
                key={f}
                type="button"
                disabled={entradaValor <= 0}
                onClick={() => setEntradaForma(f)}
                className={`h-9 px-3 text-sm capitalize transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  entradaForma === f ? "bg-accent-soft text-accent" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </FormField>

      <FormField label={entradaValor > 0 ? `Forma de pagamento do restante (${formatBRL(restante)})` : "Forma de pagamento"}>
        {formasTender.length === 0 ? (
          <p className="text-sm text-text-tertiary">
            Nenhuma forma de pagamento cadastrada. Cadastre em Configurações — a venda pode seguir sem isso.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {formasTender.map((f) => {
              const Icone = iconeDaForma(f.nome);
              const ativo = formaPagamento === f.nome;
              return (
                <button
                  key={f.nome}
                  onClick={() => setFormaPagamento(f.nome)}
                  type="button"
                  aria-pressed={ativo}
                  className={`h-16 max-sm:h-20 max-sm:text-base rounded-md border flex flex-col items-center justify-center gap-1 text-sm transition-colors ${
                    ativo
                      ? "bg-accent-soft border-accent-soft text-accent"
                      : "bg-surface-1 border-border text-text-secondary hover:text-text-primary"
                  }`}
                >
                  <Icone size={18} className="max-sm:size-6" />
                  {f.nome}
                </button>
              );
            })}
          </div>
        )}
      </FormField>

      {/* Com crediário liberado, o restante pode virar parcelas: o QR do restante cobraria duas vezes. */}
      {pix !== undefined && pixValor > 0 && !(podeFiado && entradaValor > 0 && entradaForma !== "pix") && (
        <PixPagamento
          pix={pix}
          valor={pixValor}
          rotulo={entradaValor > 0 && pixValor < aPagar ? (entradaForma === "pix" ? "Entrada em Pix" : "Restante em Pix") : "Valor da venda em Pix"}
        />
      )}

      {troco.emDinheiro > 0 && (
        <FormField
          label={`Valor recebido em dinheiro (opcional)`}
          dica={`Parte em dinheiro: ${formatBRL(troco.emDinheiro)}. O caixa recebe o valor da venda; o troco só vai para o comprovante.`}
        >
          <input
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={recebido || ""}
            onChange={(e) => setRecebido(Math.max(0, Number(e.target.value) || 0))}
            placeholder={troco.emDinheiro.toFixed(2).replace(".", ",")}
            className={inputClass}
          />
          {recebido > 0 && troco.falta > 0 && (
            <p className="text-xs text-negative mt-1">Faltam {formatBRL(troco.falta)} para cobrir a parte em dinheiro.</p>
          )}
          {recebido > 0 && troco.falta === 0 && (
            <p className="text-sm text-text-primary mt-1">
              Troco: <span className="font-mono font-semibold text-positive">{formatBRL(troco.troco)}</span>
            </p>
          )}
        </FormField>
      )}

      {formaSelecionada?.tipo === "cartao_credito" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Vezes">
            <select
              className={inputClass}
              value={parcelasCartao}
              onChange={(e) => setParcelasCartao(Number(e.target.value) || 1)}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}x
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Taxa da maquineta (%, opcional)" dica="Abate do lucro, não do valor recebido.">
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={taxaMaquinetaPct || ""}
              onChange={(e) => setTaxaMaquinetaPct(Math.max(0, Number(e.target.value) || 0))}
              placeholder="0,0"
              className={inputClass}
            />
            {taxaMaquinetaValor > 0 && (
              <p className="text-xs text-text-tertiary mt-1">Desconta {formatBRL(taxaMaquinetaValor)} do lucro.</p>
            )}
          </FormField>
        </div>
      )}

      <FormField label="Conta que recebe">
        <select className={inputClass} value={contaId ?? ""} onChange={(e) => setContaId(e.target.value || null)}>
          <option value="">Selecione…</option>
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </FormField>

      {podeFiado && (
        <>
          <FormField label="Vencimento do crediário (opcional — padrão 30 dias)">
            <input type="date" className={inputClass} value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </FormField>

          <label className="flex items-center gap-2 text-sm text-text-primary cursor-pointer mb-3">
            <input
              type="checkbox"
              className="w-4 h-4 accent-accent"
              checked={parcelarFiado}
              onChange={(e) => setParcelarFiado(e.target.checked)}
            />
            Parcelar o crediário
          </label>

          {parcelarFiado && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
              <FormField label="Número de parcelas">
                <input
                  type="number"
                  min={2}
                  max={24}
                  className={inputClass}
                  value={parcelasFiado}
                  onChange={(e) => setParcelasFiado(Math.min(24, Math.max(2, Number(e.target.value) || 2)))}
                />
              </FormField>
              <FormField label="Dias entre parcelas">
                <input
                  type="number"
                  min={1}
                  max={90}
                  className={inputClass}
                  value={diasEntreParcelas}
                  onChange={(e) => setDiasEntreParcelas(Math.min(90, Math.max(1, Number(e.target.value) || 30)))}
                />
              </FormField>
              <div className="sm:col-span-2 text-xs text-text-tertiary border border-border rounded-md p-2 space-y-0.5">
                {dividirEmParcelas(restante, parcelasFiado).map((p) => (
                  <div key={p.numero} className="flex justify-between">
                    <span>Parcela {p.numero}</span>
                    <span className="font-mono">{formatBRL(p.valor)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {estouraLimite && (
            <p className="text-xs text-negative mb-3">
              Este crediário ({formatBRL(restante)}) passa do crédito disponível de {cliente?.nome}
              {limiteDisponivel !== null && ` (${formatBRL(Math.max(0, limiteDisponivel))} livre)`} — o sistema pode
              recusar ao confirmar.
            </p>
          )}
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mt-5">
        {cliente && (
          <Button
            variant="secondary"
            className="flex-1"
            disabled={!podeFiado || salvando}
            title={podeFiado ? undefined : `${cliente.nome} não tem crediário liberado`}
            onClick={() => onConfirmar(montarDados("fiado"))}
          >
            Venda no crediário
          </Button>
        )}
        <Button
          variant="primary"
          className="flex-1 max-sm:h-12 max-sm:text-base"
          loading={salvando}
          disabled={troco.falta > 0}
          onClick={() => onConfirmar(montarDados("paga"))}
          title={atalhoFinalizar ? "Finalizar (F4)" : undefined}
          aria-keyshortcuts={atalhoFinalizar ? "F4" : undefined}
        >
          Finalizar Venda
        </Button>
      </div>
    </Modal>
  );
}

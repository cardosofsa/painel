"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField, inputClass } from "@/components/ui/Modal";
import { executar } from "@/lib/acao";
import { formatBRL, formatarDataIso } from "@/lib/format";
import { preencherNome, type FerramentaTexto } from "@/lib/ia/prompts-textos";
import { gerarTextoVixe } from "@/app/(painel)/vixe/actions";

export interface ProdutoTexto {
  id: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  preco: number;
  garantiaDias: number | null;
  emEstoque: boolean;
}

export interface ClienteCobranca {
  id: string;
  nome: string;
  /** Só para abrir a conversa certa; nunca vai para a IA. */
  whatsapp: string | null;
  parcelas: { valor: number; vencimentoIso: string; atrasoDias: number }[];
}

interface Saida {
  texto: string;
  hashtags: string[];
  atributos: { nome: string; valor: string }[];
  rodape: string;
  doCache: boolean;
}

const FERRAMENTAS: { id: FerramentaTexto; rotulo: string; ajuda: string }[] = [
  { id: "resposta", rotulo: "Responder cliente", ajuda: "Cole a pergunta do comprador e receba uma resposta usando os dados do produto." },
  { id: "cobranca", rotulo: "Cobrança de fiado", ajuda: "Mensagem educada com as parcelas em aberto. O nome do cliente não vai para a IA." },
  { id: "legenda", rotulo: "Legenda", ajuda: "Texto de divulgação para WhatsApp ou Instagram." },
  { id: "atributos", rotulo: "Ficha técnica", ajuda: "Separa material, medidas, cor etc. a partir da descrição do produto." },
];

/**
 * Ferramentas de texto da Vixe. Cada uma manda só o necessário para a IA e devolve um
 * texto pronto para copiar. Nada é gravado: é para colar onde a pessoa precisar.
 */
export function VixeTextos({
  produtos,
  clientes,
  verProdutos,
  verFiado,
  nomeNegocio,
  slugVitrine,
  iaDisponivel,
}: {
  produtos: ProdutoTexto[];
  clientes: ClienteCobranca[];
  verProdutos: boolean;
  verFiado: boolean;
  nomeNegocio: string | null;
  slugVitrine: string | null;
  iaDisponivel: boolean;
}) {
  const disponiveis = FERRAMENTAS.filter((f) => (f.id === "cobranca" ? verFiado : verProdutos));
  const [pending, startTransition] = useTransition();
  const [ferramenta, setFerramenta] = useState<FerramentaTexto>(disponiveis[0]?.id ?? "resposta");
  const [produtoId, setProdutoId] = useState(produtos[0]?.id ?? "");
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? "");
  const [pergunta, setPergunta] = useState("");
  const [tom, setTom] = useState<"gentil" | "firme">("gentil");
  const [rede, setRede] = useState<"whatsapp" | "instagram">("whatsapp");
  const [comLink, setComLink] = useState(!!slugVitrine);
  const [instrucao, setInstrucao] = useState("");
  const [saida, setSaida] = useState<Saida | null>(null);
  const [copiado, setCopiado] = useState(false);

  const produto = produtos.find((p) => p.id === produtoId) ?? null;
  const cliente = clientes.find((c) => c.id === clienteId) ?? null;
  const info = FERRAMENTAS.find((f) => f.id === ferramenta)!;

  if (!iaDisponivel) {
    return (
      <Card>
        <p className="text-sm text-text-secondary">Nenhuma IA disponível para a sua conta. Cadastre a sua em Configurações → IA.</p>
      </Card>
    );
  }
  if (disponiveis.length === 0) {
    return (
      <Card>
        <p className="text-sm text-text-secondary">As ferramentas de texto usam Produtos ou Financeiro. Peça ao administrador para liberar uma dessas abas.</p>
      </Card>
    );
  }

  function trocar(f: FerramentaTexto) {
    setFerramenta(f);
    setSaida(null);
  }

  function montarContexto(): unknown {
    const p = produto
      ? { nome: produto.nome, descricao: produto.descricao, categoria: produto.categoria, preco: produto.preco, garantiaDias: produto.garantiaDias, emEstoque: produto.emEstoque }
      : null;
    if (ferramenta === "cobranca") {
      return {
        parcelas: (cliente?.parcelas ?? []).map((x) => ({ valor: x.valor, vencimento: formatarDataIso(x.vencimentoIso), atrasoDias: x.atrasoDias })),
        nomeNegocio,
        tom,
      };
    }
    if (ferramenta === "resposta") return { produto: p, pergunta, nomeNegocio };
    if (ferramenta === "legenda") {
      return {
        produto: p,
        rede,
        linkVitrine: comLink && slugVitrine ? `${window.location.origin}/vitrine/${slugVitrine}` : null,
        instrucaoExtra: instrucao.trim() || null,
      };
    }
    return { produto: p };
  }

  function gerar() {
    startTransition(async () => {
      try {
        const r = await executar(gerarTextoVixe(ferramenta, montarContexto()));
        const texto = ferramenta === "cobranca" ? preencherNome(r.texto, cliente?.nome ?? null) : r.texto;
        setSaida({
          texto,
          hashtags: r.hashtags,
          atributos: r.atributos,
          doCache: r.doCache,
          rodape: r.origem === "propria" ? `Sua IA · ${r.provedorRotulo ?? ""}` : r.limite > 0 ? `${r.usadas}/${r.limite} do teste grátis` : "IA do sistema",
        });
        setCopiado(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Não foi possível gerar agora.");
      }
    });
  }

  function textoFinal(): string {
    if (!saida) return "";
    if (ferramenta === "atributos") return saida.atributos.map((a) => `${a.nome}: ${a.valor}`).join("\n");
    return saida.hashtags.length ? `${saida.texto}\n\n${saida.hashtags.map((h) => `#${h}`).join(" ")}` : saida.texto;
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoFinal());
      setCopiado(true);
      toast.success("Copiado");
    } catch {
      toast.error("Seu navegador bloqueou a cópia. Selecione e copie à mão.");
    }
  }

  // Na cobrança abre a conversa do cliente; nos outros casos a pessoa escolhe o contato no WhatsApp.
  const digitos = ferramenta === "cobranca" ? (cliente?.whatsapp ?? "").replace(/\D/g, "") : "";
  const numeroWhatsapp = digitos ? (digitos.startsWith("55") ? digitos : `55${digitos}`) : "";
  const podeGerar =
    ferramenta === "cobranca" ? !!cliente : !!produto && (ferramenta !== "resposta" || pergunta.trim().length >= 3);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
      <Card>
        <div className="flex flex-wrap gap-2 mb-3">
          {disponiveis.map((f) => (
            <button
              key={f.id}
              onClick={() => trocar(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                ferramenta === f.id ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary hover:bg-surface-2"
              }`}
            >
              {f.rotulo}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-tertiary mb-4">{info.ajuda}</p>

        {ferramenta === "cobranca" ? (
          clientes.length === 0 ? (
            <p className="text-sm text-text-secondary">Nenhum cliente com parcela de fiado em aberto.</p>
          ) : (
            <>
              <FormField label="Cliente">
                <select className={inputClass} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} · {formatBRL(c.parcelas.reduce((s, x) => s + x.valor, 0))}
                    </option>
                  ))}
                </select>
              </FormField>
              {cliente && (
                <ul className="text-xs text-text-secondary mb-3 space-y-0.5">
                  {cliente.parcelas.slice(0, 6).map((x, i) => (
                    <li key={i}>
                      {formatBRL(x.valor)} · vence {formatarDataIso(x.vencimentoIso)}
                      {x.atrasoDias > 0 && <span className="text-negative"> · {x.atrasoDias} dias de atraso</span>}
                    </li>
                  ))}
                </ul>
              )}
              <FormField label="Tom">
                <select className={inputClass} value={tom} onChange={(e) => setTom(e.target.value as "gentil" | "firme")}>
                  <option value="gentil">Gentil (lembrete)</option>
                  <option value="firme">Firme (pedir data de pagamento)</option>
                </select>
              </FormField>
            </>
          )
        ) : produtos.length === 0 ? (
          <p className="text-sm text-text-secondary">Cadastre um produto primeiro.</p>
        ) : (
          <>
            <FormField label="Produto">
              <select className={inputClass} value={produtoId} onChange={(e) => setProdutoId(e.target.value)}>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </FormField>
            {ferramenta === "atributos" && !produto?.descricao && (
              <p className="text-xs text-negative -mt-1 mb-3">Este produto não tem descrição: a ficha técnica sai vazia. Escreva a descrição em Produtos primeiro.</p>
            )}
            {ferramenta === "resposta" && (
              <FormField label="Pergunta do cliente">
                <textarea
                  className={`${inputClass} h-24 py-2 resize-y`}
                  value={pergunta}
                  maxLength={500}
                  onChange={(e) => setPergunta(e.target.value)}
                  placeholder="Ex: Serve para pele sensível? Tem na cor preta?"
                />
              </FormField>
            )}
            {ferramenta === "legenda" && (
              <>
                <FormField label="Onde vai postar">
                  <select className={inputClass} value={rede} onChange={(e) => setRede(e.target.value as "whatsapp" | "instagram")}>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="instagram">Instagram</option>
                  </select>
                </FormField>
                {slugVitrine && (
                  <label className="flex items-center gap-2 text-sm text-text-secondary mb-3">
                    <input type="checkbox" checked={comLink} onChange={(e) => setComLink(e.target.checked)} /> Incluir o link da vitrine
                  </label>
                )}
                <FormField label="Algo a destacar? (opcional)">
                  <input className={inputClass} value={instrucao} maxLength={300} onChange={(e) => setInstrucao(e.target.value)} placeholder="Ex: chegou reposição, últimas unidades" />
                </FormField>
              </>
            )}
          </>
        )}

        <Button variant="primary" className="w-full" loading={pending} disabled={!podeGerar} onClick={gerar}>
          <Sparkles size={14} /> {saida ? "Gerar de novo" : "Gerar com a Vixe"}
        </Button>
      </Card>

      <Card>
        <h3 className="font-semibold text-text-primary mb-3">Resultado</h3>
        {!saida ? (
          <p className="text-sm text-text-tertiary">O texto aparece aqui, pronto para copiar.</p>
        ) : (
          <div className="space-y-3">
            {ferramenta === "atributos" ? (
              saida.atributos.length === 0 ? (
                <p className="text-sm text-text-secondary">A descrição não traz atributos claros para extrair.</p>
              ) : (
                <dl className="divide-y divide-border border border-border rounded-md">
                  {saida.atributos.map((a) => (
                    <div key={a.nome} className="flex justify-between gap-3 px-3 py-1.5 text-sm">
                      <dt className="text-text-secondary">{a.nome}</dt>
                      <dd className="text-text-primary text-right">{a.valor}</dd>
                    </div>
                  ))}
                </dl>
              )
            ) : (
              <p className="text-sm text-text-primary whitespace-pre-wrap">{saida.texto}</p>
            )}
            {saida.hashtags.length > 0 && <p className="text-sm text-accent">{saida.hashtags.map((h) => `#${h}`).join(" ")}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={copiar}>
                {copiado ? <Check size={14} /> : <Copy size={14} />} Copiar
              </Button>
              {(ferramenta === "cobranca" || (ferramenta === "legenda" && rede === "whatsapp") || ferramenta === "resposta") && (
                <Button
                  variant="secondary"
                  onClick={() => window.open(`https://wa.me/${numeroWhatsapp}?text=${encodeURIComponent(textoFinal())}`, "_blank", "noopener,noreferrer")}
                >
                  Abrir no WhatsApp <ExternalLink size={13} />
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5 text-xs text-text-tertiary">
              <span>Revise antes de enviar.</span>
              <span className="shrink-0 flex items-center gap-1">
                {saida.doCache && (
                  <span className="flex items-center gap-1 text-accent" title="Já tinha sido gerado antes: não consumiu cota">
                    <Zap size={11} /> cache
                  </span>
                )}
                {saida.rodape}
              </span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, History, MessageCircle, PenLine, Send, SkipForward } from "lucide-react";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { linkWhatsapp, ola, primeiroNome, textoResumoDia, ROTULO_ASSUNTO, type AssuntoMensagem } from "@/lib/whatsapp";
import { aplicarModelo, modeloDe } from "@/lib/vixe/modelos";
import { formatarDataHora } from "@/lib/format";
import type { DadosMensagens } from "@/lib/vixe/mensagens-servidor";
import { marcarMensagemEnviada } from "@/app/(painel)/vixe/mensagens/actions";
import { ModelosMensagemModal } from "./ModelosMensagemModal";

type Grupo = "pedidos" | "cobranca" | "recompra" | "data";
type Filtro = "todos" | Grupo | "enviadas";

interface Item {
  chave: string;
  grupo: Grupo;
  /** Gravado no histórico (0069). */
  assunto: string;
  rotulo: string;
  tom: string;
  cliente: string;
  whatsapp: string;
  referencia: string;
  texto: string;
}

const TOM: Record<AssuntoMensagem | "recompra" | "data", string> = {
  pedido: "bg-surface-2 text-text-secondary",
  pago: "bg-positive-soft text-positive",
  enviado: "bg-accent-soft text-accent",
  fiado: "bg-negative-soft text-negative",
  recompra: "bg-accent-soft text-accent",
  data: "bg-surface-2 text-text-secondary",
};

const ROTULO_HISTORICO: Record<string, string> = { ...ROTULO_ASSUNTO, recompra: "Recompra", data_comercial: "Data do comércio" };

/**
 * Vixe → Mensagens (11.6 + 0069): avisos prontos para cada cliente, recompra, campanha da
 * próxima data do comércio e o resumo do dia. Um clique abre o WhatsApp com o texto; a
 * mensagem sai da lista e fica no histórico. "Enviar a próxima" percorre a fila sem
 * precisar caçar o botão de cada cartão.
 */
export function VixeMensagens({ dados, origem }: { dados: DadosMensagens; origem: string }) {
  const [, startTransition] = useTransition();
  const [feitas, setFeitas] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [modelosAbertos, setModelosAbertos] = useState(false);
  const resumo = textoResumoDia(dados.resumo, dados.loja);
  const link = dados.slugVitrine ? `${origem}/vitrine/${dados.slugVitrine}` : "";

  const todos = useMemo<Item[]>(() => {
    const itens: Item[] = dados.mensagens.map((m) => ({
      chave: m.chave,
      grupo: m.assunto === "fiado" ? "cobranca" : "pedidos",
      assunto: m.assunto,
      rotulo: ROTULO_ASSUNTO[m.assunto],
      tom: TOM[m.assunto],
      cliente: m.cliente,
      whatsapp: m.whatsapp,
      referencia: m.referencia,
      texto: m.texto,
    }));
    const mes = dados.resumo.data.slice(0, 7);
    for (const c of dados.recompra) {
      itens.push({
        chave: `recompra:${c.cliente_id}:${mes}`,
        grupo: "recompra",
        assunto: "recompra",
        rotulo: c.situacao === "na_hora" ? "Hora de recomprar" : "Sumido",
        tom: TOM.recompra,
        cliente: c.nome,
        whatsapp: c.whatsapp ?? "",
        referencia: `${c.diasSemComprar} dias sem comprar${c.ritmo ? ` · costuma a cada ${c.ritmo}` : ""}`,
        texto: aplicarModelo(modeloDe("recompra", dados.modelos), { saudacao: ola(c.nome), cliente: primeiroNome(c.nome), loja: dados.loja, link, produto: "" }),
      });
    }
    const camp = dados.campanha;
    if (camp) {
      const dia = `${camp.data.slice(8, 10)}/${camp.data.slice(5, 7)}`;
      for (const d of camp.destinatarios) {
        itens.push({
          chave: `data:${camp.id}:${camp.data.slice(0, 4)}:${d.cliente_id}`,
          grupo: "data",
          assunto: "data_comercial",
          rotulo: camp.nome,
          tom: TOM.data,
          cliente: d.nome,
          whatsapp: d.whatsapp,
          referencia: `faltam ${camp.faltam} dias`,
          texto: aplicarModelo(modeloDe("data_comercial", dados.modelos), { saudacao: ola(d.nome), cliente: primeiroNome(d.nome), data: camp.nome, dia, loja: dados.loja, link }),
        });
      }
    }
    return itens;
  }, [dados, link]);

  const pendentes = todos.filter((m) => !feitas.has(m.chave));
  const contagem = (g: Grupo) => pendentes.filter((m) => m.grupo === g).length;
  const lista = filtro === "todos" ? pendentes.filter((m) => m.grupo === "pedidos" || m.grupo === "cobranca") : filtro === "enviadas" ? [] : pendentes.filter((m) => m.grupo === filtro);

  function marcar(m: Item, pulada: boolean) {
    setFeitas((s) => new Set(s).add(m.chave));
    startTransition(async () => {
      const r = await marcarMensagemEnviada(m.chave, { assunto: m.assunto, cliente: m.cliente.slice(0, 120), referencia: m.referencia.slice(0, 60), whatsapp: m.whatsapp.slice(0, 30), texto: m.texto.slice(0, 2000), pulada });
      if (!r.ok) toast.error(r.erro);
    });
  }

  function enviarProxima() {
    const m = lista[0];
    if (!m) return;
    window.open(linkWhatsapp(m.whatsapp, m.texto), "_blank", "noopener,noreferrer");
    marcar(m, false);
  }

  const filtros: { id: Filtro; rotulo: string; n?: number }[] = [
    { id: "todos", rotulo: "Avisos", n: contagem("pedidos") + contagem("cobranca") },
    { id: "pedidos", rotulo: "Pedidos e envio", n: contagem("pedidos") },
    { id: "cobranca", rotulo: "Cobrança", n: contagem("cobranca") },
    { id: "recompra", rotulo: "Recompra", n: contagem("recompra") },
    ...(dados.campanha ? [{ id: "data" as const, rotulo: dados.campanha.nome, n: contagem("data") }] : []),
    { id: "enviadas", rotulo: "Enviadas" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-4 items-start">
      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ChipRow>
            {filtros.map((f) => (
              <Chip key={f.id} ativo={filtro === f.id} onClick={() => setFiltro(f.id)}>
                {f.rotulo}
                {f.n !== undefined && f.n > 0 && <span className="ml-1.5 font-mono text-xs opacity-80">{f.n}</span>}
              </Chip>
            ))}
          </ChipRow>
          <Button variant="secondary" size="sm" onClick={() => setModelosAbertos(true)}>
            <PenLine size={14} /> Modelos
          </Button>
        </div>

        {!dados.registroOk && <p className="text-xs text-negative">Sem a migração 0061 o Sertão não lembra o que já foi enviado: a lista volta ao recarregar.</p>}
        {!dados.modelosOk && (filtro === "recompra" || filtro === "enviadas") && (
          <p className="text-xs text-text-tertiary">Recompra, histórico e modelos próprios ficam disponíveis depois da migração 0069.</p>
        )}

        {filtro === "enviadas" ? (
          <HistoricoEnviadas enviadas={dados.enviadas} />
        ) : lista.length === 0 ? (
          <Card>
            <EmptyState
              icon={MessageCircle}
              title={filtro === "recompra" ? "Ninguém sumido por enquanto" : filtro === "data" ? "Campanha enviada" : "Nenhum aviso pendente"}
              description={
                filtro === "recompra"
                  ? "Quando um cliente que costuma comprar passar do tempo de sempre, ele aparece aqui com a mensagem pronta."
                  : filtro === "data"
                    ? "Todos os clientes com WhatsApp já receberam a mensagem desta data."
                    : "Quando um pedido chegar, sair para entrega ou uma parcela do crediário estiver vencendo, a mensagem pronta aparece aqui."
              }
            />
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-1 px-4 py-2.5">
              <span className="text-sm text-text-secondary">
                {lista.length} {lista.length === 1 ? "mensagem" : "mensagens"} na fila
                {filtro === "data" && dados.campanha && <> · {dados.campanha.nome} em {dados.campanha.faltam} dias</>}
              </span>
              <Button size="sm" variant="primary" onClick={enviarProxima}>
                <SkipForward size={14} /> Enviar a próxima
              </Button>
            </div>
            {lista.map((m) => (
              <Card key={m.chave} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`text-xs font-medium rounded px-1.5 py-0.5 shrink-0 ${m.tom}`}>{m.rotulo}</span>
                    <span className="font-medium text-text-primary truncate">{m.cliente || "Cliente"}</span>
                    <span className="text-xs font-mono text-text-tertiary truncate">{m.referencia}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => marcar(m, true)}>
                      Pular
                    </Button>
                    <a href={linkWhatsapp(m.whatsapp, m.texto)} target="_blank" rel="noopener noreferrer" onClick={() => marcar(m, false)}>
                      <Button size="sm" variant="secondary">
                        <Send size={13} /> WhatsApp
                      </Button>
                    </a>
                  </div>
                </div>
                <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">{m.texto}</p>
              </Card>
            ))}
          </>
        )}
      </div>

      <Card className="space-y-3">
        <CardTitle>Resumo do dia</CardTitle>
        <pre className="text-xs text-text-secondary whitespace-pre-wrap font-sans bg-surface-2 rounded-md p-3">{resumo}</pre>
        <div className="flex gap-2">
          <a href={linkWhatsapp(dados.whatsappDono, resumo)} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="primary" className="w-full">
              <Send size={14} /> Mandar para mim
            </Button>
          </a>
          <Button
            variant="secondary"
            aria-label="Copiar resumo"
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
        {!dados.whatsappDono && <p className="text-xs text-text-tertiary">Cadastre o WhatsApp da loja em Configurações → Conta para o botão já abrir na sua conversa.</p>}
      </Card>

      {modelosAbertos && <ModelosMensagemModal modelos={dados.modelos} habilitado={dados.modelosOk} onClose={() => setModelosAbertos(false)} />}
    </div>
  );
}

function HistoricoEnviadas({ enviadas }: { enviadas: DadosMensagens["enviadas"] }) {
  if (enviadas.length === 0)
    return (
      <Card>
        <EmptyState icon={History} title="Nada enviado ainda" description="O que você enviar ou pular por aqui fica registrado nesta lista, com a opção de reenviar." />
      </Card>
    );
  return (
    <Card padding="nenhum" className="overflow-hidden">
      <ul className="divide-y divide-border">
        {enviadas.map((e) => (
          <li key={e.chave} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-text-primary truncate">{e.cliente || "—"}</span>
                {e.assunto && <span className="text-xs text-text-tertiary">{ROTULO_HISTORICO[e.assunto] ?? e.assunto}</span>}
                {e.pulada && <span className="text-xs rounded bg-surface-2 text-text-secondary px-1.5">Pulada</span>}
              </div>
              <div className="text-xs text-text-tertiary">
                {formatarDataHora(e.enviada_em)}
                {e.referencia ? ` · ${e.referencia}` : ""}
              </div>
            </div>
            {e.whatsapp && e.texto && (
              <a href={linkWhatsapp(e.whatsapp, e.texto)} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost">
                  <Send size={13} /> Reenviar
                </Button>
              </a>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

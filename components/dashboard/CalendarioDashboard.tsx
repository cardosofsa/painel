"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Pencil, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { Modal, FormField, campoBase, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { acoesDaData } from "@/lib/calendario-acoes";
import { AcoesData } from "@/components/calendario/AcoesData";
import { dataLocal, formatBRL } from "@/lib/format";
import { UFS, daUf } from "@/lib/feriados";
import { CAMADAS, diasAte, eventosDoMes, gradeDoMes, proximosEventos, type Camada, type EventoCalendario } from "@/lib/calendario-dashboard";
import type { FontesPeriodo } from "@/lib/calendario-servidor";
import {
  carregarCalendario,
  criarCompromisso,
  atualizarCompromisso,
  removerCompromisso,
  criarDataCalendario,
  removerDataCalendario,
  salvarPreferenciasCalendario,
  type CompromissoInput,
  type DataCalendarioInput,
} from "@/app/(painel)/dashboard/actions";

const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const corDe = (c: Camada) => CAMADAS.find((x) => x.id === c)!.cor;
const doisDigitos = (n: number) => String(n).padStart(2, "0");
const inicioDoMes = (ano: number, mes: number) => `${ano}-${doisDigitos(mes)}-01`;
const fimDoMes = (ano: number, mes: number) => `${ano}-${doisDigitos(mes)}-${doisDigitos(new Date(ano, mes, 0).getDate())}`;
const proximoMes = (ano: number, mes: number) => (mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 });
const chaveMes = (ano: number, mes: number) => `${ano}-${doisDigitos(mes)}`;
// Só a primeira letra em maiúscula: `capitalize` do CSS fazia "Outubro De 2026".
const inicialMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const nomeMes = (ano: number, mes: number) => inicialMaiuscula(new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
const diaPorExtenso = (iso: string) => inicialMaiuscula(dataLocal(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" }));
const diaCurto = (iso: string) => dataLocal(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "").replace(" de ", " ");

/** Fundo suave da cor da camada, que segue o tema (mesma ideia do `-soft` dos tokens). */
const fundo = (cor: string) => `color-mix(in srgb, ${cor} 14%, transparent)`;

type CompromissoEditando = { id: string | null; titulo: string; data: string; hora: string; descricao: string };

/**
 * Calendário do Dashboard. Mostra no mês: feriados (nacionais, do estado escolhido e os da
 * cidade/loja que a conta cadastra), datas do comércio com o tempo de preparo, contas a
 * pagar e a receber e compromissos. Cada camada liga e desliga; o estado e as camadas ficam
 * salvos no perfil (0068).
 *
 * `hoje` chega do servidor no horário de Brasília: calcular aqui daria outro dia no HTML do
 * servidor (UTC) depois das 21h, e o React acusaria erro de hidratação.
 */
export function CalendarioDashboard({
  hoje,
  ufInicial,
  ufEmpresa,
  camadasIniciais,
  fontesIniciais,
}: {
  hoje: string;
  ufInicial: string | null;
  ufEmpresa: string | null;
  camadasIniciais: Camada[];
  /** Mês atual e o seguinte (para "Próximos 30 dias"). */
  fontesIniciais: FontesPeriodo;
}) {
  const [anoHoje, mesHoje] = hoje.split("-").map(Number);
  const [ano, setAno] = useState(anoHoje);
  const [mes, setMes] = useState(mesHoje);
  const [selecionado, setSelecionado] = useState(hoje);
  const [uf, setUf] = useState<string | null>(ufInicial);
  const [camadas, setCamadas] = useState<Camada[]>(camadasIniciais);
  const [fontes, setFontes] = useState<FontesPeriodo>(fontesIniciais);
  const seguinte = proximoMes(anoHoje, mesHoje);
  const [carregados, setCarregados] = useState<Set<string>>(() => new Set([chaveMes(anoHoje, mesHoje), chaveMes(seguinte.ano, seguinte.mes)]));
  const [carregando, startCarregar] = useTransition();
  const [, startSalvar] = useTransition();
  const [compromisso, setCompromisso] = useState<CompromissoEditando | null>(null);
  const [novaData, setNovaData] = useState<string | null>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  // Barato (um mês de datas): recalcula a cada render, sem memo.
  const fontesMes = (a: number, m: number) => ({ ano: a, mes: m, uf, camadas, ...fontes });
  const eventos = eventosDoMes(fontesMes(ano, mes));
  // "Próximos 30 dias" é sempre a partir de hoje, não do mês que está sendo olhado.
  const proximos = proximosEventos(
    { ...eventosDoMes(fontesMes(anoHoje, mesHoje)), ...eventosDoMes(fontesMes(seguinte.ano, seguinte.mes)) },
    hoje,
    30,
  ).slice(0, 12);
  const grade = gradeDoMes(ano, mes);
  const doDia = eventos[selecionado] ?? [];

  /** Substitui o que estava no período pelo que veio agora (ao navegar e depois de salvar). */
  function mesclar(novo: FontesPeriodo, inicio: string, fim: string) {
    const fora = (data: string) => data.slice(0, 10) < inicio || data.slice(0, 10) > fim;
    setFontes((f) => ({
      compromissos: [...f.compromissos.filter((c) => fora(c.data)), ...novo.compromissos],
      contas: [...f.contas.filter((c) => fora(c.data_vencimento)), ...novo.contas],
      datasProprias: novo.datasProprias,
      datasOk: novo.datasOk,
    }));
  }

  function buscar(a: number, m: number, forcar = false) {
    const chave = chaveMes(a, m);
    if (!forcar && carregados.has(chave)) return;
    const inicio = inicioDoMes(a, m);
    const fim = fimDoMes(a, m);
    startCarregar(async () => {
      const r = await executarComToast(carregarCalendario(inicio, fim), { erro: "Erro ao carregar o calendário" });
      if (!r.ok) return;
      mesclar(r.dado, inicio, fim);
      setCarregados((s) => new Set(s).add(chave));
    });
  }

  function irPara(a: number, m: number) {
    setAno(a);
    setMes(m);
    setSelecionado(a === anoHoje && m === mesHoje ? hoje : inicioDoMes(a, m));
    buscar(a, m);
  }
  const mudarMes = (delta: number) => {
    const d = new Date(ano, mes - 1 + delta, 1);
    irPara(d.getFullYear(), d.getMonth() + 1);
  };

  function salvarPreferencias(novaUf: string | null, novasCamadas: Camada[]) {
    startSalvar(async () => {
      await executarComToast(salvarPreferenciasCalendario({ uf: novaUf, camadas: novasCamadas }), { erro: "Não deu para guardar a preferência" });
    });
  }
  function trocarUf(v: string) {
    const novo = v || null;
    setUf(novo);
    salvarPreferencias(novo, camadas);
  }
  function alternarCamada(c: Camada) {
    const novas = camadas.includes(c) ? camadas.filter((x) => x !== c) : [...camadas, c];
    setCamadas(novas);
    salvarPreferencias(uf, novas);
  }

  /** Depois de criar/editar/excluir: recarrega o mês olhado. */
  const recarregar = () => buscar(ano, mes, true);

  async function excluirCompromisso(id: string, titulo: string) {
    if (!(await confirm({ title: "Excluir compromisso?", message: `"${titulo}" sai do calendário.`, confirmLabel: "Excluir" }))) return;
    const r = await executarComToast(removerCompromisso(id), { sucesso: "Compromisso excluído", erro: "Erro ao excluir" });
    if (r.ok) recarregar();
  }
  async function excluirData(id: string, titulo: string) {
    if (!(await confirm({ title: "Excluir data?", message: `"${titulo}" sai do calendário (de todos os anos, se repetia).`, confirmLabel: "Excluir" }))) return;
    const r = await executarComToast(removerDataCalendario(id), { sucesso: "Data excluída", erro: "Erro ao excluir" });
    if (r.ok) recarregar();
  }

  function editarCompromisso(e: EventoCalendario) {
    const c = fontes.compromissos.find((x) => x.id === e.origemId);
    if (c) setCompromisso({ id: c.id, titulo: c.titulo, data: c.data.slice(0, 10), hora: c.hora?.slice(0, 5) ?? "", descricao: c.descricao ?? "" });
  }

  const ufMostrada = uf ?? ufEmpresa;

  return (
    <Card padding="nenhum" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays size={18} className="text-accent" /> Calendário
          </CardTitle>
          <CardSubtitle>
            Feriados{ufMostrada && daUf(ufMostrada) ? ` ${daUf(ufMostrada)}` : ""}, datas que vendem, contas e compromissos num lugar só.
          </CardSubtitle>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-text-secondary">
            <MapPin size={14} className="text-text-tertiary" />
            <span className="sr-only">Estado dos feriados</span>
            <select className={`${campoBase} h-8 text-xs`} value={uf ?? ""} onChange={(e) => trocarUf(e.target.value)} aria-label="Estado dos feriados">
              <option value="">{ufEmpresa ? `Estado da empresa (${ufEmpresa})` : "Só nacionais"}</option>
              {UFS.map((u) => (
                <option key={u.uf} value={u.uf}>
                  {u.nome}
                </option>
              ))}
            </select>
          </label>
          <Button variant="secondary" size="sm" onClick={() => setCompromisso({ id: null, titulo: "", data: selecionado, hora: "", descricao: "" })}>
            <Plus size={14} /> Compromisso
          </Button>
          {fontes.datasOk && (
            <Button variant="ghost" size="sm" onClick={() => setNovaData(selecionado)}>
              <Plus size={14} /> Data da cidade/loja
            </Button>
          )}
        </div>
      </div>

      <ChipRow className="px-5 pb-4">
        {CAMADAS.filter((c) => c.id !== "minhas" || fontes.datasOk).map((c) => (
          <Chip key={c.id} ativo={camadas.includes(c.id)} onClick={() => alternarCamada(c.id)} titulo={`Mostrar ${c.rotulo.toLowerCase()}`}>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: c.cor, opacity: camadas.includes(c.id) ? 1 : 0.35 }} aria-hidden />
              {c.rotulo}
            </span>
          </Chip>
        ))}
      </ChipRow>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] border-t border-border">
        {/* Mês */}
        <div className="p-3 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <IconButton aria-label="Mês anterior" onClick={() => mudarMes(-1)}>
              <ChevronLeft size={16} />
            </IconButton>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary" aria-live="polite">
                {nomeMes(ano, mes)}
              </span>
              {(ano !== anoHoje || mes !== mesHoje) && (
                <Button variant="ghost" size="sm" onClick={() => irPara(anoHoje, mesHoje)}>
                  Hoje
                </Button>
              )}
            </div>
            <IconButton aria-label="Próximo mês" onClick={() => mudarMes(1)}>
              <ChevronRight size={16} />
            </IconButton>
          </div>

          <div className={`grid grid-cols-7 gap-1 transition-opacity ${carregando ? "opacity-60" : ""}`} role="grid" aria-label={`Calendário de ${nomeMes(ano, mes)}`}>
            {SEMANA.map((d, i) => (
              <div key={d} className={`text-center text-xs font-medium pb-1 ${i === 0 || i === 6 ? "text-text-tertiary" : "text-text-secondary"}`}>
                {d}
              </div>
            ))}
            {grade.map((dia, i) => {
              if (!dia) return <div key={`vazio-${i}`} aria-hidden />;
              const lista = eventos[dia] ?? [];
              const feriado = lista.find((e) => e.camada === "feriado" && e.tipoFeriado !== "facultativo") ?? lista.find((e) => e.camada === "minhas");
              const ehHoje = dia === hoje;
              const ativo = dia === selecionado;
              return (
                <button
                  key={dia}
                  type="button"
                  role="gridcell"
                  aria-selected={ativo}
                  aria-label={`${diaPorExtenso(dia)}${lista.length ? `: ${lista.map((e) => e.titulo).join(", ")}` : ""}`}
                  onClick={() => setSelecionado(dia)}
                  className={`relative flex flex-col items-stretch text-left rounded-md border min-h-12 sm:min-h-20 p-1 sm:p-1.5 transition-colors ${
                    ativo ? "border-accent bg-accent-soft" : "border-border hover:bg-surface-2"
                  }`}
                >
                  <span
                    className={`text-xs font-mono self-start rounded px-1 ${ehHoje ? "bg-accent text-accent-on font-semibold" : feriado ? "text-negative font-semibold" : "text-text-secondary"}`}
                  >
                    {Number(dia.slice(8))}
                  </span>
                  {/* Celular: só os pontos. Tela maior: as duas primeiras linhas + "+N". */}
                  <span className="flex flex-wrap gap-0.5 mt-1 sm:hidden">
                    {lista.slice(0, 4).map((e) => (
                      <span key={e.id} className="w-1.5 h-1.5 rounded-full" style={{ background: corDe(e.camada) }} />
                    ))}
                  </span>
                  <span className="hidden sm:flex flex-col gap-0.5 mt-1 min-w-0">
                    {lista.slice(0, 2).map((e) => (
                      <span key={e.id} className="truncate text-xs leading-4 rounded px-1 text-text-primary" style={{ background: fundo(corDe(e.camada)), borderLeft: `2px solid ${corDe(e.camada)}` }}>
                        {e.titulo}
                      </span>
                    ))}
                    {lista.length > 2 && <span className="text-xs text-text-tertiary px-1">+{lista.length - 2}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dia escolhido + próximos 30 dias */}
        <div className="border-t lg:border-t-0 lg:border-l border-border p-5 space-y-5 bg-surface-1">
          <section aria-label="Dia escolhido">
            <h3 className="text-sm font-semibold text-text-primary mb-2">{diaPorExtenso(selecionado)}</h3>
            {doDia.length === 0 ? (
              <p className="text-sm text-text-tertiary">Nada marcado neste dia.</p>
            ) : (
              <ul className="space-y-2">
                {doDia.map((e) => (
                  <ItemDoDia
                    key={e.id}
                    e={e}
                    hoje={hoje}
                    onEditar={e.camada === "compromisso" ? () => editarCompromisso(e) : undefined}
                    onExcluir={
                      e.camada === "compromisso" && e.origemId
                        ? () => excluirCompromisso(e.origemId!, e.titulo)
                        : e.camada === "minhas" && e.origemId
                          ? () => excluirData(e.origemId!, e.titulo)
                          : undefined
                    }
                  />
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Próximos 30 dias">
            <h3 className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">Próximos 30 dias</h3>
            {proximos.length === 0 ? (
              <p className="text-sm text-text-tertiary">Nada nos próximos 30 dias.</p>
            ) : (
              <ul className="space-y-1.5">
                {proximos.map((e) => (
                  <li key={`p-${e.id}`}>
                    <button
                      type="button"
                      onClick={() => {
                        const [a, m] = e.data.split("-").map(Number);
                        if (a !== ano || m !== mes) irPara(a, m);
                        setSelecionado(e.data);
                      }}
                      className="w-full flex items-center gap-2 text-left text-sm rounded px-1 py-0.5 hover:bg-surface-2"
                    >
                      <span className="font-mono text-xs text-text-tertiary w-12 shrink-0 whitespace-nowrap">{diaCurto(e.data)}</span>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: corDe(e.camada) }} aria-hidden />
                      <span className="truncate text-text-primary">{e.titulo}</span>
                      {e.valor != null && <span className="ml-auto font-mono text-xs text-text-secondary shrink-0">{formatBRL(e.valor)}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {compromisso && (
        <CompromissoModal
          inicial={compromisso}
          onClose={() => setCompromisso(null)}
          onSalvo={() => {
            setCompromisso(null);
            recarregar();
          }}
        />
      )}
      {novaData && (
        <DataPropriaModal
          dataPadrao={novaData}
          onClose={() => setNovaData(null)}
          onSalvo={() => {
            setNovaData(null);
            recarregar();
          }}
        />
      )}
      {ConfirmDialog}
    </Card>
  );
}

function ItemDoDia({ e, hoje, onEditar, onExcluir }: { e: EventoCalendario; hoje: string; onEditar?: () => void; onExcluir?: () => void }) {
  const cor = corDe(e.camada);
  const faltam = diasAte(hoje, e.data);
  const preparar = e.camada === "comercial" && e.antecedencia != null && faltam >= 0 && faltam <= e.antecedencia;
  return (
    <li className="rounded-md border border-border p-2.5 text-sm" style={{ borderLeft: `3px solid ${cor}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-text-primary">{e.titulo}</div>
          {e.detalhe && <div className="text-xs text-text-secondary mt-0.5">{e.detalhe}</div>}
          {e.camada === "feriado" && e.tipoFeriado !== "facultativo" && (
            <div className="flex items-start gap-1 text-xs text-negative mt-1">
              <TriangleAlert size={12} className="shrink-0 mt-0.5" /> Correios e bancos fechados: confira o prazo de envio dos pedidos.
            </div>
          )}
          {e.camada === "comercial" && faltam > 0 && (
            <div className="text-xs mt-1 flex items-center gap-1 text-text-tertiary">
              {preparar && <Sparkles size={12} className="text-accent" />}
              {preparar ? <span className="text-accent font-medium">Hora de preparar</span> : null}
              <span>{`faltam ${faltam} dia${faltam > 1 ? "s" : ""}`}</span>
            </div>
          )}
          {e.camada === "comercial" && faltam > 0 && (
            <AcoesData acoes={acoesDaData({ id: e.id.replace(/^comercial:/, ""), preparar })} />
          )}
          {(e.camada === "pagar" || e.camada === "receber") && (
            <Link href={`/financeiro?aba=${e.camada === "pagar" ? "a-pagar" : "a-receber"}`} className="text-xs text-accent hover:underline mt-1 inline-block">
              {e.camada === "pagar" ? "Pagar" : "Receber"} no Financeiro ›
            </Link>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {e.valor != null && <span className={`font-mono text-sm ${e.camada === "pagar" ? "text-negative" : "text-positive"}`}>{formatBRL(e.valor)}</span>}
          {onEditar && (
            <IconButton aria-label={`Editar ${e.titulo}`} onClick={onEditar}>
              <Pencil size={14} />
            </IconButton>
          )}
          {onExcluir && (
            <IconButton aria-label={`Excluir ${e.titulo}`} onClick={onExcluir}>
              <Trash2 size={14} />
            </IconButton>
          )}
        </div>
      </div>
    </li>
  );
}

/** Novo ou editar (antes só dava para criar e excluir; `atualizarCompromisso` não tinha tela). */
function CompromissoModal({ inicial, onClose, onSalvo }: { inicial: CompromissoEditando; onClose: () => void; onSalvo: () => void }) {
  const [pending, startTransition] = useTransition();
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [data, setData] = useState(inicial.data);
  const [hora, setHora] = useState(inicial.hora);
  const [descricao, setDescricao] = useState(inicial.descricao);

  function salvar() {
    if (!titulo.trim()) return void toast.error("Informe um título para o compromisso");
    const dados: CompromissoInput = { titulo: titulo.trim(), data, hora: hora || null, descricao: descricao.trim() || null };
    startTransition(async () => {
      const r = inicial.id
        ? await executarComToast(atualizarCompromisso(inicial.id, dados), { sucesso: "Compromisso atualizado", erro: "Erro ao salvar compromisso" })
        : await executarComToast(criarCompromisso(dados), { sucesso: "Compromisso adicionado", erro: "Erro ao salvar compromisso" });
      if (r.ok) onSalvo();
    });
  }

  return (
    <Modal open onClose={onClose} title={inicial.id ? "Editar compromisso" : "Novo compromisso"}>
      <FormField label="Título">
        <input className={inputClass} value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <FormField label="Data">
          <input type="date" className={inputClass} value={data} onChange={(e) => setData(e.target.value)} />
        </FormField>
        <FormField label="Hora (opcional)">
          <input type="time" className={inputClass} value={hora} onChange={(e) => setHora(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Descrição (opcional)">
        <input className={inputClass} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </FormField>
      <div className="flex gap-2 mt-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={pending}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

/** Feriado da cidade, aniversário da loja, promoção própria. */
function DataPropriaModal({ dataPadrao, onClose, onSalvo }: { dataPadrao: string; onClose: () => void; onSalvo: () => void }) {
  const [pending, startTransition] = useTransition();
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(dataPadrao);
  const [tipo, setTipo] = useState<DataCalendarioInput["tipo"]>("municipal");
  const [repete, setRepete] = useState(true);
  const [observacao, setObservacao] = useState("");

  function salvar() {
    if (!titulo.trim()) return void toast.error("Dê um nome para a data");
    startTransition(async () => {
      const r = await executarComToast(
        criarDataCalendario({ titulo: titulo.trim(), data, tipo, repete_todo_ano: repete, observacao: observacao.trim() || null }),
        { sucesso: "Data adicionada ao calendário", erro: "Erro ao salvar a data" },
      );
      if (r.ok) onSalvo();
    });
  }

  return (
    <Modal open onClose={onClose} title="Data da cidade ou da loja">
      <p className="text-sm text-text-secondary mb-4">Feriados da sua cidade (aniversário, padroeiro), o aniversário da loja ou uma promoção sua.</p>
      <FormField label="Nome">
        <input className={inputClass} value={titulo} maxLength={80} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Aniversário de Feira de Santana" autoFocus />
      </FormField>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
        <FormField label="Data">
          <input type="date" className={inputClass} value={data} onChange={(e) => setData(e.target.value)} />
        </FormField>
        <FormField label="Tipo">
          <select className={inputClass} value={tipo} onChange={(e) => setTipo(e.target.value as DataCalendarioInput["tipo"])}>
            <option value="municipal">Feriado da cidade</option>
            <option value="pessoal">Data da loja</option>
            <option value="promocao">Promoção</option>
          </select>
        </FormField>
      </div>
      <FormField label="Observação (opcional)">
        <input className={inputClass} value={observacao} maxLength={200} onChange={(e) => setObservacao(e.target.value)} />
      </FormField>
      <label className="flex items-center gap-2 text-sm text-text-secondary mb-4">
        <input type="checkbox" checked={repete} onChange={(e) => setRepete(e.target.checked)} /> Repete todo ano
      </label>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" className="flex-1" onClick={salvar} loading={pending}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardPaste, FileSpreadsheet, History, Pencil, Plus, Receipt, Search, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, IconButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Modal, inputClass } from "@/components/ui/Modal";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL, formatarData } from "@/lib/format";
import { lerPlanilha } from "@/lib/importar";
import {
  lerListaColada,
  lerPlanilhaCustos,
  prepararImportacao,
  unidadeCusto,
  UNIDADES_CUSTO,
  type CustoAvulso,
  type ItemImportacao,
  type LinhaCusto,
  type UnidadeCusto,
} from "@/lib/custos-avulsos";
import { alternarCustoAvulso, importarCustosAvulsos, removerCustoAvulso, salvarCustoAvulso } from "./actions";

export interface HistoricoCusto {
  custo_id: string;
  custo_anterior: number;
  custo_novo: number;
  alterado_em: string;
}

const SEM_GRUPO = "Sem grupo";

/**
 * "Registrar custo": itens que têm custo mas não são produto (não entram no PDV, estoque,
 * catálogo nem vitrine). Ficam aqui para puxar na Precificação, nas Variações e nos Kits.
 */
export function CustosClient({ custos, historico, semMigracao }: { custos: CustoAvulso[]; historico: HistoricoCusto[]; semMigracao: boolean }) {
  const [pending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<CustoAvulso | "novo" | null>(null);
  const [importando, setImportando] = useState<"colar" | "planilha" | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState<string | null>(null);

  const termo = busca.trim().toLowerCase();
  const grupos = useMemo(() => {
    const filtrados = custos.filter((c) => !termo || c.nome.toLowerCase().includes(termo) || (c.grupo ?? "").toLowerCase().includes(termo) || (c.observacao ?? "").toLowerCase().includes(termo));
    const mapa = new Map<string, CustoAvulso[]>();
    for (const c of filtrados) {
      const g = c.grupo?.trim() || SEM_GRUPO;
      mapa.set(g, [...(mapa.get(g) ?? []), c]);
    }
    return [...mapa.entries()].sort(([a], [b]) => (a === SEM_GRUPO ? 1 : b === SEM_GRUPO ? -1 : a.localeCompare(b, "pt-BR")));
  }, [custos, termo]);
  const nomesDeGrupo = useMemo(() => [...new Set(custos.map((c) => c.grupo?.trim()).filter((g): g is string => !!g))].sort((a, b) => a.localeCompare(b, "pt-BR")), [custos]);

  async function remover(c: CustoAvulso) {
    if (!(await confirm({ title: `Apagar “${c.nome}”?`, message: "Some da lista e do pop-up de custos. O que já foi precificado com ele continua como está. Se só quer tirar da lista, use “Pausar”.", confirmLabel: "Apagar" }))) return;
    startTransition(async () => void (await executarComToast(removerCustoAvulso(c.id), { sucesso: "Custo apagado", erro: "Não foi possível apagar." })));
  }

  function alternar(c: CustoAvulso) {
    startTransition(async () => void (await executarComToast(alternarCustoAvulso(c.id, !c.ativo), { sucesso: c.ativo ? "Pausado: não aparece mais no pop-up" : "Reativado", erro: "Não foi possível alterar." })));
  }

  return (
    <>
      <Link href="/produtos" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary mb-2">
        <ArrowLeft size={14} aria-hidden /> Produtos
      </Link>
      <PageHeader
        title="Registrar custo"
        descricao="Itens com custo que não são produto: não entram no PDV, no estoque nem no catálogo. Use na Precificação, nas Variações e nos Kits pelo botão “Custo”."
        actions={
          <>
            <Button variant="secondary" onClick={() => setImportando("planilha")} disabled={semMigracao}>
              <FileSpreadsheet size={14} aria-hidden /> Importar planilha
            </Button>
            <Button variant="secondary" onClick={() => setImportando("colar")} disabled={semMigracao}>
              <ClipboardPaste size={14} aria-hidden /> Colar lista
            </Button>
            <Button variant="primary" onClick={() => setEditando("novo")} disabled={semMigracao}>
              <Plus size={14} aria-hidden /> Novo custo
            </Button>
          </>
        }
      />

      {semMigracao ? (
        <Card>
          <p role="alert" className="text-sm text-text-secondary">
            Esta tela precisa da migração 0112. Aplique no Supabase (SQL Editor) e recarregue.
          </p>
        </Card>
      ) : custos.length === 0 ? (
        <Card>
          <EmptyState
            icon={Receipt}
            title="Nenhum custo registrado"
            description="Cadastre um por um, cole uma lista (das Notas, do WhatsApp, de uma planilha) ou importe um arquivo CSV ou Excel."
            action={
              <Button variant="primary" onClick={() => setImportando("colar")}>
                <ClipboardPaste size={14} aria-hidden /> Colar lista
              </Button>
            }
          />
        </Card>
      ) : (
        <Card padding="nenhum">
          <div className="p-3 border-b border-border">
            <label className="relative block max-w-md">
              <span className="sr-only">Buscar custo</span>
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden />
              <input className={`${inputClass} pl-8`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome, grupo ou observação…" />
            </label>
          </div>
          {grupos.length === 0 && <p className="p-4 text-sm text-text-secondary">Nada encontrado para “{busca}”.</p>}
          {grupos.map(([grupo, itens]) => (
            <section key={grupo} aria-label={grupo}>
              <h2 className="bg-surface-2 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-text-tertiary">
                {grupo} <span className="font-normal normal-case">({itens.length})</span>
              </h2>
              <ul className="divide-y divide-border">
                {itens.map((c) => {
                  const mudancas = historico.filter((h) => h.custo_id === c.id);
                  const aberto = historicoAberto === c.id;
                  return (
                    <li key={c.id} className={`px-4 py-2.5 ${c.ativo ? "" : "opacity-60"}`}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-text-primary truncate">
                            {c.nome}
                            {!c.ativo && <span className="ml-2 text-xs font-normal text-text-tertiary">pausado</span>}
                          </div>
                          {c.observacao && <div className="text-xs text-text-tertiary truncate">{c.observacao}</div>}
                        </div>
                        <div className="text-right">
                          <span className="font-mono text-sm text-text-primary">{formatBRL(c.custo)}</span>
                          <span className="text-xs text-text-tertiary">/{unidadeCusto(c.unidade).curto}</span>
                          <div className="text-xs text-text-tertiary">atualizado {formatarData(c.atualizado_em)}</div>
                        </div>
                        <div className="flex shrink-0 items-center">
                          {mudancas.length > 0 && (
                            <IconButton aria-label={`Histórico de preço de ${c.nome}`} aria-expanded={aberto} onClick={() => setHistoricoAberto(aberto ? null : c.id)}>
                              <History size={14} aria-hidden />
                            </IconButton>
                          )}
                          <IconButton aria-label={`Editar ${c.nome}`} onClick={() => setEditando(c)}>
                            <Pencil size={14} aria-hidden />
                          </IconButton>
                          <Button size="sm" variant="ghost" onClick={() => alternar(c)} disabled={pending}>
                            {c.ativo ? "Pausar" : "Reativar"}
                          </Button>
                          <IconButton aria-label={`Apagar ${c.nome}`} onClick={() => void remover(c)}>
                            <Trash2 size={14} aria-hidden />
                          </IconButton>
                        </div>
                      </div>
                      {aberto && (
                        <ul className="mt-2 space-y-0.5 rounded-md bg-surface-2 p-2 text-xs text-text-secondary" aria-label={`Histórico de ${c.nome}`}>
                          {mudancas.slice(0, 10).map((h) => (
                            <li key={h.alterado_em} className="flex justify-between gap-3">
                              <span>{formatarData(h.alterado_em)}</span>
                              <span className="font-mono">
                                {formatBRL(h.custo_anterior)} → <span className={h.custo_novo > h.custo_anterior ? "text-negative" : "text-positive"}>{formatBRL(h.custo_novo)}</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </Card>
      )}

      {editando && <FormCusto key={editando === "novo" ? "novo" : editando.id} custo={editando === "novo" ? null : editando} grupos={nomesDeGrupo} onFechar={() => setEditando(null)} />}
      {importando && <ImportarCustos key={importando} modo={importando} existentes={custos} onFechar={() => setImportando(null)} />}
      {ConfirmDialog}
    </>
  );
}

/** Um custo, um por um (novo ou edição). */
function FormCusto({ custo, grupos, onFechar }: { custo: CustoAvulso | null; grupos: string[]; onFechar: () => void }) {
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(custo?.nome ?? "");
  const [unidade, setUnidade] = useState<UnidadeCusto>(custo?.unidade ?? "un");
  const [valor, setValor] = useState(custo?.custo ?? 0);
  const [grupo, setGrupo] = useState(custo?.grupo ?? "");
  const [observacao, setObservacao] = useState(custo?.observacao ?? "");
  const sujo = nome !== (custo?.nome ?? "") || valor !== (custo?.custo ?? 0) || unidade !== (custo?.unidade ?? "un") || grupo !== (custo?.grupo ?? "") || observacao !== (custo?.observacao ?? "");

  function salvar() {
    startTransition(async () => {
      const r = await executarComToast(salvarCustoAvulso({ id: custo?.id ?? null, nome, unidade, custo: valor, grupo, observacao }), { sucesso: custo ? "Custo atualizado" : "Custo registrado", erro: "Não foi possível salvar." });
      if (r.ok) onFechar();
    });
  }

  return (
    <Modal open onClose={onFechar} title={custo ? "Editar custo" : "Novo custo"} sujo={sujo}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <FormField label="Nome *">
          <input className={inputClass} value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Chimichury" autoFocus />
        </FormField>
        <div className="grid grid-cols-2 gap-3 [&>*]:mb-0 mb-4">
          <FormField label={`Custo por ${unidadeCusto(unidade).curto} (R$) *`}>
            <CampoNumero value={valor} onChange={setValor} min={0} casas={2} />
          </FormField>
          <FormField label="Unidade do custo">
            <select className={inputClass} value={unidade} onChange={(e) => setUnidade(e.target.value as UnidadeCusto)}>
              {UNIDADES_CUSTO.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.rotulo}
                </option>
              ))}
            </select>
          </FormField>
        </div>
        <FormField label="Grupo (opcional)" dica="Para organizar a lista: Temperos, Chás, Embalagens…">
          <input className={inputClass} value={grupo} maxLength={60} onChange={(e) => setGrupo(e.target.value)} list="grupos-custo" />
          <datalist id="grupos-custo">
            {grupos.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Observação (opcional)" dica="Marca, tamanho do saco, onde comprou…">
          <textarea className={`${inputClass} h-20 py-2 resize-y`} value={observacao} maxLength={500} onChange={(e) => setObservacao(e.target.value)} />
        </FormField>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" className="flex-1" loading={pending} disabled={pending || !nome.trim()}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}

const ROTULO_SITUACAO = { novo: "Novo", muda: "Muda o preço", igual: "Igual" } as const;

/**
 * Colar lista ou importar planilha: lê, mostra a prévia (o que é novo, o que muda de preço,
 * o que fica igual e o que não deu para ler) e só grava no "Salvar".
 */
function ImportarCustos({ modo, existentes, onFechar }: { modo: "colar" | "planilha"; existentes: CustoAvulso[]; onFechar: () => void }) {
  const [pending, startTransition] = useTransition();
  const [texto, setTexto] = useState("");
  const [unidadePadrao, setUnidadePadrao] = useState<UnidadeCusto>("un");
  const [lidas, setLidas] = useState<{ linhas: LinhaCusto[]; ignoradas: { linha: number; texto: string }[]; erro: string | null } | null>(null);
  const [lendo, setLendo] = useState(false);

  const previa: ItemImportacao[] = lidas ? prepararImportacao(lidas.linhas, existentes) : [];
  const mudam = previa.filter((p) => p.situacao !== "igual");

  function lerTexto() {
    setLidas({ ...lerListaColada(texto, unidadePadrao), erro: null });
  }

  async function lerArquivo(arquivo: File) {
    setLendo(true);
    try {
      setLidas(lerPlanilhaCustos(await lerPlanilha(arquivo), unidadePadrao));
    } catch (e) {
      setLidas({ linhas: [], ignoradas: [], erro: e instanceof Error ? e.message : "Não consegui ler o arquivo." });
    } finally {
      setLendo(false);
    }
  }

  function salvar() {
    startTransition(async () => {
      const r = await executarComToast(importarCustosAvulsos({ linhas: mudam.map(({ nome, unidade, custo, grupo, observacao }) => ({ nome, unidade, custo, grupo, observacao })) }), {
        sucesso: (d) => `${d.novos} novo${d.novos === 1 ? "" : "s"}, ${d.atualizados} com preço atualizado${d.iguais ? `, ${d.iguais} igua${d.iguais === 1 ? "l" : "is"}` : ""}.`,
        erro: "Não foi possível salvar a lista.",
      });
      if (r.ok) onFechar();
    });
  }

  return (
    <Modal open onClose={onFechar} title={modo === "colar" ? "Colar lista de custos" : "Importar planilha de custos"} width="max-w-2xl" sujo={!!lidas && mudam.length > 0}>
      {!lidas ? (
        <div className="space-y-3">
          <FormField label="Quando a lista não disser a unidade, o custo é por" dica="Uma linha “Produto | Preço (Kg)” no começo também define o kg.">
            <select className={inputClass} value={unidadePadrao} onChange={(e) => setUnidadePadrao(e.target.value as UnidadeCusto)}>
              {UNIDADES_CUSTO.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.rotulo}
                </option>
              ))}
            </select>
          </FormField>
          {modo === "colar" ? (
            <>
              <FormField label="Cole aqui" dica="Uma linha por item, com o valor no fim: “Chimichury 24,00”. Linha só com texto (ex.: FARINHAS) vira o grupo das seguintes.">
                <textarea className={`${inputClass} h-56 py-2 resize-y font-mono text-xs`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={"Produto\tPreço (Kg)\nChimichury\t24,00\nAna Maria\t18,00\n\nFARINHAS\nFarinha de coco\t19,90"} autoFocus />
              </FormField>
              <Button variant="primary" onClick={lerTexto} disabled={!texto.trim()}>
                Ler a lista
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-text-secondary">Arquivo CSV ou Excel (.xlsx), com cabeçalho na primeira linha. Colunas aceitas: nome (ou produto), custo (ou preço, valor), unidade, grupo (ou categoria) e observação.</p>
              <label className="block">
                <span className="sr-only">Arquivo da planilha</span>
                <input
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-md file:border file:border-border file:bg-surface-1 file:px-3 file:py-1.5 file:text-sm file:text-text-primary"
                  disabled={lendo}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void lerArquivo(f);
                  }}
                />
              </label>
              {lendo && <p className="text-sm text-text-secondary">Lendo o arquivo…</p>}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {lidas.erro && (
            <p role="alert" className="text-sm text-negative">
              {lidas.erro}
            </p>
          )}
          {previa.length > 0 && (
            <>
              <p className="text-sm text-text-secondary">
                {previa.filter((p) => p.situacao === "novo").length} novos, {previa.filter((p) => p.situacao === "muda").length} mudam de preço, {previa.filter((p) => p.situacao === "igual").length} iguais.
              </p>
              <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-2 text-xs text-text-tertiary">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Item</th>
                      <th className="px-3 py-1.5 text-left font-medium">Grupo</th>
                      <th className="px-3 py-1.5 text-right font-medium">Custo</th>
                      <th className="px-3 py-1.5 text-left font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {previa.map((p) => (
                      <tr key={p.nome} className={p.situacao === "igual" ? "text-text-tertiary" : "text-text-primary"}>
                        <td className="px-3 py-1.5">{p.nome}</td>
                        <td className="px-3 py-1.5 text-text-secondary">{p.grupo ?? "—"}</td>
                        <td className="px-3 py-1.5 text-right font-mono whitespace-nowrap">
                          {p.situacao === "muda" && p.custoAtual !== null && <span className="text-text-tertiary line-through mr-1">{formatBRL(p.custoAtual)}</span>}
                          {formatBRL(p.custo)}/{unidadeCusto(p.unidade).curto}
                        </td>
                        <td className="px-3 py-1.5 text-xs">{ROTULO_SITUACAO[p.situacao]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {lidas.ignoradas.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-text-secondary">
                {lidas.ignoradas.length} linha{lidas.ignoradas.length === 1 ? "" : "s"} que não deu para ler
              </summary>
              <ul className="mt-1 space-y-0.5 text-xs text-text-tertiary">
                {lidas.ignoradas.slice(0, 50).map((i) => (
                  <li key={i.linha}>
                    Linha {i.linha}: {i.texto}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!lidas.erro && previa.length === 0 && <p className="text-sm text-text-secondary">Não achei nenhum item com valor. Confira se cada linha termina com o preço.</p>}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setLidas(null)}>
              Voltar
            </Button>
            <Button variant="primary" className="flex-1" onClick={salvar} loading={pending} disabled={pending || mudam.length === 0}>
              {mudam.length ? `Salvar ${mudam.length} ite${mudam.length === 1 ? "m" : "ns"}` : "Nada muda"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

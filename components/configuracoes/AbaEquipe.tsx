"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, UserRound } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal, FormField, inputClass } from "@/components/ui/Modal";
import { StatusChip } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { executarComToast } from "@/lib/acao-cliente";
import { formatBRL } from "@/lib/format";
import { ABAS } from "@/lib/acesso";
import { PAPEIS_OPERADOR } from "@/lib/operador-cookie";
import { calcularComissoes, definirExigirOperador, salvarOperador, type LinhaComissao } from "@/app/(painel)/configuracoes/equipe-actions";

export interface OperadorTela {
  id: string;
  nome: string;
  abas: string[];
  comissao_pct: number;
  comissao_base: "venda" | "lucro";
  ativo: boolean;
}

export interface DadosEquipe {
  operadores: OperadorTela[];
  exigir: boolean;
  temPinAdmin: boolean;
}

const mes = (desloc: number) => {
  const d = new Date();
  const ini = new Date(d.getFullYear(), d.getMonth() + desloc, 1);
  const fim = new Date(d.getFullYear(), d.getMonth() + desloc + 1, 0);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  return { inicio: iso(ini), fim: iso(fim), rotulo: ini.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
};

/**
 * Configurações → Equipe (11.8): operadores com PIN, telas por operador, comissão e a opção
 * de exigir alguém operando. Mexer na equipe pede o PIN de administrador (se houver).
 */
export function AbaEquipe({ dados }: { dados: DadosEquipe | null }) {
  const [pending, startTransition] = useTransition();
  const [editando, setEditando] = useState<OperadorTela | "novo" | null>(null);
  const [comissoes, setComissoes] = useState<{ rotulo: string; linhas: LinhaComissao[] } | null>(null);

  if (!dados)
    return (
      <Card className="p-5 text-sm text-text-secondary">
        A equipe precisa da migração <span className="font-mono">0063_operadores.sql</span>. Aplique no Supabase e recarregue a página.
      </Card>
    );

  function pedirPin(): string | null | undefined {
    if (!dados!.temPinAdmin) return null;
    const p = window.prompt("PIN de administrador da loja:");
    return p === null ? undefined : p;
  }

  function alternarExigir() {
    const pin = pedirPin();
    if (pin === undefined) return;
    startTransition(async () => {
      await executarComToast(definirExigirOperador(!dados!.exigir, pin), { sucesso: dados!.exigir ? "Operador não é mais obrigatório" : "Agora é preciso escolher quem está operando", erro: "Erro ao salvar" });
    });
  }

  function verComissoes(desloc: number) {
    const m = mes(desloc);
    startTransition(async () => {
      const r = await executarComToast(calcularComissoes(m.inicio, m.fim), { erro: "Erro ao calcular" });
      if (r.ok) setComissoes({ rotulo: m.rotulo, linhas: r.dado });
    });
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-medium text-text-primary">Equipe</h3>
            <p className="text-sm text-text-secondary">
              Cada pessoa entra no turno com nome + PIN (em <span className="font-mono">/operador</span> ou no topo da tela). Ela só vê as telas liberadas, e as vendas ficam com o nome dela.
            </p>
          </div>
          <Button variant="primary" onClick={() => setEditando("novo")}>
            <Plus size={14} /> Novo operador
          </Button>
        </div>
        {dados.operadores.length === 0 ? (
          <EmptyState icon={UserRound} title="Nenhum operador" description="Cadastre quem trabalha no caixa, nas vendas ou no estoque." />
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md">
            {dados.operadores.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-text-primary">{o.nome}</div>
                  <div className="text-xs text-text-tertiary truncate">
                    {o.abas.map((a) => ABAS.find((x) => x.id === a)?.label ?? a).join(", ")}
                    {o.comissao_pct > 0 ? ` · comissão ${o.comissao_pct}% sobre ${o.comissao_base === "lucro" ? "o lucro" : "a venda"}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!o.ativo && <StatusChip tone="neutral" label="Inativo" />}
                  <button type="button" className="text-xs text-accent hover:underline" onClick={() => setEditando(o)}>
                    Editar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <label className="flex items-start gap-2 text-sm text-text-secondary mt-4">
          <input type="checkbox" className="mt-0.5" checked={dados.exigir} disabled={pending} onChange={alternarExigir} />
          <span>
            <span className="text-text-primary font-medium">Exigir alguém operando</span>
            <span className="block text-xs text-text-tertiary">Ao abrir o sistema, pede o operador antes de qualquer tela. O dono entra com o PIN de administrador.</span>
          </span>
        </label>
        {!dados.temPinAdmin && (
          <p className="text-[11px] text-negative mt-2">Dica: cadastre o PIN de administrador em Configurações → Conta. Sem ele, qualquer pessoa no aparelho pode mexer na equipe e entrar como dono.</p>
        )}
        <p className="text-[11px] text-text-tertiary mt-2">
          A loja continua com um login só: a trava de telas vale na navegação. Para quem precisa de acesso totalmente separado, o caminho são logins próprios (fase futura).
        </p>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h3 className="font-medium text-text-primary">Comissões</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" loading={pending} onClick={() => verComissoes(0)}>
              Este mês
            </Button>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => verComissoes(-1)}>
              Mês passado
            </Button>
          </div>
        </div>
        {comissoes &&
          (comissoes.linhas.length === 0 ? (
            <p className="text-sm text-text-tertiary">Sem vendas com operador em {comissoes.rotulo}.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-text-tertiary">
                  <th className="py-1 font-normal">{comissoes.rotulo}</th>
                  <th className="py-1 font-normal text-right">Vendas</th>
                  <th className="py-1 font-normal text-right">Faturamento</th>
                  <th className="py-1 font-normal text-right">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {comissoes.linhas.map((l) => (
                  <tr key={l.operadorId} className="border-t border-border">
                    <td className="py-1.5 text-text-primary">{l.nome}</td>
                    <td className="py-1.5 text-right font-mono">{l.vendas}</td>
                    <td className="py-1.5 text-right font-mono">{formatBRL(l.faturamento)}</td>
                    <td className="py-1.5 text-right font-mono text-accent" title={`${l.pct}% sobre ${l.base === "lucro" ? `o lucro (${formatBRL(l.lucro)})` : "a venda"}`}>
                      {formatBRL(l.comissao)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </Card>

      {editando && (
        <EditorOperador
          inicial={editando === "novo" ? null : editando}
          temPinAdmin={dados.temPinAdmin}
          onClose={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            toast.success("Operador salvo.");
          }}
        />
      )}
    </div>
  );
}

function EditorOperador({ inicial, temPinAdmin, onClose, onSalvo }: { inicial: OperadorTela | null; temPinAdmin: boolean; onClose: () => void; onSalvo: () => void }) {
  const [pending, startTransition] = useTransition();
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [pin, setPin] = useState("");
  const [abas, setAbas] = useState<string[]>(inicial?.abas ?? ["pdv"]);
  const [pct, setPct] = useState(inicial?.comissao_pct ?? 0);
  const [base, setBase] = useState<"venda" | "lucro">(inicial?.comissao_base ?? "venda");
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true);
  const [pinAdmin, setPinAdmin] = useState("");

  function salvar() {
    startTransition(async () => {
      const r = await executarComToast(
        salvarOperador({ id: inicial?.id ?? null, nome, pin: pin || null, abas, comissao_pct: pct, comissao_base: base, ativo, pinAdmin: temPinAdmin ? pinAdmin : null }),
        { erro: "Erro ao salvar o operador" },
      );
      if (r.ok) onSalvo();
    });
  }

  return (
    <Modal open onClose={onClose} title={inicial ? `Editar ${inicial.nome}` : "Novo operador"} width="max-w-lg">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Nome">
          <input className={inputClass} maxLength={60} value={nome} onChange={(e) => setNome(e.target.value)} />
        </FormField>
        <FormField label={inicial ? "Novo PIN (vazio = mantém)" : "PIN (4 a 6 números)"}>
          <input className={inputClass} inputMode="numeric" type="password" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
        </FormField>
      </div>
      <FormField label="Papel pronto (ajuste as telas abaixo)">
        <div className="flex flex-wrap gap-2">
          {PAPEIS_OPERADOR.map((p) => (
            <button key={p.id} type="button" onClick={() => setAbas(p.abas)} className="text-xs rounded-md border border-border px-2.5 py-1 hover:bg-surface-2">
              {p.rotulo}
            </button>
          ))}
        </div>
      </FormField>
      <FormField label="Telas liberadas">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {ABAS.map((a) => (
            <label key={a.id} className="flex items-center gap-1.5 text-sm text-text-secondary">
              <input type="checkbox" checked={abas.includes(a.id)} onChange={(e) => setAbas((x) => (e.target.checked ? [...x, a.id] : x.filter((y) => y !== a.id)))} />
              {a.label}
            </label>
          ))}
        </div>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Comissão (%)">
          <input className={inputClass} inputMode="decimal" value={pct} onChange={(e) => setPct(Math.max(0, Math.min(100, Number(e.target.value.replace(",", ".")) || 0)))} />
        </FormField>
        <FormField label="Sobre">
          <select className={inputClass} value={base} onChange={(e) => setBase(e.target.value as "venda" | "lucro")}>
            <option value="venda">o valor da venda</option>
            <option value="lucro">o lucro da venda</option>
          </select>
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm text-text-secondary mb-3">
        <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo
      </label>
      {temPinAdmin && (
        <FormField label="PIN de administrador (para confirmar)">
          <input className={inputClass} type="password" inputMode="numeric" autoComplete="off" value={pinAdmin} onChange={(e) => setPinAdmin(e.target.value)} />
        </FormField>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="primary" loading={pending} disabled={!nome.trim() || (!inicial && pin.length < 4) || abas.length === 0} onClick={salvar}>
          Salvar
        </Button>
      </div>
    </Modal>
  );
}

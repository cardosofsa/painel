"use client";

import { useEffect, useState } from "react";
import { Bug, Sparkles } from "lucide-react";
import { Card, CardEyebrow, CardTitle, HeroMetric } from "@/components/ui/Card";
import { Chip, ChipRow } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { campoBase } from "@/components/ui/Modal";
import { executar } from "@/lib/acao";
import { formatBRL, formatarDataHora, hojeIsoLocal, numeroOuNulo } from "@/lib/format";
import { carregarErrosApp, carregarUsoIA, type ErroAppLinha, type UsoIALinha } from "./actions";

const AVISO_MIGRACAO = "Precisa da migração 0076_plataforma_erros_ia_backups.sql. Aplique no Supabase e recarregue.";

/** Admin → Erros (onda D): o que quebrou no ar, do mais novo ao mais antigo. */
export function ErrosAdmin() {
  const [dados, setDados] = useState<{ migracaoOk: boolean; erros: ErroAppLinha[]; lidoEm: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "servidor" | "navegador">("todos");

  useEffect(() => {
    executar(carregarErrosApp())
      .then((d) => setDados({ ...d, lidoEm: Date.now() }))
      .catch((e) => setErro(e instanceof Error ? e.message : "Erro ao carregar"));
  }, []);

  if (erro)
    return (
      <Card>
        <p className="text-sm text-negative">{erro}</p>
      </Card>
    );
  if (!dados)
    return (
      <Card>
        <p className="text-sm text-text-secondary">Carregando os erros…</p>
      </Card>
    );
  if (!dados.migracaoOk)
    return (
      <Card>
        <p className="text-sm text-text-secondary">{AVISO_MIGRACAO}</p>
      </Card>
    );

  const lista = dados.erros.filter((e) => filtro === "todos" || e.onde === filtro);
  const ultimas24 = dados.erros.filter((e) => dados.lidoEm - new Date(e.criado_em).getTime() < 86_400_000).length;
  return (
    <div className="space-y-4 max-w-5xl">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardEyebrow>Últimas 24 h</CardEyebrow>
          <HeroMetric value={String(ultimas24)} caption="erros registrados" />
        </Card>
        <Card>
          <CardEyebrow>Guardados</CardEyebrow>
          <HeroMetric value={String(dados.erros.length)} caption="mais recentes (até 300 aqui)" />
        </Card>
      </div>
      <ChipRow>
        {(["todos", "servidor", "navegador"] as const).map((f) => (
          <Chip key={f} ativo={filtro === f} onClick={() => setFiltro(f)}>
            {f === "todos" ? "Todos" : f === "servidor" ? "Servidor" : "Navegador"}
          </Chip>
        ))}
      </ChipRow>
      {lista.length === 0 ? (
        <Card>
          <EmptyState
            icon={Bug}
            title="Nenhum erro registrado"
            description="Quando algo quebrar no ar (página, rota ou ação), aparece aqui com a rota e o código."
          />
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-border">
            {lista.map((e) => (
              <li key={e.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
                  <span className="font-mono">{formatarDataHora(e.criado_em)}</span>
                  <span className={`rounded px-1.5 py-0.5 ${e.onde === "servidor" ? "bg-negative-soft text-negative" : "bg-surface-2 text-text-secondary"}`}>
                    {e.onde}
                  </span>
                  {e.rota && <span className="font-mono">{e.rota}</span>}
                  {e.email && <span>{e.email}</span>}
                  {e.digest && <span className="font-mono">#{e.digest}</span>}
                </div>
                <p className="mt-1 text-text-primary break-words">{e.mensagem}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

const PERIODOS = [
  { id: "mes", rotulo: "Este mês" },
  { id: "30", rotulo: "30 dias" },
  { id: "90", rotulo: "90 dias" },
] as const;

function inicioDo(periodo: (typeof PERIODOS)[number]["id"]): string {
  const hoje = hojeIsoLocal();
  if (periodo === "mes") return `${hoje.slice(0, 7)}-01`;
  const d = new Date(`${hoje}T12:00:00`);
  d.setDate(d.getDate() - Number(periodo));
  return hojeIsoLocal(d);
}

function lerPreco(chave: string, padrao: string): string {
  try {
    return window.localStorage.getItem(chave) ?? padrao;
  } catch {
    return padrao;
  }
}

/**
 * Admin → Uso de IA (onda D): gerações de texto e imagens da IA do SISTEMA por conta, e o
 * custo estimado com o preço por chamada que você informar (fica guardado neste navegador).
 * Quem usa a própria chave de IA não entra aqui: não gasta a do sistema.
 */
export function UsoIAAdmin() {
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]["id"]>("mes");
  const [dados, setDados] = useState<{ migracaoOk: boolean; linhas: UsoIALinha[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [precoTexto, setPrecoTexto] = useState("0,01");
  const [precoImagem, setPrecoImagem] = useState("0,25");

  useEffect(() => {
    // Preferência deste navegador: lida depois de montar (no servidor não há localStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com armazenamento externo
    setPrecoTexto(lerPreco("admin:ia:preco-texto", "0,01"));
    setPrecoImagem(lerPreco("admin:ia:preco-imagem", "0,25"));
  }, []);

  useEffect(() => {
    let vivo = true;
    executar(carregarUsoIA(inicioDo(periodo)))
      .then((d) => vivo && setDados(d))
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : "Erro ao carregar"));
    return () => {
      vivo = false;
    };
  }, [periodo]);

  function guardar(chave: string, valor: string, set: (v: string) => void) {
    set(valor);
    try {
      window.localStorage.setItem(chave, valor);
    } catch {
      // Sem armazenamento: vale só nesta visita.
    }
  }

  if (erro)
    return (
      <Card>
        <p className="text-sm text-negative">{erro}</p>
      </Card>
    );
  const pt = numeroOuNulo(precoTexto.replace(",", ".")) ?? 0;
  const pi = numeroOuNulo(precoImagem.replace(",", ".")) ?? 0;
  const linhas = dados?.linhas ?? [];
  const custo = (l: UsoIALinha) => l.geracoes * pt + l.imagens * pi;
  const total = linhas.reduce((s, l) => s + custo(l), 0);

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-end gap-3">
        <ChipRow>
          {PERIODOS.map((p) => (
            <Chip key={p.id} ativo={periodo === p.id} onClick={() => setPeriodo(p.id)}>
              {p.rotulo}
            </Chip>
          ))}
        </ChipRow>
        <label className="text-xs text-text-secondary">
          R$ por geração de texto
          <input
            className={`${campoBase} block w-28 mt-1`}
            inputMode="decimal"
            value={precoTexto}
            onChange={(e) => guardar("admin:ia:preco-texto", e.target.value, setPrecoTexto)}
          />
        </label>
        <label className="text-xs text-text-secondary">
          R$ por imagem
          <input
            className={`${campoBase} block w-28 mt-1`}
            inputMode="decimal"
            value={precoImagem}
            onChange={(e) => guardar("admin:ia:preco-imagem", e.target.value, setPrecoImagem)}
          />
        </label>
      </div>

      {!dados ? (
        <Card>
          <p className="text-sm text-text-secondary">Carregando o uso de IA…</p>
        </Card>
      ) : !dados.migracaoOk ? (
        <Card>
          <p className="text-sm text-text-secondary">{AVISO_MIGRACAO}</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardEyebrow>Gerações de texto</CardEyebrow>
              <HeroMetric
                value={linhas.reduce((s, l) => s + l.geracoes, 0).toLocaleString("pt-BR")}
                caption={`${linhas.reduce((s, l) => s + l.cache_hits, 0).toLocaleString("pt-BR")} vieram do cache (grátis)`}
              />
            </Card>
            <Card>
              <CardEyebrow>Imagens</CardEyebrow>
              <HeroMetric value={linhas.reduce((s, l) => s + l.imagens, 0).toLocaleString("pt-BR")} />
            </Card>
            <Card>
              <CardEyebrow>Custo estimado</CardEyebrow>
              <HeroMetric value={formatBRL(total)} accent caption={`${linhas.length} conta(s) usando`} />
            </Card>
          </div>
          {linhas.length === 0 ? (
            <Card>
              <EmptyState icon={Sparkles} title="Ninguém usou a IA do sistema no período" />
            </Card>
          ) : (
            <Card className="p-0 overflow-x-auto">
              <CardTitle className="px-4 pt-4">Por conta</CardTitle>
              <table className="w-full text-sm mt-2">
                <thead className="text-xs text-text-secondary bg-surface-2">
                  <tr>
                    <th className="text-left font-medium px-4 py-2">Conta</th>
                    <th className="text-right font-medium px-4 py-2">Textos</th>
                    <th className="text-right font-medium px-4 py-2">Cache</th>
                    <th className="text-right font-medium px-4 py-2">Imagens</th>
                    <th className="text-right font-medium px-4 py-2">Custo est.</th>
                  </tr>
                </thead>
                <tbody>
                  {[...linhas]
                    .sort((a, b) => custo(b) - custo(a))
                    .map((l) => (
                      <tr key={l.user_id} className="border-t border-border">
                        <td className="px-4 py-2">
                          <div className="text-text-primary">{l.negocio || l.email}</div>
                          {l.negocio && <div className="text-xs text-text-tertiary">{l.email}</div>}
                        </td>
                        <td className="px-4 py-2 text-right font-mono">{l.geracoes.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2 text-right font-mono text-text-secondary">{l.cache_hits.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2 text-right font-mono">{l.imagens.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2 text-right font-mono">{formatBRL(custo(l))}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
          )}
          <p className="text-xs text-text-tertiary">
            Estimativa: confira o preço real no painel do Google (Gemini). Contas com a própria chave de IA não gastam a do sistema e não aparecem aqui.
          </p>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { executar } from "@/lib/acao";
import { executarComToast } from "@/lib/acao-cliente";
import { formatarDataIso } from "@/lib/format";
import { linkBackupAutomatico, listarBackupsAutomaticos } from "@/app/(painel)/configuracoes/dados-actions";

/**
 * Backups automáticos (onda D, 0076): toda segunda o sistema guarda uma cópia da conta e
 * mantém as 4 últimas. Aqui a pessoa baixa qualquer uma delas.
 */
export function BackupsAutomaticos() {
  const [lista, setLista] = useState<{ nome: string; tamanho: number | null }[] | null>(null);
  const [baixando, setBaixando] = useState<string | null>(null);

  useEffect(() => {
    executar(listarBackupsAutomaticos())
      .then(setLista)
      .catch(() => setLista([]));
  }, []);

  async function baixar(nome: string) {
    setBaixando(nome);
    const r = await executarComToast(linkBackupAutomatico(nome), { erro: "Erro ao baixar o backup" });
    setBaixando(null);
    if (r.ok) window.location.assign(r.dado);
  }

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="text-sm font-medium text-text-primary">Backups automáticos</div>
      <p className="text-xs text-text-secondary mt-0.5 mb-2">Toda segunda-feira o sistema guarda uma cópia da sua conta. As 4 mais recentes ficam aqui.</p>
      {lista === null ? (
        <p className="text-xs text-text-tertiary">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-xs text-text-tertiary">Nenhum backup automático ainda. O primeiro sai na próxima segunda-feira.</p>
      ) : (
        <ul className="space-y-1.5">
          {lista.map((b) => (
            <li key={b.nome} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-text-primary">
                {formatarDataIso(b.nome.replace(".json", ""))}
                {b.tamanho ? (
                  <span className="text-xs text-text-tertiary"> · {(b.tamanho / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB</span>
                ) : null}
              </span>
              <Button size="sm" variant="ghost" loading={baixando === b.nome} onClick={() => baixar(b.nome)}>
                <Download size={14} /> Baixar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

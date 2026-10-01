"use client";

import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { executarComToast } from "@/lib/acao-cliente";
import type { ConexaoResumo } from "@/lib/marketplace/pedidos-servidor";
import { desconectarShopee, sincronizarShopee } from "@/app/(painel)/vendas/marketplace-actions";
import type { LojaMarketplace } from "./ImportarShopeeModal";

const AVISO: Record<string, [string, "ok" | "erro"]> = {
  conectada: ["Loja conectada à Shopee. Clique em Sincronizar agora para puxar os pedidos.", "ok"],
  erro: ["Não foi possível conectar a loja à Shopee. Tente de novo.", "erro"],
  desligada: ["A integração com a API da Shopee não está ligada neste sistema.", "erro"],
};

/**
 * API oficial por loja: conectar (autorização na Shopee), sincronizar agora e desligar.
 * Só aparece quando o sistema tem as credenciais de parceiro; sem elas, vale a planilha.
 */
export function ConexaoShopee({ lojas, conexoes, aviso }: { lojas: LojaMarketplace[]; conexoes: ConexaoResumo[]; aviso: string | null }) {
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const a = aviso ? AVISO[aviso] : null;
    if (a) (a[1] === "ok" ? toast.success : toast.error)(a[0]);
  }, [aviso]);

  const lojasShopee = lojas.filter((l) => /shopee/i.test(`${l.canalNome} ${l.nome}`));
  if (lojasShopee.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-3 mb-4">
      <div className="flex items-center gap-2 text-sm font-medium text-text-primary mb-2">
        <PlugZap size={15} className="text-accent" /> API oficial da Shopee
      </div>
      <div className="space-y-2">
        {lojasShopee.map((l) => {
          const c = conexoes.find((x) => x.loja_id === l.id);
          return (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <span className="text-text-primary">{l.nome}</span>
                <span className="text-xs text-text-tertiary">
                  {" "}
                  ·{" "}
                  {c
                    ? c.ultimo_erro
                      ? `erro na última sincronização: ${c.ultimo_erro}`
                      : c.ultima_sincronizacao
                        ? `sincronizada em ${new Date(c.ultima_sincronizacao).toLocaleString("pt-BR")}`
                        : "conectada, ainda não sincronizada"
                    : "não conectada"}
                </span>
              </div>
              {c ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    loading={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const r = await executarComToast(sincronizarShopee(l.id), { erro: "Erro ao sincronizar" });
                        if (r.ok) toast.success(`${r.dado.pedidos} pedido(s) lido(s): ${r.dado.novos} novo(s), ${r.dado.atualizados} atualizado(s).`);
                      })
                    }
                  >
                    <RefreshCw size={13} /> Sincronizar agora
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => startTransition(async () => void (await executarComToast(desconectarShopee(l.id), { sucesso: "Loja desconectada", erro: "Erro ao desconectar" })))}
                  >
                    Desconectar
                  </Button>
                </div>
              ) : (
                <a href={`/api/shopee/conectar?loja=${l.id}`}>
                  <Button variant="secondary">Conectar</Button>
                </a>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-text-tertiary mt-2">Conectada, a loja também sincroniza sozinha uma vez por dia. A planilha continua valendo.</p>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { PlugZap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { executarComToast } from "@/lib/acao-cliente";
import type { ConexaoResumo } from "@/lib/marketplace/pedidos-servidor";
import { desconectarShopee, sincronizarShopee } from "@/app/(painel)/vendas/marketplace-actions";

/**
 * Situação da API de UMA loja da Shopee, dentro do cartão da loja em Canais de venda:
 * conectada (última sincronização ou erro), Sincronizar agora, Desconectar; ou Conectar.
 */
export function ConexaoLoja({
  lojaId,
  conexao,
  apiLigada,
}: {
  lojaId: string;
  conexao: ConexaoResumo | undefined;
  /** O servidor tem as credenciais da Shopee (senão o aviso fica no topo da aba). */
  apiLigada: boolean;
}) {
  const [pending, startTransition] = useTransition();
  if (!apiLigada) return null;

  if (!conexao) {
    return (
      <a href={`/api/shopee/conectar?loja=${lojaId}&volta=configuracoes`} className="shrink-0">
        <Button variant="secondary" size="sm">
          <PlugZap size={13} /> Conectar API
        </Button>
      </a>
    );
  }

  const situacao = conexao.ultimo_erro
    ? { texto: `Erro: ${conexao.ultimo_erro}`, classe: "text-negative" }
    : conexao.ultima_sincronizacao
      ? { texto: `Sincronizada ${new Date(conexao.ultima_sincronizacao).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`, classe: "text-text-tertiary" }
      : { texto: "Conectada, ainda não sincronizada", classe: "text-text-tertiary" };

  return (
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      <span className={`text-[11px] max-w-[16rem] truncate ${situacao.classe}`} title={situacao.texto}>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-positive mr-1 align-middle" />
        {situacao.texto}
      </span>
      <Button
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await executarComToast(sincronizarShopee(lojaId), { erro: "Erro ao sincronizar" });
            if (r.ok) toast.success(`${r.dado.pedidos} pedido(s) lido(s): ${r.dado.novos} novo(s), ${r.dado.atualizados} atualizado(s).`);
          })
        }
      >
        <RefreshCw size={13} /> Sincronizar
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => startTransition(async () => void (await executarComToast(desconectarShopee(lojaId), { sucesso: "Loja desconectada", erro: "Erro ao desconectar" })))}
      >
        Desconectar
      </Button>
    </div>
  );
}

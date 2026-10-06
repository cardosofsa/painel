"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Boxes, PlugZap, RefreshCw } from "lucide-react";
import { Button, classesBotao } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/ConfirmModal";
import { executarComToast } from "@/lib/acao-cliente";
import type { ConexaoResumo } from "@/lib/marketplace/pedidos-servidor";
import { definirEstoqueAutomatico, desconectarShopee, sincronizarShopee } from "@/app/(painel)/vendas/marketplace-actions";
import { EstoqueShopeeModal } from "@/components/configuracoes/EstoqueShopeeModal";
import { formatarDataHora } from "@/lib/format";

/**
 * Situação da API de UMA loja da Shopee, dentro do cartão da loja em Canais de venda:
 * conectada (última sincronização ou erro), Sincronizar, estoque automático e Desconectar;
 * ou Conectar.
 */
export function ConexaoLoja({
  lojaId,
  nomeLoja,
  conexao,
  apiLigada,
  plataforma = "shopee",
}: {
  plataforma?: "shopee" | "mercadolivre";
  lojaId: string;
  nomeLoja: string;
  conexao: ConexaoResumo | undefined;
  /** O servidor tem as credenciais da Shopee (senão o aviso fica no topo da aba). */
  apiLigada: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [previa, setPrevia] = useState(false);
  const { confirm, ConfirmDialog } = useConfirm();
  if (!apiLigada) return null;

  if (!conexao) {
    return (
      <a href={`/api/${plataforma}/conectar?loja=${lojaId}&volta=configuracoes`} className={`${classesBotao({ variant: "secondary", size: "sm" })} shrink-0`}>
        <PlugZap size={13} /> Conectar API
      </a>
    );
  }

  const situacao = conexao.ultimo_erro
    ? { texto: `Erro: ${conexao.ultimo_erro}`, classe: "text-negative" }
    : conexao.ultima_sincronizacao
      ? { texto: `Sincronizada ${formatarDataHora(conexao.ultima_sincronizacao)}`, classe: "text-text-tertiary" }
      : { texto: "Conectada, ainda não sincronizada", classe: "text-text-tertiary" };

  return (
    <div className="flex flex-wrap items-center gap-2 shrink-0">
      <span className={`text-xs max-w-[16rem] truncate ${situacao.classe}`} title={situacao.texto}>
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-positive mr-1 align-middle" />
        {situacao.texto}
      </span>
      {conexao.estoque_auto !== undefined &&
        (conexao.estoque_auto ? (
          <button
            type="button"
            title="O estoque do Sertão é enviado sozinho para os anúncios desta loja. Clique para desligar."
            className="inline-flex items-center gap-1 text-xs rounded-full bg-positive-soft text-positive px-2 py-0.5"
            onClick={() =>
              startTransition(async () => {
                await executarComToast(definirEstoqueAutomatico(lojaId, false), { sucesso: "Envio automático de estoque desligado", erro: "Erro ao desligar" });
              })
            }
          >
            <Boxes size={11} /> Estoque automático
          </button>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setPrevia(true)}>
            <Boxes size={13} /> Enviar estoque
          </Button>
        ))}
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
        onClick={async () => {
          const ok = await confirm({
            title: `Desconectar ${nomeLoja}?`,
            message: "Os pedidos param de chegar sozinhos e o estoque deixa de ser enviado. Para voltar, é preciso conectar de novo com o login da loja.",
            confirmLabel: "Desconectar",
          });
          if (ok) startTransition(async () => void (await executarComToast(desconectarShopee(lojaId), { sucesso: "Loja desconectada", erro: "Erro ao desconectar" })));
        }}
      >
        Desconectar
      </Button>
      {ConfirmDialog}
      {previa && <EstoqueShopeeModal lojaId={lojaId} nomeLoja={nomeLoja} onClose={() => setPrevia(false)} />}
    </div>
  );
}

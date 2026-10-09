"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Link2, RefreshCw, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Paginacao } from "@/components/ui/Paginacao";
import { RowMenu } from "@/components/ui/RowMenu";
import { Table, Thead, Th, Td, Tr } from "@/components/ui/Table";
import { campoBase } from "@/components/ui/Modal";
import { SubAbas } from "@/components/vendas/central/SubAbas";
import { useListaNaUrl } from "@/lib/hooks/useListaNaUrl";
import { executarComToast } from "@/lib/acao-cliente";
import type { AbaMapeamento } from "@/lib/marketplace/anuncios-mapeamento";
import { desmapearAnuncio, detectarAnuncios } from "../mapeamento-actions";
import { MapearAnuncioModal } from "./MapearAnuncioModal";

export type PlataformaMapeamento = "shopee" | "mercadolivre";
export interface LojaMapeamento {
  id: string;
  nome: string;
}
export interface AnuncioLinha {
  id: string;
  lojaId: string;
  loja: string;
  /** Como a plataforma mostra o ID (Shopee: número; ML: MLB…). */
  anuncioId: string;
  modeloId: string;
  titulo: string;
  variacao: string | null;
  skuAnuncio: string | null;
  imagem: string | null;
  link: string | null;
  produto: { id: string; nome: string; sku: string | null } | null;
}

const ROTULO_PLATAFORMA: Record<PlataformaMapeamento, string> = { shopee: "Shopee", mercadolivre: "Mercado Livre" };

export function MapeamentoClient({
  plataformas,
  plataforma,
  lojas,
  filtro,
  anuncios,
  total,
  contagens,
  semTabela,
}: {
  plataformas: PlataformaMapeamento[];
  plataforma: PlataformaMapeamento;
  lojas: LojaMapeamento[];
  filtro: { q: string; pagina: number; loja: string; aba: AbaMapeamento };
  anuncios: AnuncioLinha[];
  total: number;
  contagens: Record<AbaMapeamento, number>;
  semTabela: boolean;
}) {
  const lista = useListaNaUrl({ ...filtro, plataforma });
  const [pending, startTransition] = useTransition();
  const [mapeando, setMapeando] = useState<AnuncioLinha | null>(null);
  const atuais = lista.atuais;

  function detectar() {
    startTransition(async () => {
      const r = await executarComToast(detectarAnuncios(atuais.loja || null), { erro: "Erro ao detectar os anúncios" });
      if (!r.ok) return;
      const { anuncios: n, lojas: l, erros } = r.dado;
      if (l > 0) toast.success(`${n} ${n === 1 ? "anúncio detectado" : "anúncios detectados"} em ${l} ${l === 1 ? "loja" : "lojas"}.`);
      if (erros.length) toast.error(`Falhou em ${erros.length} ${erros.length === 1 ? "loja" : "lojas"}: ${erros[0]}`);
    });
  }

  function desmapear(a: AnuncioLinha) {
    startTransition(async () => {
      const r = await executarComToast(desmapearAnuncio(a.id), { sucesso: "Vínculo removido", erro: "Erro ao remover o vínculo" });
      if (r.ok && r.dado.voltaPorSku) toast.message("O SKU deste anúncio é igual ao de um produto: ele volta a ser mapeado por SKU na próxima detecção.");
    });
  }

  const voltar = (
    <Link href="/produtos" className="inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary">
      <ArrowLeft size={14} /> Produtos
    </Link>
  );

  if (plataformas.length === 0 || semTabela) {
    return (
      <>
        <PageHeader title="Mapeamento de Anúncio" actions={voltar} />
        <Card>
          <EmptyState
            icon={Link2}
            title={semTabela ? "Falta aplicar uma migração" : "Nenhuma loja conectada"}
            description={
              semTabela
                ? "A lista de anúncios precisa da migração 0049 no Supabase. Aplique e recarregue."
                : "Conecte sua loja Shopee ou Mercado Livre em Configurações > Canais de venda para listar e mapear os anúncios."
            }
            action={
              !semTabela && (
                <Link href="/configuracoes?aba=canais">
                  <Button variant="primary">Ir para Canais de venda</Button>
                </Link>
              )
            }
          />
        </Card>
      </>
    );
  }

  const abas: { id: AbaMapeamento; rotulo: string; n: number }[] = [
    { id: "todos", rotulo: "Todos", n: contagens.todos },
    { id: "nao_mapeado", rotulo: "Não mapeado", n: contagens.nao_mapeado },
    { id: "mapeado", rotulo: "Mapeado", n: contagens.mapeado },
  ];

  return (
    <>
      <PageHeader
        title="Mapeamento de Anúncio"
        descricao="Vincule cada anúncio das suas lojas a um produto. É o que baixa o estoque, calcula o custo e envia o saldo para a loja."
        actions={
          <>
            {voltar}
            <Button variant="primary" onClick={detectar} loading={pending}>
              <RefreshCw size={14} /> Detectar anúncios
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {plataformas.length > 1 &&
          plataformas.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={plataforma === p}
              onClick={() => lista.navegar({ plataforma: p, loja: null, aba: null })}
              className={`text-sm rounded-md border px-3 py-1.5 ${plataforma === p ? "border-accent bg-accent-soft text-accent font-medium" : "border-border text-text-secondary hover:bg-surface-2"}`}
            >
              {ROTULO_PLATAFORMA[p]}
            </button>
          ))}
        {lojas.length > 1 && (
          <select aria-label="Loja" className={`${campoBase} max-w-48`} value={atuais.loja} onChange={(e) => lista.navegar({ loja: e.target.value || null })}>
            <option value="">Todas as lojas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome}
              </option>
            ))}
          </select>
        )}
        <div className="relative flex-1 min-w-52 max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" aria-hidden />
          <input
            type="search"
            aria-label="Buscar anúncio"
            className={`${campoBase} w-full pl-8`}
            placeholder="Título, SKU ou ID do anúncio"
            value={lista.texto}
            onChange={(e) => lista.setTexto(e.target.value)}
          />
        </div>
      </div>

      <Card padding="nenhum">
        <div className="px-4 pt-4 pb-3">
          <SubAbas itens={abas} valor={atuais.aba} onChange={(aba) => lista.navegar({ aba: aba === "todos" ? null : aba })} />
        </div>
        {anuncios.length === 0 ? (
          <EmptyState
            icon={Link2}
            title={contagens.todos === 0 ? "Nenhum anúncio lido ainda" : "Nenhum anúncio neste filtro"}
            description={contagens.todos === 0 ? "Clique em “Detectar anúncios” para ler os anúncios da loja." : "Troque a aba, a loja ou a busca."}
          />
        ) : (
          <Table className={lista.pendente ? "opacity-60 transition-opacity" : ""}>
            <Thead>
              <tr>
                <Th>Anúncio</Th>
                <Th secundaria>ID do anúncio</Th>
                <Th secundaria>Variante</Th>
                <Th secundaria>SKU do anúncio</Th>
                <Th>Produto mapeado</Th>
                <Th align="right">Ações</Th>
              </tr>
            </Thead>
            <tbody>
              {anuncios.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    <div className="flex items-center gap-3 min-w-0">
                      {a.imagem ? (
                        <Image src={a.imagem} alt="" width={40} height={40} unoptimized className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
                      ) : (
                        <div className="h-10 w-10 shrink-0 rounded-md border border-border bg-surface-2" aria-hidden />
                      )}
                      <div className="min-w-0">
                        <div className="truncate max-w-xs text-text-primary" title={a.titulo}>
                          {a.titulo}
                        </div>
                        <div className="text-xs text-text-tertiary">{a.loja}</div>
                      </div>
                    </div>
                  </Td>
                  <Td secundaria mono>
                    {a.link ? (
                      <a href={a.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                        {a.anuncioId} <ExternalLink size={11} aria-hidden />
                      </a>
                    ) : (
                      a.anuncioId
                    )}
                  </Td>
                  <Td secundaria>
                    {a.variacao ?? <span className="text-text-tertiary">—</span>}
                    {a.modeloId !== "0" && <div className="text-xs text-text-tertiary font-mono">ID: {a.modeloId}</div>}
                  </Td>
                  <Td secundaria mono>
                    {a.skuAnuncio ?? <span className="text-text-tertiary">—</span>}
                  </Td>
                  <Td>
                    {a.produto ? (
                      <div>
                        <div className="truncate max-w-56" title={a.produto.nome}>
                          {a.produto.nome}
                        </div>
                        {a.produto.sku && <div className="text-xs text-text-tertiary font-mono">{a.produto.sku}</div>}
                      </div>
                    ) : (
                      <span className="text-text-tertiary">Não mapeado</span>
                    )}
                  </Td>
                  <Td align="right">
                    {a.produto ? (
                      <RowMenu
                        actions={[
                          { label: "Alterar produto", onClick: () => setMapeando(a) },
                          { label: "Remover vínculo", onClick: () => desmapear(a), destructive: true },
                        ]}
                      />
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => setMapeando(a)}>
                        Mapear
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <Paginacao pagina={atuais.pagina} total={total} onPagina={lista.irPara} carregando={lista.pendente} unidade="anúncios" />
      </Card>

      {mapeando && <MapearAnuncioModal key={mapeando.id} anuncio={mapeando} onClose={() => setMapeando(null)} />}
    </>
  );
}

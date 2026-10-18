import Link from "next/link";
import { ArrowRight, BarChart3, Palette, Sparkles, Store } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AberturaMarca } from "@/components/anuncio/AberturaMarca";
import { Card, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/Badge";
import { formatBRL, formatarDataHora } from "@/lib/format";
import { calcularEtapas } from "@/lib/anuncio/etapas";
import { lerEstado } from "@/lib/estudio/servidor";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Anúncio" };

interface LinhaRascunho {
  id: string;
  produto_id: string;
  titulo: string | null;
  descricao: string | null;
  status: string;
  estado: unknown;
  atualizado_em: string;
  produtos: { nome: string } | null;
}

const estadoTemItem = (estado: unknown) => !!lerEstado(estado).itemShopee;

export default async function AnuncioPage() {
  const supabase = await createClient();
  const [{ data }, anunciosRes] = await Promise.all([
    supabase.from("anuncio_rascunhos").select("id, produto_id, titulo, descricao, status, estado, atualizado_em, produtos(nome)").order("atualizado_em", { ascending: false }).limit(6),
    // `*`: nome_item, imagem_url e preco_atual dependem de migrações (0071/0093).
    supabase.from("marketplace_anuncios").select("*").order("atualizado_em", { ascending: false }).limit(400),
  ]);
  // Um por item (as variações de um anúncio são o mesmo anúncio na loja).
  const vistos = new Set<string>();
  const meus = ((anunciosRes.data ?? []) as { id: string; loja_id: string; item_id: number; nome?: string | null; nome_item?: string | null; imagem_url?: string | null; preco_atual?: number | null; produto_id: string | null }[])
    .filter((a) => {
      const k = `${a.loja_id}:${a.item_id}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    })
    .slice(0, 20);
  const rascunhos = ((data ?? []) as unknown as LinhaRascunho[]).map((r) => {
    const estado = lerEstado(r.estado);
    const etapas = calcularEtapas({
      lojaDecidida: true,
      produtoId: r.produto_id,
      rascunhoAberto: true,
      titulo: r.titulo,
      descricao: r.descricao,
      capaAprovada: (estado.capas ?? []).some((c) => c.veredito === "aprovada"),
      itemCriadoNaShopee: !!estado.itemShopee,
      publicado: r.status === "publicado",
    });
    return { ...r, etapas };
  });

  return (
    <>
      <AberturaMarca eyebrow="Anúncio" titulo="Do produto ao anúncio pronto" texto="Título, capa e descrição no padrão da sua loja, passo a passo. A IA propõe, você aprova, e o anúncio vai para a Shopee como não listado.">
        <Link
          href="/anuncio/infinito"
          className="inline-flex items-center gap-2 rounded-lg bg-marca-sol px-6 py-3.5 text-base font-semibold text-background shadow-elev-2 transition-transform hover:-translate-y-0.5 focus-visible:outline-offset-4"
        >
          <Sparkles size={18} aria-hidden /> Anúncio Infinito <ArrowRight size={18} aria-hidden />
        </Link>
      </AberturaMarca>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Link href="/anuncio/infinito?config=perfil" className="group">
          <Card className="h-full transition-colors group-hover:border-border-forte">
            <Palette size={20} className="text-accent mb-2" aria-hidden />
            <CardTitle>Meu padrão</CardTitle>
            <CardSubtitle>Loja, plataforma, visual e termos proibidos. Fica dentro do Anúncio Infinito, em Configurações.</CardSubtitle>
          </Card>
        </Link>
        <Link href="/vendas/insights" className="group">
          <Card className="h-full transition-colors group-hover:border-border-forte">
            <BarChart3 size={20} className="text-accent mb-2" aria-hidden />
            <CardTitle>O que replicar e evitar</CardTitle>
            <CardSubtitle>Insights dos anúncios que mais vendem, com os números por trás.</CardSubtitle>
          </Card>
        </Link>
      </div>

      <Card className="mb-6">
        <CardTitle>Meus anúncios na loja</CardTitle>
        <CardSubtitle>Os anúncios sincronizados das lojas conectadas: análise completa e ajuste de preço.</CardSubtitle>
        {meus.length === 0 ? (
          <EmptyState icon={Store} title="Nenhum anúncio sincronizado" description="Conecte a loja da Shopee em Configurações › Canais de venda e sincronize: os anúncios aparecem aqui." />
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {meus.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5">
                {a.imagem_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.imagem_url} alt="" className="h-10 w-10 rounded-md border border-border object-cover bg-surface-2 shrink-0" loading="lazy" referrerPolicy="no-referrer" />
                ) : (
                  <span className="h-10 w-10 rounded-md bg-surface-2 shrink-0" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-text-primary truncate">{a.nome_item ?? a.nome ?? `Anúncio ${a.item_id}`}</span>
                  <span className="block text-xs text-text-secondary">
                    {a.preco_atual ? formatBRL(Number(a.preco_atual)) : "sem preço lido"}
                    {!a.produto_id && " · sem produto ligado"}
                  </span>
                </span>
                <span className="flex items-center gap-3 text-sm shrink-0">
                  <Link href={`/anuncio/analise/${a.id}`} className="text-accent hover:underline">
                    Analisar
                  </Link>
                  <Link href={`/precificacao/ajuste/${a.id}`} className="text-accent hover:underline hidden sm:inline">
                    Ajuste de Preço
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Anúncios em andamento</CardTitle>
        <CardSubtitle>Continue de onde parou.</CardSubtitle>
        {rascunhos.length === 0 ? (
          <EmptyState icon={Sparkles} title="Nenhum anúncio começado" description="Clique em Anúncio Infinito para criar o primeiro." />
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {rascunhos.map((r) => {
              const proxima = r.etapas.etapas.find((e) => e.id === r.etapas.atual)!;
              return (
                <li key={r.id}>
                  <Link href={`/anuncio/infinito?rascunho=${r.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-surface-2 -mx-2 px-2 rounded-md">
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text-primary truncate">{r.titulo || r.produtos?.nome || "Anúncio sem título"}</span>
                      <span className="block text-xs text-text-secondary">
                        {r.etapas.feitas} de 6 etapas · próxima: {proxima.rotulo} · {formatarDataHora(r.atualizado_em)}
                      </span>
                    </span>
                    <StatusChip
                      tone={r.status === "publicado" || r.status === "pronto" ? "positive" : "neutral"}
                      label={r.status === "publicado" ? (estadoTemItem(r.estado) ? "Na Shopee" : "Publicado") : r.status === "pronto" ? "Pronto" : "Em andamento"}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

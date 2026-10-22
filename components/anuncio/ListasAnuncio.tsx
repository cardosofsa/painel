"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Sparkles, Store } from "lucide-react";
import { BarraFiltros, FiltroChips } from "@/components/ui/BarraFiltros";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/Badge";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { formatBRL, formatarDataHora } from "@/lib/format";
import { normalizar } from "@/lib/conformidade/termos";

/** Quantos itens aparecem antes de "Mostrar mais". */
const PAGINA = 12;

export interface RascunhoDaLista {
  id: string;
  titulo: string;
  imagem: string | null;
  status: "rascunho" | "pronto" | "publicado";
  naShopee: boolean;
  feitas: number;
  total: number;
  proxima: string | null;
  atualizadoEm: string;
}

export interface AnuncioDaLoja {
  id: string;
  titulo: string;
  imagem: string | null;
  /** Menor preço no ar entre as variações (`precoMax` o maior). */
  preco: number | null;
  precoMax: number | null;
  variacoes: number;
  /** Alguma variação sem produto ligado. */
  semProduto: boolean;
}

type FiltroRascunho = "todos" | "rascunho" | "pronto" | "publicado";

const contem = (alvo: string, busca: string) => normalizar(alvo).includes(normalizar(busca.trim()));

function Miniatura({ src }: { src: string | null }) {
  return src ? (
    <ImagemStorage src={src} alt="" className="h-11 w-11 shrink-0 rounded-md border border-border object-cover bg-surface-2" />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-tertiary" aria-hidden="true">
      <Sparkles size={16} />
    </span>
  );
}

function MostrarMais({ restantes, onClick }: { restantes: number; onClick: () => void }) {
  if (restantes <= 0) return null;
  return (
    <div className="mt-3 flex justify-center">
      <Button variant="ghost" size="sm" onClick={onClick}>
        Mostrar mais {Math.min(restantes, PAGINA)} de {restantes}
      </Button>
    </div>
  );
}

/** A12: todos os rascunhos do Anúncio Infinito, com filtro por status e busca. */
export function RascunhosAnuncio({ rascunhos }: { rascunhos: RascunhoDaLista[] }) {
  const [filtro, setFiltro] = useState<FiltroRascunho>("todos");
  const [busca, setBusca] = useState("");
  const [visiveis, setVisiveis] = useState(PAGINA);

  const contagem = useMemo(() => {
    const c = { todos: rascunhos.length, rascunho: 0, pronto: 0, publicado: 0 };
    for (const r of rascunhos) c[r.status] += 1;
    return c;
  }, [rascunhos]);
  const lista = rascunhos.filter((r) => (filtro === "todos" || r.status === filtro) && (!busca.trim() || contem(r.titulo, busca)));

  if (rascunhos.length === 0) return <EmptyState icon={Sparkles} title="Nenhum anúncio começado" description="Clique em Anúncio Infinito para criar o primeiro." />;

  return (
    <>
      <BarraFiltros
        busca={busca}
        onBusca={(v) => {
          setBusca(v);
          setVisiveis(PAGINA);
        }}
        placeholder="Buscar anúncio ou produto"
        ativos={filtro === "todos" ? 0 : 1}
        onLimpar={() => {
          setBusca("");
          setFiltro("todos");
        }}
        situacao={
          <FiltroChips
            rotulo="Status"
            valor={filtro}
            onChange={(v) => {
              setFiltro(v);
              setVisiveis(PAGINA);
            }}
            opcoes={[
              { valor: "todos", rotulo: "Todos", quantidade: contagem.todos },
              { valor: "rascunho", rotulo: "Em andamento", quantidade: contagem.rascunho },
              { valor: "pronto", rotulo: "Prontos", quantidade: contagem.pronto },
              { valor: "publicado", rotulo: "Publicados", quantidade: contagem.publicado },
            ]}
          />
        }
      />
      {lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">Nenhum anúncio com esse filtro.</p>
      ) : (
        <ul className="divide-y divide-border">
          {lista.slice(0, visiveis).map((r) => (
            <li key={r.id}>
              <Link href={`/anuncio/infinito?rascunho=${r.id}`} className="group -mx-2 flex items-center gap-3 rounded-md px-2 py-3 hover:bg-surface-2">
                <Miniatura src={r.imagem} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-text-primary">{r.titulo}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {/* Progresso das etapas: número e barra (a cor nunca é o único sinal). */}
                    <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-surface-3" aria-hidden="true">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${(r.feitas / r.total) * 100}%` }} />
                    </span>
                    <span className="text-xs text-text-secondary">
                      {r.feitas} de {r.total}
                      {r.proxima && r.status === "rascunho" ? ` · próxima: ${r.proxima}` : ""} · {formatarDataHora(r.atualizadoEm)}
                    </span>
                  </span>
                </span>
                <StatusChip
                  tone={r.status === "rascunho" ? "neutral" : "positive"}
                  label={r.status === "publicado" ? (r.naShopee ? "Na Shopee" : "Publicado") : r.status === "pronto" ? "Pronto" : "Em andamento"}
                />
                <ChevronRight size={16} className="hidden shrink-0 text-text-tertiary group-hover:text-text-primary sm:block" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <MostrarMais restantes={lista.length - visiveis} onClick={() => setVisiveis((n) => n + PAGINA)} />
    </>
  );
}

/** Os anúncios sincronizados da loja, com busca: análise e ajuste de preço. */
export function AnunciosNaLoja({ anuncios }: { anuncios: AnuncioDaLoja[] }) {
  const [busca, setBusca] = useState("");
  const [visiveis, setVisiveis] = useState(PAGINA);

  if (anuncios.length === 0) return <EmptyState icon={Store} title="Nenhum anúncio sincronizado" description="Conecte a loja da Shopee em Configurações › Canais de venda e sincronize: os anúncios aparecem aqui." />;
  const lista = anuncios.filter((a) => !busca.trim() || contem(a.titulo, busca));

  return (
    <>
      {anuncios.length > PAGINA && (
        <BarraFiltros
          busca={busca}
          onBusca={(v) => {
            setBusca(v);
            setVisiveis(PAGINA);
          }}
          placeholder="Buscar anúncio da loja"
          ativos={0}
          onLimpar={() => setBusca("")}
        />
      )}
      {lista.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-secondary">Nenhum anúncio com esse nome.</p>
      ) : (
        <ul className="divide-y divide-border">
          {lista.slice(0, visiveis).map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5">
              {a.imagem ? (
                // eslint-disable-next-line @next/next/no-img-element -- imagem da Shopee, fora do Storage
                <img src={a.imagem} alt="" className="h-11 w-11 shrink-0 rounded-md border border-border object-cover bg-surface-2" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span className="h-11 w-11 shrink-0 rounded-md bg-surface-2" aria-hidden="true" />
              )}
              <Link href={`/anuncio/item/${a.id}`} className="min-w-0 flex-1 group">
                <span className="block truncate text-sm font-medium text-text-primary group-hover:text-accent">{a.titulo}</span>
                <span className="block text-xs text-text-secondary">
                  <span className="font-mono">{a.preco ? (a.precoMax && a.precoMax !== a.preco ? `${formatBRL(a.preco)} – ${formatBRL(a.precoMax)}` : formatBRL(a.preco)) : "sem preço lido"}</span>
                  {a.variacoes > 1 && ` · ${a.variacoes} variações`}
                  {a.semProduto && (a.variacoes > 1 ? " · alguma sem produto ligado" : " · sem produto ligado")}
                </span>
              </Link>
              <span className="flex shrink-0 items-center gap-1">
                <Link href={`/anuncio/item/${a.id}`} className="rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft">
                  {a.variacoes > 1 ? "Reprecificar" : "Abrir"}
                </Link>
                <Link href={`/anuncio/analise/${a.id}`} className="hidden rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft sm:inline">
                  Analisar
                </Link>
                <Link href={`/precificacao/ajuste/${a.id}`} className="hidden rounded-md px-2 py-1 text-sm font-medium text-accent hover:bg-accent-soft sm:inline">
                  Ajuste de Preço
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      <MostrarMais restantes={lista.length - visiveis} onClick={() => setVisiveis((n) => n + PAGINA)} />
    </>
  );
}

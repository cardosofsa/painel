import { BookOpen, MapPin, MessageCircle, ShieldCheck } from "lucide-react";
import { IconeMarca } from "@/components/ui/IconeMarca";
import { EmptyState } from "@/components/ui/EmptyState";
import { ImagemStorage } from "@/components/ui/ImagemStorage";
import { VitrineInterativa } from "@/components/catalogo/VitrineInterativa";
import { DestaqueVitrine, SecoesFinaisVitrine } from "@/components/catalogo/VitrineSecoes";
import { agruparLinhas, decodificarCarrinho, montarCarrinho } from "@/lib/vitrine-catalogo";
import { normalizarSecoes } from "@/lib/vixe/vitrine";
import { createClient } from "@/lib/supabase/server";
import { buscarAparenciaPublica, buscarCatalogoPublico, buscarEmpresaPublica } from "@/app/vitrine/[slug]/dados";

function linkWhatsapp(numero: string | null): string | null {
  const d = numero?.replace(/\D/g, "");
  return d ? `https://wa.me/${d.startsWith("55") ? d : `55${d}`}` : null;
}

/**
 * Corpo da vitrine pública, usado por /vitrine/[slug] e por /vitrine/[slug]/p/[id] (link
 * de um produto, que abre a mesma vitrine com aquele produto em destaque).
 */
export async function VitrinePublica({ slug, carrinho, produtoInicial = null }: { slug: string; carrinho?: string; produtoInicial?: string | null }) {
  const [linhas, aparencia, empresa] = await Promise.all([buscarCatalogoPublico(slug), buscarAparenciaPublica(slug), buscarEmpresaPublica(slug)]);

  const nome = linhas[0]?.catalogo_nome;
  if (nome) {
    // Contador anônimo de acessos (0044). Falhar aqui nunca pode atrapalhar a vitrine.
    const supabase = await createClient();
    await supabase.rpc("registrar_visita_catalogo", { p_slug: slug }).then(
      () => undefined,
      () => undefined,
    );
  }

  const negocioWhatsapp = linhas[0]?.negocio_whatsapp ?? empresa?.whatsapp ?? null;
  const tituloExibido = aparencia?.titulo || nome;
  // Logo do catálogo; sem ele, o da empresa (Dados da Empresa). Sem nenhum, só o título.
  const logo = aparencia?.logo_url || empresa?.logo_url || null;
  const secoes = normalizarSecoes(aparencia?.secoes);
  // Produto sem preço NÃO é filtrado: vira "Consultar" na tela, e a RPC de pedido recusa.
  const itens = agruparLinhas(linhas);
  // Carrinho vindo do link "Compartilhar": só ids e quantidades; nome e preço são os de hoje.
  const carrinhoInicial = montarCarrinho(decodificarCarrinho(carrinho), itens);
  const zap = linkWhatsapp(negocioWhatsapp);
  const local = [empresa?.cidade, empresa?.uf].filter(Boolean).join(" / ");
  const insta = empresa?.instagram?.trim().replace(/^@/, "") || null;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8 pb-28">
        {!nome ? (
          <div className="bg-surface-1 border border-border rounded-lg">
            <EmptyState icon={BookOpen} title="Catálogo não encontrado" description="Esse link não existe mais ou o catálogo está indisponível no momento." />
          </div>
        ) : (
          <>
            <header className={aparencia?.mensagem_boas_vindas ? "mb-2" : "mb-6"}>
              <div className="flex items-center gap-3">
                {logo && (
                  <div className="w-12 h-12 rounded-md overflow-hidden shrink-0 border border-border bg-surface-1">
                    <ImagemStorage src={logo} alt="" prioridade className="w-full h-full object-contain" />
                  </div>
                )}
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold text-text-primary truncate">{tituloExibido}</h1>
                  {(local || insta) && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-tertiary mt-0.5">
                      {local && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} /> {local}
                        </span>
                      )}
                      {insta && (
                        <a href={`https://instagram.com/${encodeURIComponent(insta)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                          <IconeMarca marca="instagram" variante="cor" tamanho={12} /> {insta}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {aparencia?.mensagem_boas_vindas && <p className="text-sm text-text-secondary mt-2">{aparencia.mensagem_boas_vindas}</p>}
            </header>
            <DestaqueVitrine secoes={secoes} />
            {itens.length === 0 ? (
              <div className="bg-surface-1 border border-border rounded-lg">
                <EmptyState icon={BookOpen} title="Nenhum produto disponível no momento" />
              </div>
            ) : (
              <VitrineInterativa nome={nome} slug={slug} itens={itens} negocioWhatsapp={negocioWhatsapp} carrinhoInicial={carrinhoInicial} produtoInicial={produtoInicial} />
            )}
            <SecoesFinaisVitrine secoes={secoes} whatsapp={negocioWhatsapp} />

            <section className="mt-8 rounded-lg border border-border bg-surface-1 p-4 text-sm text-text-secondary flex gap-3">
              <ShieldCheck size={18} className="text-accent shrink-0 mt-0.5" />
              <p>
                <strong className="text-text-primary">Como funciona:</strong> você monta o pedido aqui e envia pelo WhatsApp. A{" "}
                {empresa?.nome_negocio?.trim() || "loja"} confirma disponibilidade, frete e pagamento direto com você antes de qualquer cobrança.
              </p>
            </section>
          </>
        )}
      </div>

      {nome && zap && (
        <a
          href={zap}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar com a loja no WhatsApp"
          className="fixed right-4 bottom-20 sm:bottom-6 z-30 w-12 h-12 rounded-full bg-[#25D366] text-white shadow-elev-2 flex items-center justify-center hover:scale-105 transition-transform"
        >
          <IconeMarca marca="whatsapp" variante="cor" tamanho={24} cor="#FFFFFF" fallback={<MessageCircle size={22} />} />
        </a>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import {
  siAliexpress,
  siEbay,
  siFacebook,
  siInstagram,
  siMercadopago,
  siPinterest,
  siPix,
  siShopee,
  siShopify,
  siTelegram,
  siTiktok,
  siWhatsapp,
  siX,
  siYoutube,
} from "simple-icons";
import { MARCAS, marcaDoNome, type IdMarca } from "@/lib/marcas";

/** Desenhos oficiais (simple-icons). Marca fora daqui vira selo com cor e sigla. */
const DESENHOS: Partial<Record<IdMarca, { path: string }>> = {
  shopee: siShopee,
  tiktok: siTiktok,
  aliexpress: siAliexpress,
  shopify: siShopify,
  ebay: siEbay,
  instagram: siInstagram,
  whatsapp: siWhatsapp,
  facebook: siFacebook,
  youtube: siYoutube,
  pinterest: siPinterest,
  telegram: siTelegram,
  x: siX,
  pix: siPix,
  mercadopago: siMercadopago,
};

/**
 * Ícone de marca (marketplace, rede social, pagamento).
 * - `marca` direto, ou `nome` (do canal/loja) para reconhecer sozinho;
 * - `variante="selo"`: quadrado com a cor da marca e o desenho em branco (listas);
 *   `variante="cor"`: só o desenho na cor da marca (textos, links).
 * Sem marca reconhecida, devolve `fallback` (ou nada).
 */
export function IconeMarca({
  marca,
  nome,
  tamanho = 16,
  variante = "selo",
  className = "",
  fallback = null,
  cor,
}: {
  /** Só na variante "cor": troca a cor do desenho (hex com #). */
  cor?: string;
  marca?: IdMarca | null;
  nome?: string | null;
  tamanho?: number;
  variante?: "selo" | "cor";
  className?: string;
  fallback?: ReactNode;
}) {
  const id = marca ?? marcaDoNome(nome);
  if (!id) return <>{fallback}</>;
  const m = MARCAS[id];
  const desenho = DESENHOS[id];

  if (variante === "cor" && desenho) {
    return (
      <svg role="img" aria-label={m.nome} viewBox="0 0 24 24" width={tamanho} height={tamanho} className={`shrink-0 ${className}`} fill={cor ?? `#${m.cor}`}>
        <title>{m.nome}</title>
        <path d={desenho.path} />
      </svg>
    );
  }

  return (
    <span
      role="img"
      aria-label={m.nome}
      title={m.nome}
      className={`inline-flex items-center justify-center shrink-0 rounded-md font-bold leading-none ${className}`}
      style={{ width: tamanho, height: tamanho, backgroundColor: `#${m.cor}`, color: `#${m.corTexto}`, fontSize: Math.max(7, Math.round(tamanho * (m.sigla.length > 2 ? 0.34 : 0.48))) }}
    >
      {desenho ? (
        <svg viewBox="0 0 24 24" width={Math.round(tamanho * 0.62)} height={Math.round(tamanho * 0.62)} fill={`#${m.corTexto}`} aria-hidden>
          <path d={desenho.path} />
        </svg>
      ) : (
        m.sigla
      )}
    </span>
  );
}

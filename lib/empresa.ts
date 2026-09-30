/**
 * Dados da empresa (Configurações → Conta → Dados da Empresa) que se repetem em imagens e
 * documentos: comprovante, resumo de fiado, precificação, vitrine. Um lugar só para o
 * formato, para o logo e o contato saírem iguais em todo canto.
 */

/** "(11) 98888-7777": só formata o que tem 10 ou 11 dígitos; o resto sai como veio. */
export function formatarTelefone(valor: string | null | undefined): string | null {
  const d = valor?.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "") ?? "";
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor?.trim() || null;
}

/** Linha de contato para rodapé/cabeçalho: WhatsApp (ou telefone) e Instagram. */
export function contatoDoNegocio(
  p: { telefone?: string | null; whatsapp?: string | null; instagram?: string | null } | null | undefined,
): string | null {
  if (!p) return null;
  const fone = formatarTelefone(p.whatsapp) ?? formatarTelefone(p.telefone);
  const insta = p.instagram?.trim() ? `@${p.instagram.trim().replace(/^@/, "")}` : null;
  const partes = [fone, insta].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

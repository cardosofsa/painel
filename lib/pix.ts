/**
 * Pix copia-e-cola (BR Code estático, padrão EMV do Banco Central). Gerado aqui mesmo, sem
 * API nem custo: a chave Pix da loja + o valor da parcela viram o texto que o banco do
 * cliente lê (e o QR é esse mesmo texto). PURO, coberto por `pix.test.ts`.
 *
 * Estático = o banco não avisa o pagamento: a baixa da parcela continua sendo manual.
 */

export interface DadosPix {
  /** Chave Pix: CPF/CNPJ (só dígitos), e-mail, telefone (+55…) ou chave aleatória. */
  chave: string;
  /** Nome do recebedor (até 25 caracteres, sem acento). */
  nome: string;
  /** Cidade do recebedor (qualquer tamanho: `cidadePix` encurta para os 15 do Pix). */
  cidade: string;
  /** Valor em reais. Ausente = o cliente digita o valor. */
  valor?: number | null;
  /** Identificador que aparece no extrato (até 25 letras/números). */
  txid?: string | null;
}

import { cidadePix } from "./pix-chave";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Campo EMV: id (2 dígitos) + tamanho (2 dígitos) + valor. */
function campo(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`;
}

/** CRC16-CCITT (polinômio 0x1021, início 0xFFFF), como exige o manual do BR Code. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Normaliza a chave como o Pix espera: telefone ganha +55, CPF/CNPJ fica só com dígitos,
 * e-mail em minúsculas, chave aleatória como veio.
 */
export function normalizarChavePix(chave: string): string {
  const c = chave.trim();
  if (c.includes("@")) return c.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return c.toLowerCase();
  const digitos = c.replace(/\D/g, "");
  if (c.startsWith("+")) return `+${digitos}`;
  // 11 dígitos pode ser CPF ou celular: com DDD e 9 na terceira posição, tratamos como celular
  // só se veio formatado como telefone ("(11) 9…" / "11 9…"); só dígitos = CPF.
  if (/^\(?\d{2}\)?\s*9/.test(c) && /[()\s-]/.test(c) && digitos.length === 11) return `+55${digitos}`;
  return digitos || c;
}

/** Monta o Pix copia-e-cola. Lança se a chave ou o nome estiverem vazios. */
export function gerarPixCopiaECola(d: DadosPix): string {
  const chave = normalizarChavePix(d.chave);
  if (!chave) throw new Error("Cadastre a chave Pix da loja.");
  const nome = semAcento(d.nome).replace(/[^\w .-]/g, "").trim().slice(0, 25).toUpperCase();
  if (!nome) throw new Error("Cadastre o nome do recebedor do Pix.");
  const cidade = (cidadePix(d.cidade) || "BRASIL").toUpperCase();
  const txid = (d.txid ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  let payload =
    campo("00", "01") +
    campo("26", campo("00", "br.gov.bcb.pix") + campo("01", chave)) +
    campo("52", "0000") +
    campo("53", "986") +
    (d.valor && d.valor > 0 ? campo("54", d.valor.toFixed(2)) : "") +
    campo("58", "BR") +
    campo("59", nome) +
    campo("60", cidade) +
    campo("62", campo("05", txid)) +
    "6304";
  payload += crc16(payload);
  return payload;
}

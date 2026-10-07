/**
 * Tipo da chave Pix, validação e cidade do recebedor. PURO, coberto por `pix-chave.test.ts`.
 *
 * Escolher o tipo antes evita a ambiguidade de "11 dígitos": pode ser CPF ou celular, e o Pix
 * de celular precisa ir como `+55…`. Com o tipo escolhido, a chave é gravada já no formato
 * que o banco espera.
 */

export type TipoChavePix = "cnpj" | "cpf" | "celular" | "email" | "aleatoria";

export const TIPOS_CHAVE_PIX: { id: TipoChavePix; rotulo: string; exemplo: string }[] = [
  { id: "cnpj", rotulo: "CNPJ", exemplo: "00.000.000/0000-00" },
  { id: "cpf", rotulo: "CPF", exemplo: "000.000.000-00" },
  { id: "celular", rotulo: "Celular", exemplo: "(75) 99999-9999" },
  { id: "email", rotulo: "E-mail", exemplo: "loja@email.com" },
  { id: "aleatoria", rotulo: "Aleatória", exemplo: "123e4567-e89b-12d3-a456-426614174000" },
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const so = (s: string) => s.replace(/\D/g, "");

function digitoVerificador(base: string, pesos: number[]): number {
  const soma = base.split("").reduce((t, d, i) => t + Number(d) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const d = so(valor);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const d1 = digitoVerificador(d.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(d.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[9]) && d2 === Number(d[10]);
}

export function cnpjValido(valor: string): boolean {
  const d = so(valor);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const d1 = digitoVerificador(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digitoVerificador(d.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(d[12]) && d2 === Number(d[13]);
}

/** Tipo de uma chave já salva (para abrir o formulário no tipo certo). */
export function detectarTipoChave(chave: string): TipoChavePix {
  const c = chave.trim();
  if (c.includes("@")) return "email";
  if (UUID.test(c)) return "aleatoria";
  if (c.startsWith("+")) return "celular";
  const d = so(c);
  if (d.length === 14) return "cnpj";
  if (d.length === 11 && cpfValido(d)) return "cpf";
  if (d.length === 10 || d.length === 11) return "celular";
  return "cnpj";
}

/** Máscara enquanto digita (só para CPF, CNPJ e celular). */
export function mascararChave(tipo: TipoChavePix, valor: string): string {
  if (tipo === "email" || tipo === "aleatoria") return valor.trim();
  const d = so(valor);
  if (tipo === "cpf") {
    const x = d.slice(0, 11);
    return x.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  if (tipo === "cnpj") {
    const x = d.slice(0, 14);
    return x
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  }
  // Celular: tira o 55 da frente se colaram com o código do país.
  const x = (d.length > 11 && d.startsWith("55") ? d.slice(2) : d).slice(0, 11);
  if (x.length <= 2) return x.length ? `(${x}` : "";
  if (x.length <= 6) return `(${x.slice(0, 2)}) ${x.slice(2)}`;
  if (x.length <= 10) return `(${x.slice(0, 2)}) ${x.slice(2, 6)}-${x.slice(6)}`;
  return `(${x.slice(0, 2)}) ${x.slice(2, 7)}-${x.slice(7)}`;
}

/** Chave no formato do Pix (o que é gravado e vai no copia-e-cola), ou o motivo de não valer. */
export function validarChavePix(tipo: TipoChavePix, valor: string): { ok: true; chave: string } | { ok: false; erro: string } {
  const v = valor.trim();
  if (!v) return { ok: false, erro: "Digite a chave Pix." };
  switch (tipo) {
    case "cpf":
      return cpfValido(v) ? { ok: true, chave: so(v) } : { ok: false, erro: "CPF inválido: confira os números." };
    case "cnpj":
      return cnpjValido(v) ? { ok: true, chave: so(v) } : { ok: false, erro: "CNPJ inválido: confira os números." };
    case "celular": {
      const d = so(v);
      const local = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
      return local.length === 11 && local[2] === "9" ? { ok: true, chave: `+55${local}` } : { ok: false, erro: "Celular com DDD: (75) 99999-9999." };
    }
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 77 ? { ok: true, chave: v.toLowerCase() } : { ok: false, erro: "E-mail inválido." };
    case "aleatoria":
      return UUID.test(v) ? { ok: true, chave: v.toLowerCase() } : { ok: false, erro: "A chave aleatória tem 32 letras e números com 4 traços." };
  }
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e"]);

/**
 * Cidade como cabe no Pix (o Banco Central limita a 15 caracteres): sem acento, e se passar do
 * limite tira primeiro "de/da/do" ("Feira de Santana" → "Feira Santana") e só então corta.
 */
export function cidadePix(cidade: string): string {
  const limpa = semAcento(cidade).replace(/[^\w .-]/g, "").replace(/\s+/g, " ").trim();
  if (limpa.length <= 15) return limpa;
  const sem = limpa
    .split(" ")
    .filter((p, i) => i === 0 || !CONECTIVOS.has(p.toLowerCase()))
    .join(" ");
  return sem.slice(0, 15).trim();
}

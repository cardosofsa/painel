import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cofre das chaves de IA que cada conta cadastra. Código de SERVIDOR.
 *
 * AES-256-GCM com a chave-mestra `IA_CHAVE_COFRE` (32 bytes em base64), que mora só nas
 * variáveis de ambiente — nunca no banco. Quem obtiver só uma cópia do banco vê texto
 * cifrado inútil. O **user_id entra como dado autenticado** (AAD): copiar o texto cifrado
 * de uma conta para a linha de outra faz a decifragem falhar.
 *
 * Formato guardado: `v1.<iv>.<tag>.<dados>` (base64url).
 */

export class ErroCofre extends Error {
  constructor(readonly motivo: "sem_chave_mestra" | "chave_mestra_invalida" | "dado_invalido") {
    super(
      motivo === "sem_chave_mestra"
        ? "O cofre de chaves não está configurado neste sistema (falta IA_CHAVE_COFRE)."
        : motivo === "chave_mestra_invalida"
          ? "A chave-mestra do cofre é inválida (precisa ter 32 bytes em base64)."
          : "Não foi possível ler a chave guardada. Cadastre a IA de novo.",
    );
    this.name = "ErroCofre";
  }
}

const VERSAO = "v1";

function paraB64url(b: Buffer): string {
  return b.toString("base64url");
}

/** Lida dentro da função (não no módulo): um import inocente não pode derrubar o app. */
function chaveMestra(): Buffer {
  const bruta = process.env.IA_CHAVE_COFRE;
  if (!bruta) throw new ErroCofre("sem_chave_mestra");
  const chave = Buffer.from(bruta, "base64");
  if (chave.length !== 32) throw new ErroCofre("chave_mestra_invalida");
  return chave;
}

export function cofreDisponivel(): boolean {
  try {
    chaveMestra();
    return true;
  } catch {
    return false;
  }
}

/** Cifra `texto` ligando-o a `aad` (o id da conta). `mestra` só existe para teste. */
export function cifrar(texto: string, aad: string, mestra: Buffer = chaveMestra()): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", mestra, iv);
  cifra.setAAD(Buffer.from(aad));
  const dados = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return [VERSAO, paraB64url(iv), paraB64url(cifra.getAuthTag()), paraB64url(dados)].join(".");
}

/** Decifra. Qualquer adulteração, `aad` errado ou chave-mestra trocada vira `ErroCofre`. */
export function decifrar(payload: string, aad: string, mestra: Buffer = chaveMestra()): string {
  const [versao, iv, tag, dados] = payload.split(".");
  if (versao !== VERSAO || !iv || !tag || !dados) throw new ErroCofre("dado_invalido");
  try {
    const decifra = createDecipheriv("aes-256-gcm", mestra, Buffer.from(iv, "base64url"));
    decifra.setAAD(Buffer.from(aad));
    decifra.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decifra.update(Buffer.from(dados, "base64url")), decifra.final()]).toString("utf8");
  } catch {
    throw new ErroCofre("dado_invalido");
  }
}

/** "AIzaSy...1a2b" → "1a2b": o que a tela pode mostrar da chave. */
export function finalDaChave(chave: string): string {
  return chave.trim().slice(-4);
}

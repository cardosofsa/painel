import { traduzirErroIA } from "@/lib/erros";

export type CodigoErroIA =
  | "sem_chave"
  | "chave_invalida"
  | "modelo_invalido"
  | "limite_api"
  | "sem_credito"
  | "timeout"
  | "bloqueado_seguranca"
  | "vazio"
  | "servidor"
  | "rede"
  | "desconhecido";

export class ErroIA extends Error {
  constructor(
    readonly codigo: CodigoErroIA,
    readonly detalhe?: string,
  ) {
    super(traduzirErroIA(codigo));
    this.name = "ErroIA";
  }
}

/** Puro. Traduz o status HTTP no nosso código de erro (vale para todos os provedores). */
export function mapearStatusHttp(status: number, corpo: string): CodigoErroIA {
  if (status === 401 || status === 403) return "chave_invalida";
  // Saldo/cota da conta no provedor acabou. Não adianta retentar.
  if (status === 402) return "sem_credito";
  if (status === 404) return "modelo_invalido";
  if (status === 429) return /insufficient_quota|credit|billing/i.test(corpo) ? "sem_credito" : "limite_api";
  if (status === 504) return "timeout";
  if (status >= 500) return "servidor";
  // 400 com chave ruim é comum o suficiente para valer a checagem no corpo.
  if (status === 400 && /api.?key/i.test(corpo)) return "chave_invalida";
  if (status === 400 && /model/i.test(corpo) && /(not found|does not exist|invalid|unknown)/i.test(corpo)) return "modelo_invalido";
  return "desconhecido";
}

import { NextResponse, type NextRequest } from "next/server";

/**
 * Recebe as violações de CSP que o navegador reporta.
 *
 * Existe porque uma CSP quebrada é silenciosa: o script bloqueado some e, em produção,
 * não há console nenhum para olhar. Com isto, a violação aparece no log da Vercel com o
 * prefixo `[csp]` — que é o sinal de que alguma tela parou de funcionar para alguém.
 *
 * Precisa ser pública (o navegador reporta sem sessão), então é superfície aberta. Três
 * limites contra abuso, já que qualquer um pode chamar:
 *  - só POST, e só os content-types que o navegador realmente usa;
 *  - corpo maior que 16 KB é descartado sem ler;
 *  - nada vai para o banco. Só log, que é barato e some sozinho.
 */

const LIMITE_CORPO = 16 * 1024;

const TIPOS_ACEITOS = [
  "application/csp-report", // formato antigo (report-uri), ainda usado pelo Safari
  "application/reports+json", // Reporting API (report-to)
  "application/json",
];

export async function POST(request: NextRequest) {
  const tipo = request.headers.get("content-type") ?? "";
  if (!TIPOS_ACEITOS.some((t) => tipo.includes(t))) {
    return new NextResponse(null, { status: 415 });
  }

  const tamanho = Number(request.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_CORPO) return new NextResponse(null, { status: 413 });

  const texto = await request.text().catch(() => "");
  if (!texto || texto.length > LIMITE_CORPO) return new NextResponse(null, { status: 204 });

  try {
    const corpo = JSON.parse(texto);
    // Os dois formatos entregam campos diferentes; normaliza para uma linha só de log.
    const relatorios = Array.isArray(corpo) ? corpo : [corpo];
    for (const r of relatorios.slice(0, 10)) {
      const c = r["csp-report"] ?? r.body ?? r;
      console.error(
        "[csp] violacao:",
        JSON.stringify({
          diretiva: c["effective-directive"] ?? c.effectiveDirective ?? c["violated-directive"],
          bloqueado: c["blocked-uri"] ?? c.blockedURL,
          pagina: c["document-uri"] ?? c.documentURL,
          origem: c["source-file"] ?? c.sourceFile,
          linha: c["line-number"] ?? c.lineNumber,
        }),
      );
    }
  } catch {
    // Corpo malformado: alguém chamando na mão. Não é violação, não polui o log.
  }

  // 204 sempre: o navegador não faz nada com a resposta, e devolver erro só geraria
  // retentativa.
  return new NextResponse(null, { status: 204 });
}

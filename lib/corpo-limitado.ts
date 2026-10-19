/**
 * Lê o corpo de uma requisição pública com um TETO REAL de bytes. Coberto por
 * `corpo-limitado.test.ts`.
 *
 * `request.text()` carrega o corpo inteiro na memória antes de qualquer conferência, e o
 * `content-length` pode faltar ou mentir (corpo em pedaços). Aqui o `content-length` serve só de
 * recusa rápida; o que vale é a contagem dos bytes que de fato chegam, e a leitura é
 * interrompida (o fluxo é cancelado) assim que passa do teto. `String.length` também não serve
 * de teto: conta unidades UTF-16, não bytes.
 */

export type CorpoLido = { ok: true; texto: string } | { ok: false; motivo: "grande" | "ilegivel" };

export async function lerCorpoLimitado(request: Request, maxBytes: number): Promise<CorpoLido> {
  const declarado = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declarado) && declarado > maxBytes) return { ok: false, motivo: "grande" };
  if (!request.body) return { ok: true, texto: "" };

  const leitor = request.body.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        // Para de receber: o resto do corpo nem chega a ser lido.
        await leitor.cancel().catch(() => undefined);
        return { ok: false, motivo: "grande" };
      }
      pedacos.push(value);
    }
  } catch {
    return { ok: false, motivo: "ilegivel" };
  } finally {
    leitor.releaseLock();
  }

  const junto = new Uint8Array(total);
  let pos = 0;
  for (const p of pedacos) {
    junto.set(p, pos);
    pos += p.byteLength;
  }
  return { ok: true, texto: new TextDecoder().decode(junto) };
}

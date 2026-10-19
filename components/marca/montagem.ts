/**
 * Junta as capas numa única imagem (grade de até 3 colunas) NO NAVEGADOR, para a IA olhar
 * todas de uma vez com uma só chamada. Cada capa é baixada como arquivo (fetch → blob), então
 * o canvas não fica "contaminado" por imagem de outra origem.
 */
const CELULA = 512;

export async function montarMontagem(urls: string[]): Promise<Blob> {
  if (urls.length === 0) throw new Error("Envie pelo menos uma capa.");
  const imagens = await Promise.all(
    urls.map(async (url) => {
      const r = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (!r.ok) throw new Error("Não consegui abrir uma das capas.");
      return createImageBitmap(await r.blob());
    }),
  );
  return juntar(imagens);
}

/**
 * A mesma montagem a partir de arquivos que ainda estão no navegador (as imagens do chat). Não
 * passa por `fetch`: a CSP não deixa buscar `blob:`.
 */
export async function montarMontagemDeArquivos(arquivos: Blob[]): Promise<Blob> {
  if (arquivos.length === 0) throw new Error("Envie pelo menos uma imagem.");
  const imagens = await Promise.all(arquivos.map((a) => createImageBitmap(a).catch(() => Promise.reject(new Error("Não consegui abrir uma das imagens.")))));
  return juntar(imagens);
}

function juntar(imagens: ImageBitmap[]): Promise<Blob> {
  const colunas = imagens.length === 1 ? 1 : imagens.length <= 4 ? 2 : 3;
  const linhas = Math.ceil(imagens.length / colunas);
  const canvas = document.createElement("canvas");
  canvas.width = colunas * CELULA;
  canvas.height = linhas * CELULA;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu preparar as imagens.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  imagens.forEach((img, i) => {
    const escala = Math.min(CELULA / img.width, CELULA / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.drawImage(img, (i % colunas) * CELULA + (CELULA - w) / 2, Math.floor(i / colunas) * CELULA + (CELULA - h) / 2, w, h);
    img.close();
  });

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não consegui juntar as imagens."))), "image/jpeg", 0.85));
}

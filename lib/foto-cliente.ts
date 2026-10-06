/**
 * Reduz a foto no NAVEGADOR antes de mandar para a IA: lado maior ≤ `maxLado` px, JPEG.
 * Foto de celular (4–12 MB) não cabe no limite de 1 MB das Server Actions e a IA lê a nota
 * igual com 1600 px. Só para uso em Client Component (usa canvas).
 */
export async function reduzirFoto(file: File, maxLado = 1600, qualidade = 0.8): Promise<{ base64: string; mime: "image/jpeg" }> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu preparar a foto.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  let q = qualidade;
  let url = canvas.toDataURL("image/jpeg", q);
  // Ainda grande (foto muito detalhada): baixa a qualidade até caber.
  while (url.length > 900_000 && q > 0.4) {
    q -= 0.15;
    url = canvas.toDataURL("image/jpeg", q);
  }
  return { base64: url.slice(url.indexOf(",") + 1), mime: "image/jpeg" };
}

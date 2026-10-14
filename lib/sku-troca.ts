/**
 * Trocar o SKU de um produto já cadastrado. PURO, coberto por `sku-troca.test.ts`.
 * O SKU é a "chave" com que o produto é achado (anúncios, NF-e, planilhas, ERP), então a tela
 * pede confirmação antes de gravar uma troca.
 */

/** O SKU realmente mudou? Espaço nas pontas não conta (o servidor também apara). */
export function skuMudou(antes: string, depois: string): boolean {
  return antes.trim() !== depois.trim();
}

/** Texto da confirmação: de onde para onde, e o que pode ser afetado. */
export function textoConfirmacaoSku(antes: string, depois: string): { titulo: string; mensagem: string } {
  return {
    titulo: "Alterar o SKU?",
    mensagem:
      `O SKU deste produto vai de "${antes.trim()}" para "${depois.trim()}". ` +
      "Os anúncios que já estão ligados a ele continuam ligados. " +
      "Mas importação de NF-e, planilhas e o que você já passou a fornecedores ou a outro sistema com o SKU antigo deixam de achar este produto.",
  };
}

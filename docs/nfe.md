# NF-e no Sertão

Fase 11.7, migração `0062_fiscal_nfe.sql`.

## Etapa Emitir

Ao avançar um pedido em **Para Emitir**, o Sertão pergunta o que gerar:
- **Comprovante do sistema:** não fiscal. O pedido segue para Para Enviar na hora.
- **NF-e:** nota fiscal pelo emissor. Quando a Sefaz autoriza, o pedido segue para Para Enviar e o DANFE abre para imprimir.

Em **Configurações → Fiscal** você escolhe o padrão por canal: PDV com entrega e catálogo. As opções são comprovante, NF-e ou "perguntar sempre".

Fora da etapa Emitir, o menu ⋮ do pedido mostra:
- **Emitir NF-e…:** para pedidos que já passaram de Emitir;
- **Atualizar NF-e:** quando a Sefaz ainda está processando;
- **Ver DANFE.**

## Custos

- Emitir na Sefaz não tem custo.
- **Certificado digital A1:** cerca de R$ 150 a 250 por ano. É obrigatório.
- **Emissor por API (Focus NFe):** a partir de cerca de R$ 30 a 100 por mês, conforme o volume.

Confira os preços atuais no site de cada um.

## Ligar

1. Com o contador, confirme:
   - se a inscrição estadual está habilitada para NF-e na Sefaz;
   - o regime (CRT);
   - CFOP, CSOSN e CST de PIS/COFINS.
2. No **Focus NFe**:
   1. Crie a conta e cadastre a empresa.
   2. Envie o certificado A1 (arquivo .pfx e senha). O certificado fica no emissor, não no Sertão.
   3. Copie o token da API, de homologação ou de produção.
3. Em **Sertão → Configurações → Fiscal**:
   1. Cole o token (só ali).
   2. Escolha o ambiente. Comece em **Homologação**: as notas de teste não têm valor fiscal.
   3. Preencha série, inscrição estadual e regras.
4. Em **Produtos**, preencha o **NCM** (8 dígitos) e a origem de cada produto vendido com nota.
5. Nos **clientes**, preencha o **CPF/CNPJ**. Para entrega, preencha também o endereço completo.

Antes de chamar o emissor, o Sertão mostra o que falta: NCM, documento do cliente, endereço, CNPJ ou UF da empresa.

## Limites desta versão

- Só NF-e modelo 55. A NFC-e (cupom do balcão) não está incluída.
- Pedidos de marketplace (Shopee e Mercado Livre) ainda não emitem nota pelo Sertão.
- Cancelamento e carta de correção são feitos pelo painel do emissor.

# Mercado Livre: ligar a API

A integração (Fase 10.8) funciona como a da Shopee:
- os pedidos entram sozinhos em Vendas, com a margem real (tarifa de venda e frete do vendedor);
- reservam e baixam o estoque pela esteira;
- geram o repasse no Financeiro;
- o estoque do Sertão é enviado aos anúncios;
- a etiqueta do Mercado Envios sai em **Para Imprimir**.

## 1. Criar o app no Mercado Livre

1. Entre em **developers.mercadolivre.com.br** com a conta de vendedor e vá em **Minhas aplicações → Criar aplicação**.
2. Preencha:
   - **URI de redirect:** `https://SEU-DOMINIO/api/mercadolivre/callback`. Tem que ser exatamente esta URI.
   - **Escopos:** leitura e escrita (`read`, `write`) e `offline_access`, que dá o refresh token.
   - **Tópicos de notificação:** `orders_v2` e `shipments`.
   - **URL de notificações:** `https://SEU-DOMINIO/api/mercadolivre/notificacoes`.
3. Copie o **App ID** (client_id) e a **Secret Key** (client_secret).

## 2. Variáveis na Vercel

| Variável | Valor |
|---|---|
| `ML_CLIENT_ID` | App ID |
| `ML_CLIENT_SECRET` | Secret Key, **só na Vercel**: nunca cole em conversas ou e-mails |

Também precisam estar configuradas:
- `IA_CHAVE_COFRE`: cifra os tokens;
- `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET`: sincronização automática e notificações.

Depois faça o **Redeploy**.

## 3. Banco

Aplique `0056_mercado_livre.sql` no Supabase, duas vezes. As tabelas de marketplace já servem às duas plataformas. A migração só:
- faz cada pedido herdar a plataforma da conexão da loja;
- cria o índice usado pelas notificações.

## 4. Conectar

Em **Configurações → Canais de venda → Conectar marketplace → Mercado Livre**:
1. Escolha o canal e a loja.
2. Entre com a conta do vendedor e autorize.
3. A loja aparece como conectada. Use **Sincronizar** para puxar os pedidos agora.

## Como cada pedido anda

| Mercado Livre | Sertão |
|---|---|
| Pagamento pendente | Aguardando pagamento |
| Pago, envio em preparação (`handling`) | Para Enviar (estoque **reservado**) |
| `ready_to_ship` / `ready_to_print` | Para Imprimir (estoque **baixado**) → "Imprimir etiqueta" |
| `ready_to_ship` / `printed` | Para Retirada |
| `shipped` | Enviado |
| `delivered` | Concluído |
| Cancelado | Cancelado (reserva liberada ou baixa estornada) |

Diferenças em relação à Shopee:
- No Mercado Livre não existe "programar envio": a etiqueta fica disponível assim que o ML libera.
- Os custos do pedido:
  - **comissão** = soma da `sale_fee` de cada item × a quantidade;
  - **frete do vendedor** = custo do remetente no envio (`/shipments/{id}/costs`), lançado como taxa;
  - **repasse** = subtotal − comissão − frete.

## Limites conhecidos

- **Mercado Envios Full:** o estoque fica no galpão do ML, mas o Sertão também baixa do estoque da loja. Use um armazém próprio para o Full, ou não vincule esses anúncios, até haver um tratamento específico.
- **Envio próprio** (sem Mercado Envios): o pedido entra normalmente, mas não há etiqueta do ML.
- As notificações leem o pedido de novo na API com o token da loja. Um aviso falso, no máximo, faz o Sertão reler um pedido de verdade.

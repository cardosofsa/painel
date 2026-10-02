# Planos e assinatura

Fase 10.9, migração `0057_planos_assinaturas.sql`.

## Como funciona hoje (sem provedor de cobrança)

- **Conta nova:** 14 dias de teste do **Pro**.
- **Contas que já existiam:** ficam **ativas no Pro**, para ninguém perder acesso com a migração.
- **Teste ou período pago vencido** (ou pagamento atrasado há mais de 7 dias): passa a valer o **Grátis**. A conta não é bloqueada, só fica com os limites menores.
- **Configurações → Plano:** mostra o plano atual, o uso e os planos disponíveis. **Assinar** registra o pedido.
- **Admin:**
  - os pedidos aparecem no topo da página;
  - em cada conta, o card **Plano e assinatura** permite ativar (com a data "Pago até"), estender o teste ou rebaixar.
  - Tudo fica no histórico.
- **Preço e limites:** o master edita em **Configurações** (Planos). Um limite em branco significa ilimitado.

## Limites aplicados

| Limite | Onde é conferido |
|---|---|
| Produtos | No banco, ao cadastrar (gatilho) |
| Lojas conectadas à API (Shopee/ML) | No banco, ao conectar (gatilho) |
| Gerações de IA por mês | Antes de cada geração (`plano_permite_ia`) |
| Usuários | Guardado para quando houver equipe por conta |

## Ligar um provedor (Mercado Pago, Asaas, Stripe…)

1. Implementar `ProvedorCobranca` (`lib/cobranca/index.ts`):
   - `criarCheckout`: devolve a URL de pagamento;
   - `interpretarWebhook`: valida a assinatura do evento e devolve conta, plano, status e fim do período.
2. Fazer `provedorCobranca()` devolver essa implementação quando as variáveis do provedor existirem.
3. Cadastrar no provedor o webhook `https://SEU-DOMINIO/api/cobranca/webhook`. Ele já grava a assinatura com a service key.

Com isso, "Assinar" passa a levar direto ao pagamento, e nenhuma tela precisa mudar.
